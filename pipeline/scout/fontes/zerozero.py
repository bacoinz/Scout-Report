"""zerozero.pt: ficha do jogador (pé, altura, nascimento, situação, número) e épocas (jogos, golos e assistências
em todas as competições, clube a clube). Os ids vêm da Wikidata (P3047). 1 pedido a cada 2–3 s, com cache."""
import re

from selectolax.lexbor import LexborHTMLParser

from .. import config
from ..normalizar import ler_epoca


def pagina_principal(cliente, zz_id, fresco: bool = False) -> str:
    return cliente.texto(f"{config.ZEROZERO}/jogador.php", {"id": str(zz_id)}, fresco=fresco)


def pagina_epocas(cliente, zz_id, fresco: bool = False) -> str:
    return cliente.texto(f"{config.ZEROZERO}/jogador/x/{zz_id}/epocas", fresco=fresco)


def _int(texto: str) -> int | None:
    t = (texto or "").strip()
    return int(t) if t.isdigit() else None


# Equipas jovens no zerozero: "Benfica[Jun.D S13]", "Portugal[S21]".
_JOVEM = re.compile(r"\[(?:jun|juv|ini|inf|esc|s\d{2}|sub|u\d{2}|olímp|olimp)", re.I)


def jovem(nome: str) -> bool:
    return bool(_JOVEM.search(nome or ""))


# Posições do zerozero → códigos de partilhado/perguntas.json.
POSICOES = {"guarda-redes": "GR", "defesa central": "DC", "lateral direito": "LD", "lateral esquerdo": "LE",
            "defesa direito": "LD", "defesa esquerdo": "LE", "ala direito": "LD", "ala esquerdo": "LE",
            "médio defensivo": "MDC", "médio centro": "MC", "médio ofensivo": "MO", "médio direito": "MD",
            "médio esquerdo": "ME", "extremo direito": "ED", "extremo esquerdo": "EE", "segundo avançado": "SA",
            "ponta de lança": "PL", "avançado": "PL", "avançado centro": "PL", "2.º avançado": "SA",
            "2º avançado": "SA", "trinco": "MDC", "médio-centro": "MC", "defesa-central": "DC"}


def perfil(html: str) -> dict:
    """{'pe': direito|esquerdo|ambos|None, 'altura_cm', 'nascimento', 'situacao', 'numero', 'posicoes': [códigos]}."""
    arvore = LexborHTMLParser(html)
    pares, posicoes = {}, []
    for linha in arvore.css(".card-data__row"):
        rotulo = linha.css_first(".card-data__label")
        valores = [v.text(separator=" ", strip=True) for v in linha.css(".card-data__value")]
        if rotulo is not None and valores:
            pares[rotulo.text(strip=True).lower()] = " / ".join(valores)
            if rotulo.text(strip=True).lower() == "posição":
                posicoes = [POSICOES[v.lower()] for v in valores if v.lower() in POSICOES]
    if not pares:                                    # recurso: texto corrido "Rótulo Valor"
        texto = arvore.body.text(separator=" ", strip=True) if arvore.body else ""
        for r in ("pé preferencial", "altura / peso", "situação", "data de nascimento"):
            m = re.search(rf"{r}\s+([^|]{{1,60}}?)\s+(?=[A-ZÁÉÍÓÚ][a-záéíóúç]+ )", texto, re.I)
            if m:
                pares[r] = m.group(1)
    pe = (pares.get("pé preferencial") or "").lower()
    pe = "direito" if pe.startswith("dir") else "esquerdo" if pe.startswith("esq") else "ambos" if pe.startswith("amb") else None
    altura = re.search(r"(\d{3})\s*cm", pares.get("altura / peso") or pares.get("altura") or "")
    nascimento = re.search(r"\d{4}-\d{2}-\d{2}", pares.get("data de nascimento") or "")
    numero = arvore.css_first(".number")
    n = re.match(r"\s*(\d{1,2})\.", numero.text() if numero else "")
    return {"pe": pe, "altura_cm": int(altura.group(1)) if altura else None,
            "nascimento": nascimento.group() if nascimento else None,
            "situacao": pares.get("situação"), "numero": int(n.group(1)) if n else None,
            "posicoes": list(dict.fromkeys(posicoes))}


def epocas(html: str) -> dict:
    """{'clubes': [{'epoca', 'texto', 'clube', 'jogos', 'golos', 'assistencias'}], 'selecoes': [...]}.
    Assistências None quando o zerozero mostra "-" (sem registo nessa época)."""
    arvore = LexborHTMLParser(html)
    clubes, selecoes = [], []
    for tabela in arvore.css("table.zztable"):
        linhas = tabela.css("tr")
        if not linhas:
            continue
        cab = [c.text(strip=True).lower() for c in linhas[0].css("td, th")]
        if "época" in cab and "clube" in cab:
            i_ep, i_cl = cab.index("época"), cab.index("clube")
            i_j, i_g, i_a = cab.index("j"), cab.index("gm"), cab.index("ast")
            anterior = None                      # 2.º clube na mesma época: a célula da época vem vazia
            for tr in linhas[1:]:
                c = [x.text(strip=True) for x in tr.css("td, th")]
                if len(c) <= i_a or not c[i_cl]:          # sem clube = linha de totais
                    continue
                texto_ep = c[i_ep] or anterior
                anterior = texto_ep
                if ler_epoca(texto_ep) is None or jovem(c[i_cl]):
                    continue
                clubes.append({"epoca": ler_epoca(texto_ep), "texto": texto_ep, "clube": c[i_cl],
                               "jogos": _int(c[i_j]) or 0, "golos": _int(c[i_g]) or 0, "assistencias": _int(c[i_a])})
        elif "seleção" in cab:
            i_s, i_j, i_g, i_a = cab.index("seleção"), cab.index("j"), cab.index("gm"), cab.index("ast")
            for tr in linhas[1:]:
                c = [x.text(strip=True) for x in tr.css("td, th")]
                if len(c) <= i_a or not c[i_s] or jovem(c[i_s]) or "[" in c[i_s]:     # [Olímpicos], [B]
                    continue
                selecoes.append({"selecao": c[i_s], "jogos": _int(c[i_j]) or 0, "golos": _int(c[i_g]) or 0,
                                 "assistencias": _int(c[i_a])})
    return {"clubes": clubes, "selecoes": selecoes}
