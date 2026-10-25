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
    """{'clubes': [{'epoca', 'texto', 'clube', 'jogos', 'golos', 'assistencias', 'plantel'}], 'selecoes': [...],
    'slug'}. Assistências None quando o zerozero mostra "-" (sem registo nessa época). 'plantel' é a ligação para o
    plantel do clube nessa época (com os números de camisola); 'slug' é o nome do jogador nos endereços."""
    arvore = LexborHTMLParser(html)
    clubes, selecoes = [], []
    detalhe = arvore.css_first('a[href*="/jogos?epoca_id="]')
    slug = re.search(r"/jogador/([^/?]+)(?:/\d+)?/jogos", detalhe.attributes.get("href", "")) if detalhe else None
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
                celulas = tr.css("td, th")
                c = [x.text(strip=True) for x in celulas]
                if len(c) <= i_a or not c[i_cl]:          # sem clube = linha de totais
                    continue
                texto_ep = c[i_ep] or anterior
                anterior = texto_ep
                if ler_epoca(texto_ep) is None or jovem(c[i_cl]):
                    continue
                ligacao = celulas[i_cl].css_first('a[href^="/equipa/"]')
                clubes.append({"epoca": ler_epoca(texto_ep), "texto": texto_ep, "clube": c[i_cl],
                               "jogos": _int(c[i_j]) or 0, "golos": _int(c[i_g]) or 0, "assistencias": _int(c[i_a]),
                               "plantel": ligacao.attributes.get("href") if ligacao else None})
        elif "seleção" in cab:
            i_s, i_j, i_g, i_a = cab.index("seleção"), cab.index("j"), cab.index("gm"), cab.index("ast")
            for tr in linhas[1:]:
                c = [x.text(strip=True) for x in tr.css("td, th")]
                if len(c) <= i_a or not c[i_s] or jovem(c[i_s]) or "[" in c[i_s]:     # [Olímpicos], [B]
                    continue
                selecoes.append({"selecao": c[i_s], "jogos": _int(c[i_j]) or 0, "golos": _int(c[i_g]) or 0,
                                 "assistencias": _int(c[i_a])})
    return {"clubes": clubes, "selecoes": selecoes, "slug": slug.group(1) if slug else None}


def pagina_plantel(cliente, caminho: str, fresco: bool = False) -> str:
    """Plantel de um clube numa época: '/equipa/manchester-united?epoca_id=138' (a ligação da tabela de épocas)."""
    return cliente.texto(f"{config.ZEROZERO}{caminho}", fresco=fresco)


_ID_EDICAO = re.compile(r"id_edicao=(\d+)")
_ID_COMPETICAO = re.compile(r"compet_id_jogos=(\d+)")
_POSICAO = re.compile(r"^\d+\.?º$")


def classificacoes(html: str) -> list[dict]:
    """O bloco "Classificações <época>" do plantel de um clube: as competições em que a equipa jogou nessa época, pela
    ordem do zerozero. [{'seccao': 'Competições Oficiais', 'posicao': '4º', 'liga': True, 'edicao': 'Liga Portuguesa
    95/96', 'id_edicao': '…', 'competicao': '3', 'pais': 'PT'}]. 'competicao' é o id da competição no zerozero, o
    mesmo em todas as épocas e nomes ("I Divisão", "SuperLiga", "bwin LIGA" são todas a 3). 'liga' é True quando a
    equipa tem uma classificação ("4º") e não uma fase ("QF", "1/8"); as taças também a têm para o vencedor e o
    finalista, por isso quem decide o que é liga é o mapa das competições."""
    arvore = LexborHTMLParser(html)
    titulo = next((h for h in arvore.css("h2.card-data__title") if h.text(strip=True).startswith("Classificações")), None)
    if titulo is None or titulo.parent is None or titulo.parent.parent is None:
        return []
    corpo = titulo.parent.parent.css_first(".card-data__body")
    if corpo is None:
        return []
    seccao, linhas = None, []
    for no in corpo.traverse():
        classes = (no.attributes.get("class") or "").split()
        if no.tag == "div" and "section" in classes:
            seccao = no.text(strip=True)
        elif no.tag == "div" and "season" in classes:
            numero = no.css_first(".number")
            edicao = no.css_first('a[href*="id_edicao="]')
            if edicao is None:
                continue
            jogos = no.css_first('a[href*="compet_id_jogos="]')
            bandeira = no.css_first('span[class^="flag:"]')
            posicao = numero.text(strip=True) if numero else ""
            id_edicao = _ID_EDICAO.search(edicao.attributes.get("href") or "")
            competicao = _ID_COMPETICAO.search(jogos.attributes.get("href") or "") if jogos else None
            linhas.append({"seccao": seccao, "posicao": posicao, "liga": bool(_POSICAO.match(posicao)),
                           "edicao": edicao.text(strip=True), "id_edicao": id_edicao.group(1) if id_edicao else None,
                           "competicao": competicao.group(1) if competicao else None,
                           "pais": bandeira.attributes["class"].split(":", 1)[1] if bandeira else None})
    return linhas


def numero_no_plantel(html: str, zz_id, slug: str | None) -> int | None:
    """Número de camisola do jogador no plantel ('<div class="staff"><div class="number">7</div>… <a
    href="/jogador/cristiano-ronaldo?epoca_id=138">'). As ligações trazem o slug e às vezes o id."""
    for staff in LexborHTMLParser(html).css(".staff"):
        numero = staff.css_first(".number")
        ligacao = staff.css_first('a[href^="/jogador/"]')
        if numero is None or ligacao is None:
            continue
        partes = ligacao.attributes.get("href", "").split("?")[0].strip("/").split("/")[1:]   # [slug, id?]
        e_ele = (len(partes) > 1 and partes[1] == str(zz_id)) or (len(partes) == 1 and slug and partes[0] == slug)
        n = _int(numero.text(strip=True))
        if e_ele and n and 1 <= n <= 99:
            return n
    return None
