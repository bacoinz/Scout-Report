"""Sementes: quem entra na base (dados/candidatos.json).

| Categoria | Como |
|---|---|
| Bola de Ouro top 30 | tabelas das páginas "{ano} Ballon d'Or" / "{ano} FIFA Ballon d'Or" (1996 em diante) |
| Seleção ≥ 10 | Category:Portugal men's international footballers + caixa (internacionalizações, anos ≥ 1996) |
| Três grandes ≥ 50 | Category:S.L. Benfica footballers / FC Porto players / Sporting CP footballers + caixa (passagem que toque
|                   | 1996+; jogos de campeonato) e, quando a caixa fica perto do limiar, os jogos em todas as competições do zerozero |
| Míticos | dados/miticos.json, depois de aprovados |

As passagens comparam-se pelo QID do clube (o Sporting CP não se confunde com o Sporting de Gijón)."""
import json
import re

from . import config
from .fontes import wikidata as wd
from .fontes import wikipedia as wp
from .fontes import zerozero as zz
from .normalizar import reserva, semelhanca_clube

DESDE = 1996
GRANDES = {"benfica": ("S.L. Benfica", "Category:S.L. Benfica footballers", "Benfica"),
           "porto": ("FC Porto", "Category:FC Porto players", "FC Porto"),
           "sporting": ("Sporting CP", "Category:Sporting CP footballers", "Sporting")}
SELECAO = ("Portugal national football team", "Category:Portugal men's international footballers")
MINIMO_SELECAO, MINIMO_GRANDES = 10, 50
# Abaixo disto (jogos de campeonato na caixa) não se chega a 50 em todas as competições; acima de 50, já chega.
LIGA_DUVIDA = 25


def membros(cliente, categoria: str) -> list[str]:
    """Artigos (espaço principal) de uma categoria, seguindo as continuações."""
    res, params = [], {"action": "query", "list": "categorymembers", "cmtitle": categoria, "cmnamespace": "0",
                       "cmlimit": "500"}
    while True:
        dados = cliente.api(config.WIKIPEDIA_API, params)
        res += [m["title"] for m in dados.get("query", {}).get("categorymembers", [])]
        if "continue" not in dados:
            return res
        params = {**params, **dados["continue"]}


# --- Bola de Ouro ---------------------------------------------------------------------------------------------------

_SECAO_BOLA = re.compile(r"ballon d'or$|ranking|voted players|winners and nominees|results|^fifa ballon d'or$", re.I)
_SECAO_OUTRA = re.compile(r"féminin|feminin|women|kopa|yashin|müller|muller|sócrates|socrates|coach|club of the year|"
                          r"puskás|puskas|world xi|fair play|presidential|controversy", re.I)


def titulo_bola(ano: int) -> str:
    return f"{ano} FIFA Ballon d'Or" if 2010 <= ano <= 2015 else f"{ano} Ballon d'Or"


def _jogador(celula: str) -> str | None:
    """Artigo do jogador numa célula: a ligação, ou a predefinição {{sortname|Lionel|Messi|ligação|dab=…}}."""
    import mwparserfromhell as mwp
    codigo = mwp.parse(celula)
    for t in codigo.filter_templates(recursive=True):
        if str(t.name).strip().lower() == "sortname" and t.has(1) and t.has(2):
            if t.has(3) and str(t.get(3).value).strip():
                return str(t.get(3).value).strip()
            nome = f"{str(t.get(1).value).strip()} {str(t.get(2).value).strip()}"
            return f"{nome} ({str(t.get('dab').value).strip()})" if t.has("dab") else nome
    titulo, _ = wp.primeira_ligacao(celula)
    return titulo


def _sem_outros_premios(corpo: str) -> str:
    """O texto de uma secção sem as subsecções dos outros prémios (feminino, treinadores, Puskás…)."""
    for nivel, titulo, sub in wp.secoes(corpo)[1:]:
        if _SECAO_OUTRA.search(titulo):
            corpo = corpo.replace(sub, "")
    return corpo


def classificacao_bola(texto: str, maximo: int = 30) -> list[tuple[int, str]]:
    """[(lugar, artigo do jogador)] das tabelas da Bola de Ouro (lugares ≤ maximo; empates com o mesmo lugar)."""
    res, vistos = [], set()
    for nivel, titulo, corpo in wp.secoes(texto):
        if not _SECAO_BOLA.search(titulo) or _SECAO_OUTRA.search(titulo):
            continue
        for tabela in wp._TABELA.finditer(_sem_outros_premios(corpo)):
            linhas = wp._grelha(tabela.group(1))
            cab = next((l for c, l in linhas if c and any(wp.limpo(x).lower().startswith("player") for x in l)), None)
            if not cab or not re.search(r"\b(rank|pos)", wp.limpo(cab[0]), re.I):
                continue
            i_jogador = next(i for i, x in enumerate(cab) if wp.limpo(x).lower().startswith("player"))
            for cabecalho, linha in linhas:
                if cabecalho or len(linha) <= i_jogador:
                    continue
                lugar = re.search(r"\d+", wp.limpo(linha[0]))
                if not lugar or int(lugar.group()) > maximo:
                    continue
                jogador = _jogador(linha[i_jogador])
                if jogador and jogador not in vistos:
                    vistos.add(jogador)
                    res.append((int(lugar.group()), jogador))
    return res


def bola_de_ouro(cliente, anos=None) -> dict:
    """{artigo: {'melhor': lugar, 'edicoes': {ano: lugar}}} para os top 30 das edições de 1996 em diante."""
    anos = list(anos or range(DESDE, config.ANO_ATUAL + 1))
    info = wp.info_titulos(cliente, [titulo_bola(a) for a in anos])
    existentes = {a: info[titulo_bola(a)]["titulo"] for a in anos if info[titulo_bola(a)]["existe"]}
    textos = wp.wikitextos(cliente, existentes.values())
    res = {}
    for ano, titulo in sorted(existentes.items()):
        for lugar, jogador in classificacao_bola(textos.get(titulo, {}).get("texto", "")):
            d = res.setdefault(jogador, {"melhor": lugar, "edicoes": {}})
            d["edicoes"][ano] = lugar
            d["melhor"] = min(d["melhor"], lugar)
    return res


# --- Seleção e três grandes -------------------------------------------------------------------------------------------

def _caixas(cliente, titulos) -> dict:
    """{artigo pedido: carreira da caixa} (só os que têm caixa de futebol)."""
    info = wp.info_titulos(cliente, titulos)
    textos = wp.wikitextos(cliente, {v["titulo"] for v in info.values() if v["existe"]})
    res = {}
    for t, v in info.items():
        caixa = wp.caixa_futebol(textos.get(v["titulo"], {}).get("texto", "")) if v["existe"] else None
        if caixa:
            res[t] = wp.carreira(caixa)
    return res


def _toca_desde(p: dict) -> bool:
    return (p["fim"] or config.ANO_ATUAL) >= DESDE


def internacionais(cliente, registar=print) -> dict:
    """{artigo: internacionalizações por Portugal} com ≥ 10 e anos na seleção a tocar 1996+."""
    canon = wp.info_titulos(cliente, [SELECAO[0]])[SELECAO[0]]["titulo"]
    titulos = membros(cliente, SELECAO[1])
    registar(f"Seleção: {len(titulos)} artigos na categoria")
    res = {}
    for t, car in _caixas(cliente, titulos).items():
        caps = sum(s["jogos"] or 0 for s in car["selecoes"]
                   if s["senior"] and s["titulo"] in (canon, SELECAO[0]) and _toca_desde(s))
        if caps >= MINIMO_SELECAO:
            res[t] = caps
    return res


def grandes(cliente, registar=print) -> dict:
    """{artigo: {clube: jogos}} para quem tem ≥ 50 jogos (todas as competições) num dos três grandes, com uma passagem
    a tocar 1996+. Os jogos saem da caixa (campeonato) e, perto do limiar, do zerozero (todas as competições)."""
    qid_clube = {k: wp.info_titulos(cliente, [v[0]])[v[0]]["qid"] for k, v in GRANDES.items()}
    titulos = {k: membros(cliente, v[1]) for k, v in GRANDES.items()}
    registar("Três grandes: " + ", ".join(f"{k} {len(v)}" for k, v in titulos.items()) + " artigos nas categorias")
    caixas = _caixas(cliente, {t for v in titulos.values() for t in v})
    # QID de cada clube das caixas, para comparar sem confundir nomes.
    links = {p["titulo"] for car in caixas.values() for p in car["clubes"] if p["titulo"]}
    qids = {t: v["qid"] for t, v in wp.info_titulos(cliente, links).items()}
    res, duvidas = {}, []
    for clube, ts in titulos.items():
        for t in ts:
            car = caixas.get(t)
            if not car:
                continue
            passagens = [p for p in car["clubes"] if qids.get(p["titulo"]) == qid_clube[clube]]
            if not passagens or not any(_toca_desde(p) for p in passagens):
                continue
            liga = sum(p["jogos_liga"] or 0 for p in passagens)
            if liga >= MINIMO_GRANDES:
                res.setdefault(t, {})[clube] = liga
            elif liga >= LIGA_DUVIDA:
                duvidas.append((t, clube, liga))
    registar(f"Três grandes: {len(res)} jogadores pela caixa; {len(duvidas)} perto do limiar, a ver no zerozero")
    if duvidas:
        ents = wd.entidades(cliente, {v["qid"] for v in wp.info_titulos(cliente, {t for t, _, _ in duvidas}).values()
                                      if v["qid"]}, props="claims|sitelinks", lote_max=10)
        zz_de = {wd.titulo_enwiki(e): next((wd.valor(c) for c in wd.afirmacoes(e, "P3047")), None) for e in ents.values()}
        for t, clube, liga in duvidas:
            canon = wp.info_titulos(cliente, [t])[t]["titulo"]
            zz_id = zz_de.get(canon)
            if not zz_id:
                continue
            try:
                epocas = zz.epocas(zz.pagina_epocas(cliente, zz_id))["clubes"]
            except Exception:                            # noqa: BLE001 — sem zerozero fica a caixa
                continue
            nome = GRANDES[clube][2]
            jogos = sum(e["jogos"] for e in epocas if not reserva(e["clube"]) and semelhanca_clube(e["clube"], nome) >= 1)
            if jogos >= MINIMO_GRANDES:
                res.setdefault(t, {})[clube] = jogos
    return res


# --- Juntar -----------------------------------------------------------------------------------------------------------

def gerar(cliente, registar=print) -> dict:
    """{QID: {'titulo', 'categorias', 'bola_de_ouro', 'internacionalizacoes', 'grandes', 'conhecido', 'diario'}}."""
    bola = bola_de_ouro(cliente)
    registar(f"Bola de Ouro: {len(bola)} jogadores no top 30 ({DESDE}–{config.ANO_ATUAL})")
    selecao = internacionais(cliente, registar)
    registar(f"Seleção: {len(selecao)} jogadores com ≥ {MINIMO_SELECAO} internacionalizações desde {DESDE}")
    clubes = grandes(cliente, registar)
    registar(f"Três grandes: {len(clubes)} jogadores com ≥ {MINIMO_GRANDES} jogos")
    miticos = json.loads((config.DADOS / "miticos.json").read_text(encoding="utf-8")) \
        if (config.DADOS / "miticos.json").exists() else []
    titulos = set(bola) | set(selecao) | set(clubes) | set(miticos)
    info = wp.info_titulos(cliente, titulos)
    res = {}
    for t in sorted(titulos):
        q = info[t]["qid"]
        if not q:
            registar(f"  sem QID: {t}")
            continue
        d = res.setdefault(q, {"titulo": info[t]["titulo"], "categorias": []})
        if t in bola:
            d["categorias"].append("bola_de_ouro")
            d["bola_de_ouro"] = {"melhor": bola[t]["melhor"], "edicoes": bola[t]["edicoes"]}
        if t in selecao:
            d["categorias"].append("selecao")
            d["internacionalizacoes"] = selecao[t]
        if t in clubes:
            d["categorias"].append("grandes")
            d["grandes"] = clubes[t]
        if t in miticos:
            d["categorias"].append("mitico")
    for d in res.values():
        # Conhecidos (opção do lobby) e Desafio do Dia (plano, 1.3).
        melhor = d.get("bola_de_ouro", {}).get("melhor", 99)
        caps = d.get("internacionalizacoes", 0)
        jogos = max(d.get("grandes", {}).values(), default=0)
        mitico = "mitico" in d["categorias"]
        d["conhecido"] = mitico or melhor <= 30 or caps >= 25 or jogos >= 150
        d["diario"] = mitico or melhor <= 10 or caps >= 50 or jogos >= 200
    return res


def escrever(candidatos: dict):
    caminho = config.DADOS / "candidatos.json"
    caminho.write_text(json.dumps(candidatos, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    return caminho
