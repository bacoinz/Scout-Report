"""Cruza as fontes num registo por jogador (dados/jogadores/<QID>.json) e anota as discrepâncias.

Fonte principal de cada campo (ver o plano, 1.3):
- carreira (clubes, anos, empréstimos, jogos/golos de campeonato) e seleções: caixa da Wikipédia inglesa;
- jogos/golos/assistências em todas as competições, época a época: zerozero;
- liga de cada passagem: P118 do clube na Wikidata (com datas) + ligas do transfermarkt-datasets por época (2012+);
- números: plantéis das épocas (Wikipédia), convocados das fases finais (Wikipédia) e onzes do transfermarkt;
- pé, altura, posição: transfermarkt, com o zerozero e a caixa como recurso;
- nascimento, cidadania, local de nascimento, foto, fama: Wikidata;
- prémios: secção "Honours" da Wikipédia, com dados/competicoes.json.
"""
import json
import re
from datetime import date

from . import assistencias, config
from .fontes import wikidata as wd
from .fontes import wikipedia as wp
from .fontes import zerozero as zz
from .http import BloqueioAntiBot
from .normalizar import normalizar, semelhanca_clube, slug

_POSICOES_TM = {"Goalkeeper": "GR", "Centre-Back": "DC", "Right-Back": "LD", "Left-Back": "LE",
                "Defensive Midfield": "MDC", "Central Midfield": "MC", "Attacking Midfield": "MO",
                "Right Midfield": "MD", "Left Midfield": "ME", "Right Winger": "ED", "Left Winger": "EE",
                "Second Striker": "SA", "Centre-Forward": "PL"}
_SETOR_TM = {"Goalkeeper": "gr", "Defender": "defesa", "Midfield": "medio", "Attack": "avancado"}
# Posições escritas na caixa da Wikipédia (jogadores sem dados do transfermarkt, e 2.ª posição de quem os tem).
_POSICOES_TEXTO = [
    (r"goal ?keeper", "GR"), (r"centre[- ]?back|central defender|sweeper|centre[- ]?half", "DC"),
    (r"right[- ]?back|right wing[- ]?back", "LD"), (r"left[- ]?back|left wing[- ]?back", "LE"),
    (r"defensive midfield", "MDC"), (r"attacking midfield|playmaker", "MO"), (r"central midfield|box-to-box", "MC"),
    (r"right winger|outside right", "ED"), (r"left winger|outside left", "EE"),
    (r"second striker|support striker", "SA"), (r"inside (forward|right|left)", "MO"),
    (r"wing[- ]half|half[- ]back", "MC"),
    (r"(?<!second )striker|centre[- ]?forward|center[- ]?forward", "PL"),
]
_SETOR_TEXTO = [(r"goal ?keeper", "gr"), (r"defender|back\b", "defesa"), (r"midfield|half\b", "medio"),
                (r"forward|striker|winger|outside (right|left)", "avancado")]
# Fases finais com página "… squads" (números de camisola das seleções): modelo → (confederação ou None, anos).
_TORNEIOS = {
    "{y} FIFA World Cup squads": (None, [1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022, 2026]),
    "UEFA Euro {y} squads": ("UEFA", [1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024]),
    "{y} Copa América squads": ("CONMEBOL", [1991, 1993, 1995, 1997, 1999, 2001, 2004, 2007, 2011, 2015, 2019,
                                             2021, 2024]),
    "{y} Africa Cup of Nations squads": ("CAF", list(range(1992, 2013, 2)) + [2013, 2015, 2017, 2019, 2021, 2023, 2025]),
    "{y} AFC Asian Cup squads": ("AFC", [1996, 2000, 2004, 2007, 2011, 2015, 2019, 2023]),
}
# Ligas do transfermarkt-datasets → artigo da Wikipédia (resolvido para QID).
LIGAS_TM = {"ES1": "La Liga", "GB1": "Premier League", "IT1": "Serie A", "L1": "Bundesliga", "FR1": "Ligue 1",
            "PO1": "Primeira Liga", "NL1": "Eredivisie", "TR1": "Süper Lig", "BE1": "Belgian Pro League",
            "SC1": "Scottish Premiership", "RU1": "Russian Premier League", "UKR1": "Ukrainian Premier League",
            "GR1": "Super League Greece", "DK1": "Danish Superliga"}
# Ligas do Reino Unido: a Wikidata dá o país "Reino Unido"; o futebol quer Inglaterra/Escócia/…
_LIGAS_UK = [(r"scottish|scotland", "GB-SCT"), (r"welsh|wales|cymru", "GB-WLS"),
             (r"northern ireland|nifl|irish league", "GB-NIR"), (r".", "GB-ENG")]
_SELECAO = re.compile(r"national (football|soccer|under-\d+ football) team", re.I)
_DESAMBIG = re.compile(r"\s*\(.*?\)\s*$")


def _ler_json(caminho, padrao):
    return json.loads(caminho.read_text(encoding="utf-8")) if caminho.exists() else padrao


class Contexto:
    """Dados partilhados por vários jogadores (países, competições, clubes, ligas) e acesso às fontes."""

    def __init__(self, cliente, tm=None, fresco: bool = False):
        self.cliente = cliente
        self.tm = tm
        self.fresco = fresco
        p = _ler_json(config.PARTILHADO / "paises.json", {"paises": {}, "selecoes_extintas": {}})
        self.paises = p["paises"]
        self.por_qid_pais = {v["qid_pais"]: k for k, v in self.paises.items()}
        self.por_selecao = {v["selecao"]: k for k, v in self.paises.items()}
        self.por_qid_selecao = {v["qid_selecao"]: k for k, v in self.paises.items()}
        self.extintas = p.get("selecoes_extintas", {})
        self.perguntas = _ler_json(config.PARTILHADO / "perguntas.json", {})
        self.competicoes = {k: v for k, v in _ler_json(config.DADOS / "competicoes.json", {}).items()
                            if not k.startswith("_")}
        self.clubes = _ler_json(config.DADOS / "clubes.json", {})
        self.ligas = _ler_json(config.DADOS / "ligas.json", {})
        self.ligas_tm = {}

    def gravar_catalogo(self):
        for nome, dados in (("clubes.json", self.clubes), ("ligas.json", self.ligas)):
            (config.DADOS / nome).write_text(json.dumps(dados, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                                             encoding="utf-8")

    # --- países ---------------------------------------------------------------------------------------------------
    def pais_de_selecao(self, titulo: str | None, qid: str | None) -> str | None:
        if qid and qid in self.por_qid_selecao:
            return self.por_qid_selecao[qid]
        if titulo:
            return self.por_selecao.get(titulo) or self.extintas.get(titulo)
        return None

    def codigo_pais(self, qid: str | None) -> str | None:
        return self.por_qid_pais.get(qid) if qid else None

    # --- ligas e clubes -------------------------------------------------------------------------------------------
    def preparar_ligas_tm(self):
        info = wp.info_titulos(self.cliente, LIGAS_TM.values())
        self.ligas_tm = {cod: info[t]["qid"] for cod, t in LIGAS_TM.items() if info[t]["qid"]}

    def registar_clubes(self, titulos: set[str]) -> dict:
        """Garante clubes.json/ligas.json para estes artigos de clube. Devolve {título pedido: QID}."""
        info = wp.info_titulos(self.cliente, titulos, fresco=self.fresco)
        qids = {t: i["qid"] for t, i in info.items() if i["qid"]}
        novos = sorted({q for q in qids.values() if q not in self.clubes})
        ents = wd.entidades(self.cliente, novos, props="claims|labels", lote_max=10)
        ligas_novas = set()
        for q in novos:
            e = ents.get(q, {})
            ligas = []
            for c in wd.afirmacoes(e, "P118"):
                lq = wd.item(c)
                if lq:
                    inicio, fim = wd.intervalo(c)
                    ligas.append({"liga": lq, "inicio": inicio, "fim": fim})
                    ligas_novas.add(lq)
            canonico = next((info[t]["titulo"] for t, x in qids.items() if x == q), None)
            self.clubes[q] = {"titulo": canonico, "nome": None, "nome_completo": wd.rotulo(e),
                              "pais_qid": (wd.itens(e, "P17") or [None])[0], "ligas": ligas}
        self.registar_ligas(ligas_novas | set(self.ligas_tm.values()))
        return qids

    def registar_ligas(self, qids):
        novas = set(qids) - set(self.ligas)
        if not novas:
            return
        ents = wd.entidades(self.cliente, novas, props="claims|labels|sitelinks", lote_max=10)
        for lq in novas:
            e = ents.get(lq, {})
            desporto = wd.itens(e, "P641")              # clubes ecléticos: a P118 do River Plate inclui o vólei
            self.ligas[lq] = {"nome": _nome_liga(e) or lq, "nome_en": wd.rotulo(e, ("en",)), "pais": self._pais_liga(e),
                              "futebol": not desporto or "Q2736" in desporto}

    def _pais_liga(self, ent: dict) -> str | None:
        for q in wd.itens(ent, "P1532") + wd.itens(ent, "P17"):
            cod = self.codigo_pais(q)
            if cod:
                return cod
            if q == "Q145":                              # Reino Unido → a nação do futebol, pelo nome da liga
                nome = normalizar(wd.rotulo(ent, ("en",)) or "")
                return next(c for padrao, c in _LIGAS_UK if re.search(padrao, nome))
        return None

    def pais_clube(self, clube_qid: str) -> str | None:
        c = self.clubes.get(clube_qid, {})
        if c.get("pais"):                                # clubes sem artigo (id "x-…") e correções à mão
            return c["pais"]
        for l in c.get("ligas", []):                     # a liga primeiro: resolve os clubes do Reino Unido
            p = self.ligas.get(l["liga"], {}).get("pais")
            if p:
                return p
        return self.codigo_pais(c.get("pais_qid"))

    def ligas_da_passagem(self, clube_qid: str, inicio: int | None, fim: int | None) -> list[str]:
        """Ligas do clube que se sobrepõem à passagem (pelas datas da Wikidata); sem datas, as atuais."""
        ligas = [l for l in self.clubes.get(clube_qid, {}).get("ligas", [])
                 if self.ligas.get(l["liga"], {}).get("futebol", True)]
        ini, fi = inicio or 0, fim or config.ANO_ATUAL
        com_datas = [l["liga"] for l in ligas if (l["inicio"] or l["fim"]) and
                     (l["inicio"] or 0) <= fi and (l["fim"] or 9999) >= ini]
        if com_datas:
            return list(dict.fromkeys(com_datas))
        return list(dict.fromkeys(l["liga"] for l in ligas if not l["fim"]))


# --- ajudas ---------------------------------------------------------------------------------------------------------

def _nome_liga(ent: dict) -> str | None:
    """Nome curto para o jogo: o rótulo PT quando é curto ("Primeira Liga", "Liga do Qatar"); senão o título da
    Wikipédia inglesa ("Serie A" em vez de "Campeonato Italiano de Futebol - Série A"). Editável em ligas.json."""
    pt = wd.rotulo(ent, ("pt",))
    en = _DESAMBIG.sub("", wd.titulo_enwiki(ent) or "") or wd.rotulo(ent, ("en",))
    return pt if pt and len(pt) <= 24 else (en or pt)


def _limpar_competicao(titulo: str | None) -> str | None:
    """'2015–16 UEFA Champions League' → 'UEFA Champions League'; 'UEFA Euro 2016' → 'UEFA Euro'."""
    if not titulo:
        return None
    t = re.sub(r"^\d{4}(?:[–\-]\d{2,4})?\s+", "", titulo.strip())
    t = re.sub(r"\s+(season|final|finals|Final)$", "", t)
    return re.sub(r"\s+\d{4}$", "", t)


def ultimo_ano(p: dict) -> int | None:
    """Ano de início da última época de uma passagem: '2003–2009' → 2008; '2009' → 2009; '2023–' → ano atual."""
    if p["inicio"] is None:
        return None
    if p["fim"] is None:
        return config.ANO_ATUAL if p["aberto"] else p["inicio"]
    return p["fim"] - 1 if p["fim"] > p["inicio"] else p["inicio"]


def passagem_da_epoca(passagens: list[dict], epoca: int, nome: str) -> int | None:
    """Índice da passagem de clube a que pertence uma época de outra fonte (ano de início + nome do clube).
    Prefere as passagens que cobrem esse ano; aceita um ano de folga (épocas de calendário, mudanças em janeiro)."""
    melhor, pontos = None, (0, 0)
    for i, p in enumerate(passagens):
        if p["inicio"] is None:
            continue
        ultimo = ultimo_ano(p)
        um_ano = p["fim"] == p["inicio"]                 # "2021": tanto pode ser 2020/21 (janeiro) como 2021/22
        if p["inicio"] <= epoca <= ultimo and not um_ano:
            dentro = 3
        elif um_ano and p["inicio"] - 1 <= epoca <= p["inicio"]:
            dentro = 2
        elif p["inicio"] - 1 <= epoca <= ultimo + 1:
            dentro = 1
        else:
            continue
        s = max(semelhanca_clube(p["nome"], nome), semelhanca_clube(p["titulo"] or "", nome))
        if s and (s, dentro) > pontos:                   # o nome primeiro, depois o encaixe nos anos
            melhor, pontos = i, (s, dentro)
    return melhor


def _posicao(tm: dict | None, zz_posicoes: list[str], texto_caixa: str, perguntas: dict) -> dict:
    """Setores e até 2 posições específicas: transfermarkt, depois zerozero, depois o texto da caixa."""
    especificas = []
    if tm and tm.get("sub_position") in _POSICOES_TM:
        especificas.append(_POSICOES_TM[tm["sub_position"]])
    especificas += [p for p in zz_posicoes if p not in especificas]
    for padrao, cod in _POSICOES_TEXTO:
        if re.search(padrao, texto_caixa or "", re.I) and cod not in especificas:
            especificas.append(cod)
    especificas = especificas[:2]
    posicoes = perguntas.get("posicoes", {})
    setores = list(dict.fromkeys(posicoes[c]["setor"] for c in especificas if c in posicoes))
    if not setores:
        if tm and tm.get("position") in _SETOR_TM:
            setores = [_SETOR_TM[tm["position"]]]
        else:
            setores = [s for padrao, s in _SETOR_TEXTO if re.search(padrao, texto_caixa or "", re.I)][:2]
    return {"setores": setores, "especificas": especificas, "texto": texto_caixa}


def _foto(cliente, ficheiro: str | None) -> dict | None:
    if not ficheiro:
        return None
    dados = cliente.api(config.COMMONS_API, {"action": "query", "titles": f"File:{ficheiro}", "prop": "imageinfo",
                                             "iiprop": "url|extmetadata", "iiurlwidth": "500"})
    paginas = dados.get("query", {}).get("pages", [])
    if not paginas or not paginas[0].get("imageinfo"):
        return None
    i = paginas[0]["imageinfo"][0]
    meta = i.get("extmetadata", {})
    autor = re.sub(r"<[^>]+>", "", (meta.get("Artist") or {}).get("value", "")).strip()
    return {"url": (i.get("thumburl") or i.get("url") or "").split("?")[0], "autor": autor or None,
            "licenca": (meta.get("LicenseShortName") or {}).get("value"), "pagina": i.get("descriptionurl")}


# --- construção -----------------------------------------------------------------------------------------------------

def construir(ctx: Contexto, qid: str, ent: dict, artigo: dict) -> tuple[dict, list[dict], list[str]]:
    """(registo, discrepâncias, avisos) de um jogador, a partir da entidade Wikidata e do artigo da Wikipédia
    (artigo = {'titulo', 'revid', 'texto'})."""
    cliente = ctx.cliente
    discrepancias, avisos = [], []
    texto = artigo["texto"]
    caixa = wp.caixa_futebol(texto) or {}
    if not caixa:
        avisos.append("sem caixa de informação de futebol no artigo")
    car = wp.carreira(caixa)
    dc = wp.dados_caixa(caixa)

    # Clubes e equipas treinadas → QIDs (e catálogo de clubes/ligas); seleções à parte.
    info_sel = wp.info_titulos(cliente, [s["titulo"] for s in car["selecoes"] + car["treinador"] if s["titulo"]])

    def e_selecao(titulo):
        canon = (info_sel.get(titulo) or {}).get("titulo") or titulo or ""
        return bool(_SELECAO.search(canon))

    titulos_clubes = {p["titulo"] for p in car["clubes"] + car["treinador"] if p["titulo"] and not e_selecao(p["titulo"])}
    qid_clube = ctx.registar_clubes(titulos_clubes)

    # Fontes externas pelos ids da Wikidata.
    zz_id = next((wd.valor(c) for c in wd.afirmacoes(ent, "P3047")), None)
    tm_id = next((wd.valor(c) for c in wd.afirmacoes(ent, "P2446")), None)
    zz_perfil, zz_epocas = {}, {"clubes": [], "selecoes": []}
    if zz_id:
        try:
            zz_perfil = zz.perfil(zz.pagina_principal(cliente, zz_id, fresco=ctx.fresco))
            zz_epocas = zz.epocas(zz.pagina_epocas(cliente, zz_id, fresco=ctx.fresco))
        except Exception as e:                                    # noqa: BLE001 — a recolha continua sem o zerozero
            avisos.append(f"zerozero {zz_id} falhou: {e}")
    else:
        avisos.append("sem id do zerozero (P3047) na Wikidata")
    tm = ctx.tm.jogador(tm_id) if (ctx.tm and tm_id) else None
    if tm_id and ctx.tm and not tm:
        avisos.append(f"transfermarkt {tm_id} não está no transfermarkt-datasets (só tem quem jogou de 2012 em diante)")
    tm_epocas = ctx.tm.epocas(tm_id) if tm else []

    # --- carreira de clube -----------------------------------------------------------------------------------------
    passagens = []
    for p in car["clubes"]:
        q = qid_clube.get(p["titulo"])
        if not q:
            avisos.append(f"clube sem artigo/QID: {p['nome'] or p['titulo']}")
        elif not ctx.clubes[q].get("nome"):
            ctx.clubes[q]["nome"] = p["nome"] or ctx.clubes[q].get("nome_completo")
        ligas = ctx.ligas_da_passagem(q, p["inicio"], p["fim"]) if q else []
        passagens.append({**p, "clube": q, "ligas": ligas, "ligas_epocas": [], "epocas": [], "numeros": set()})
    # Liga de cada época na tabela "Career statistics": a melhor fonte para as épocas antigas (a P118 da Wikidata
    # costuma ter só a liga atual do clube: o Cannes do Zidane apareceria no campeonato amador).
    estat = wp.ligas_por_epoca(texto)
    info_l = wp.info_titulos(cliente, {r["liga_titulo"] for r in estat if r["liga_titulo"]})
    qid_liga = {t: v["qid"] for t, v in info_l.items() if v["qid"]}
    ctx.registar_ligas(qid_liga.values())
    for r in estat:
        lq = qid_liga.get(r["liga_titulo"])
        i = passagem_da_epoca(passagens, r["epoca"], r["clube_nome"] or r["clube_titulo"] or "") if lq else None
        if i is not None and lq not in passagens[i]["ligas_epocas"]:
            passagens[i]["ligas_epocas"].append(lq)
    for e in zz_epocas["clubes"]:
        i = passagem_da_epoca(passagens, e["epoca"], e["clube"])
        if i is None:
            if e["jogos"]:
                discrepancias.append({"campo": "carreira", "fonte": "zerozero",
                                      "nota": f"{e['texto']} {e['clube']} ({e['jogos']} jogos) sem passagem na caixa"})
            continue
        passagens[i]["epocas"].append(dict(e, numeros=set()))
    # Ligas e números por época no transfermarkt (2012+).
    for e in tm_epocas:
        i = passagem_da_epoca(passagens, e["epoca"], e["clube"] or "")
        if i is None:
            continue
        for cod in e["ligas"]:
            lq = ctx.ligas_tm.get(cod)
            if lq and lq not in passagens[i]["ligas_epocas"]:
                passagens[i]["ligas_epocas"].append(lq)
        for ep in passagens[i]["epocas"]:
            if ep["epoca"] == e["epoca"]:
                ep["numeros"] |= set(e["numeros"])
                if ep["assistencias"] is None and e["assistencias"] is not None and e["jogos"]:
                    # O zerozero não tem as assistências dessa época: ficam as do transfermarkt, que só cobre as
                    # competições principais; a cobertura conta só os jogos que ele tem.
                    ep["assistencias"], ep["jogos_assist"] = int(e["assistencias"]), min(ep["jogos"], e["jogos"])
        passagens[i]["numeros"] |= set(e["numeros"])
    # Números nos plantéis das épocas da Wikipédia.
    homonimo = bool(_DESAMBIG.search(artigo["titulo"]))
    nomes_jogador = {normalizar(artigo["titulo"])} if homonimo else \
        {normalizar(artigo["titulo"]), normalizar(dc["nome"])} - {""}
    pedidos_epoca = {}
    for i, p in enumerate(passagens):
        canon = (ctx.clubes.get(p["clube"]) or {}).get("titulo") if p["clube"] else None
        if canon and p["inicio"]:
            for a in range(p["inicio"], ultimo_ano(p) + 1):
                pedidos_epoca[wp.titulos_epoca(canon, a, a)[0]] = (i, a)
                pedidos_epoca[f"{a} {canon} season"] = (i, a)   # ligas de ano civil (MLS, Brasil, Noruega…)
    existentes = {t: v["titulo"] for t, v in wp.info_titulos(cliente, pedidos_epoca).items() if v["existe"]}
    textos_epoca = wp.wikitextos(cliente, existentes.values())
    for t, canon in existentes.items():
        i, a = pedidos_epoca[t]
        nums = wp.numeros_no_plantel(textos_epoca.get(canon, {}).get("texto", ""), nomes_jogador, so_ligacao=homonimo)
        if nums:
            passagens[i]["numeros"] |= nums
            for ep in passagens[i]["epocas"]:
                if ep["epoca"] == a:
                    ep["numeros"] |= nums

    # Números que ainda faltam: o plantel do clube nessa época no zerozero. Só para as épocas sem número de outra
    # fonte; cada plantel é um pedido (a cache partilha-o entre os jogadores do mesmo plantel).
    for p in passagens:
        for ep in p["epocas"]:
            if ep["numeros"] or not ep["jogos"] or not ep.get("plantel"):
                continue
            try:
                n = zz.numero_no_plantel(zz.pagina_plantel(cliente, ep["plantel"], fresco=ctx.fresco), zz_id,
                                         zz_epocas.get("slug"))
            except BloqueioAntiBot:
                raise
            except Exception as e:                       # noqa: BLE001 — um plantel em falta não para a recolha
                avisos.append(f"plantel do zerozero {ep['plantel']} falhou: {e}")
                continue
            if n:
                ep["numeros"].add(n)
                p["numeros"].add(n)

    # --- seleções --------------------------------------------------------------------------------------------------
    selecoes = []
    for s in car["selecoes"]:
        if not s["senior"]:
            continue
        qs = (info_sel.get(s["titulo"]) or {}).get("qid")
        cod = ctx.pais_de_selecao((info_sel.get(s["titulo"]) or {}).get("titulo", s["titulo"]), qs)
        if not cod:
            avisos.append(f"seleção sem país conhecido: {s['nome'] or s['titulo']}")
            continue
        selecoes.append({"pais": cod, "jogos": s["jogos"], "golos": s["golos"], "inicio": s["inicio"],
                         "fim": s["fim"], "numeros": set()})
    if selecoes and tm:
        selecoes[-1]["numeros"] |= set(ctx.tm.numeros_selecao(tm_id))
    # Convocados das fases finais (números).
    pedidos_torneio = {}
    for k, s in enumerate(selecoes):
        conf = ctx.paises.get(s["pais"], {}).get("confederacao")
        ini, fim = s["inicio"] or 0, s["fim"] or config.ANO_ATUAL
        for modelo, (conf_t, anos) in _TORNEIOS.items():
            if conf_t in (None, conf):
                for y in anos:
                    if ini <= y <= fim:
                        pedidos_torneio[modelo.format(y=y)] = k
    if pedidos_torneio:
        existentes_t = {t: v["titulo"] for t, v in wp.info_titulos(cliente, pedidos_torneio).items() if v["existe"]}
        textos_t = wp.wikitextos(cliente, existentes_t.values())
        for t, canon in existentes_t.items():
            selecoes[pedidos_torneio[t]]["numeros"] |= wp.numeros_no_plantel(
                textos_t.get(canon, {}).get("texto", ""), nomes_jogador, so_ligacao=homonimo)
    # Cruzamento com o zerozero (internacionalizações).
    zz_sel = max(zz_epocas["selecoes"], key=lambda s: s["jogos"], default=None)
    if zz_sel and selecoes and selecoes[0]["jogos"] is not None and abs(zz_sel["jogos"] - selecoes[0]["jogos"]) > 2:
        discrepancias.append({"campo": "selecao.jogos", "wikipedia": selecoes[0]["jogos"], "zerozero": zz_sel["jogos"],
                              "escolha": "wikipedia"})

    # --- totais e coberturas ------------------------------------------------------------------------------------
    carreira = []
    falta_zz = []
    assist_conhecidas = jogos_com_assist = jogos_com_numero = jogos_zz = jogos_sem_zz = 0
    for p in passagens:
        ep = p["epocas"]
        if not ep and p["jogos_liga"] != 0:
            falta_zz.append(p["nome"])
            jogos_sem_zz += p["jogos_liga"] or 0
        for e in ep:
            jogos_zz += e["jogos"]
            if e["assistencias"] is not None:
                assist_conhecidas += e["assistencias"]
                jogos_com_assist += e.get("jogos_assist", e["jogos"])
            if e["numeros"]:
                jogos_com_numero += e["jogos"]
        ligas = p["ligas_epocas"] or p["ligas"]          # época a época primeiro; a Wikidata como recurso
        if not p["ligas_epocas"] and p["ligas"]:
            avisos.append(f"{p['nome']}: liga só pela Wikidata (sem tabela de épocas nem transfermarkt)")
        paises_liga = list(dict.fromkeys(x for x in (ctx.ligas.get(l, {}).get("pais") for l in ligas) if x))
        if not ligas and p["clube"]:
            pais = ctx.pais_clube(p["clube"])
            if pais:
                ligas, paises_liga = [f"outra-{pais}"], [pais]
        jogos = sum(e["jogos"] for e in ep) if ep else None
        carreira.append({"clube": p["clube"], "nome": (ctx.clubes.get(p["clube"]) or {}).get("nome") or p["nome"],
                         "inicio": p["inicio"], "fim": p["fim"], "emprestimo": p["emprestimo"],
                         "ligas": ligas, "paises_liga": paises_liga,
                         "jogos": jogos, "golos": sum(e["golos"] for e in ep) if ep else None,
                         "assistencias": sum(e["assistencias"] for e in ep if e["assistencias"] is not None) if ep else None,
                         "jogos_liga": p["jogos_liga"], "golos_liga": p["golos_liga"],
                         "numeros": sorted(p["numeros"])})
        if jogos is not None and p["jogos_liga"] is not None and jogos < p["jogos_liga"]:
            discrepancias.append({"campo": "carreira.jogos", "clube": p["nome"], "wikipedia_liga": p["jogos_liga"],
                                  "zerozero_todas": jogos,
                                  "nota": "o zerozero tem menos jogos (todas as competições) do que a caixa (só campeonato)"})
    jogos_sel = sum(s["jogos"] or 0 for s in selecoes)
    golos_sel = sum(s["golos"] or 0 for s in selecoes)
    # Todas as competições quando o zerozero cobre a carreira; uma passagem curta sem épocas no zerozero (clube
    # pequeno, equipa B) entra com o campeonato da caixa, desde que não passe de 10% dos jogos de campeonato.
    jogos_liga_total = sum(c["jogos_liga"] or 0 for c in carreira)
    if passagens and jogos_zz and jogos_sem_zz <= 0.10 * max(jogos_liga_total, 1):
        base = "todas"
        jogos_total = sum(c["jogos"] if c["jogos"] is not None else (c["jogos_liga"] or 0) for c in carreira) + jogos_sel
        golos_total = sum(c["golos"] if c["golos"] is not None else (c["golos_liga"] or 0) for c in carreira) + golos_sel
        if falta_zz:
            avisos.append("todas as competições, exceto (só campeonato, sem épocas no zerozero): " + ", ".join(falta_zz))
    else:
        base = "campeonato+selecao"
        avisos.append("totais só de campeonato + seleção: sem épocas do zerozero para " + ", ".join(falta_zz or ["nenhum clube"]))
        jogos_total = jogos_liga_total + jogos_sel
        golos_total = sum(c["golos_liga"] or 0 for c in carreira) + golos_sel
    jogos_zz += jogos_sem_zz                             # as coberturas contam também os jogos sem dados
    assist_sel = zz_sel["assistencias"] if zz_sel and zz_sel["assistencias"] is not None else 0
    jogos_sel_com_assist = min(zz_sel["jogos"], jogos_sel) if zz_sel and zz_sel["assistencias"] is not None else 0

    # --- identidade, nacionalidades, estado ----------------------------------------------------------------------------
    nascimento = next((wd.data(wd.valor(c)) for c in wd.afirmacoes(ent, "P569")), None)
    for nome_fonte, outra in (("zerozero", zz_perfil.get("nascimento")),
                              ("transfermarkt", ((tm or {}).get("date_of_birth") or "")[:10] or None)):
        if outra and nascimento and len(nascimento) == 10 and outra != nascimento:
            discrepancias.append({"campo": "nascimento", "wikidata": nascimento, nome_fonte: outra, "escolha": "wikidata"})
    nacionalidades = list(dict.fromkeys(s["pais"] for s in selecoes))
    qids_cidadania = wd.itens(ent, "P27")
    cidadanias = {ctx.codigo_pais(q) for q in qids_cidadania} - {None}
    if "Q145" in qids_cidadania:
        cidadanias |= {"GB-ENG", "GB-SCT", "GB-WLS", "GB-NIR"}
    naturalidade, pais_nasc = _naturalidade(ctx, ent)
    if pais_nasc and (pais_nasc in cidadanias or not nacionalidades) and pais_nasc not in nacionalidades:
        nacionalidades.append(pais_nasc)
    if not nacionalidades:
        nacionalidades = sorted(cidadanias)
        if nacionalidades:
            avisos.append("nacionalidade só pela cidadania da Wikidata (sem seleção sénior nem local de nascimento)")
    confederacoes = list(dict.fromkeys(ctx.paises[c]["confederacao"] for c in nacionalidades if c in ctx.paises))
    # Clubes pequenos sem artigo na Wikipédia (o São Roque do Pauleta): id próprio e, como país, o de nascimento.
    for c in carreira:
        if not c["clube"]:
            c["clube"] = "x-" + slug(c["nome"])
            ctx.clubes.setdefault(c["clube"], {"titulo": None, "nome": c["nome"], "nome_completo": None,
                                               "pais_qid": None, "ligas": [], "pais": pais_nasc})
        if not c["paises_liga"]:
            pais = ctx.pais_clube(c["clube"]) or pais_nasc
            if pais:
                c["ligas"], c["paises_liga"] = [f"outra-{pais}"], [pais]
                if not ctx.pais_clube(c["clube"]):
                    avisos.append(f"{c['nome']}: sem liga nem país nas fontes; fica o país de nascimento ({pais})")
            else:
                avisos.append(f"clube sem país/liga: {c['nome']}")

    ultima = passagens[-1] if passagens else None
    situacao = (zz_perfil.get("situacao") or "").lower()
    ativo = bool(ultima and ultima["aberto"]) and "retirad" not in situacao
    if ultima and ultima["aberto"] and "retirad" in situacao:
        discrepancias.append({"campo": "estado", "wikipedia": "passagem em aberto", "zerozero": zz_perfil.get("situacao"),
                              "escolha": "retirado"})
    estreia = min((p["inicio"] for p in passagens if p["inicio"]), default=None)

    # --- posição e físico ---------------------------------------------------------------------------------------------
    posicao = _posicao(tm, zz_perfil.get("posicoes", []), dc["posicao"], ctx.perguntas)
    if not posicao["setores"]:
        # Sem posição na caixa (Gianni Rivera): a posição da Wikidata (P413), pelos rótulos em inglês.
        p413 = wd.itens(ent, "P413")
        rotulos = wd.entidades(cliente, p413, props="labels", idiomas="en") if p413 else {}
        texto_wd = ", ".join(wd.rotulo(e, ("en",)) or "" for e in rotulos.values())
        posicao = _posicao(tm, zz_perfil.get("posicoes", []), texto_wd, ctx.perguntas)
    if not posicao["especificas"]:
        avisos.append(f"posição específica desconhecida ('{dc['posicao']}')")
    pe_tm = {"right": "direito", "left": "esquerdo", "both": "ambos"}.get((tm or {}).get("foot") or "")
    pe = pe_tm or zz_perfil.get("pe")
    if pe_tm and zz_perfil.get("pe") and pe_tm != zz_perfil["pe"]:
        discrepancias.append({"campo": "pe", "transfermarkt": pe_tm, "zerozero": zz_perfil["pe"], "escolha": "transfermarkt"})
    altura_tm = (tm or {}).get("height_in_cm")
    altura = int(altura_tm) if altura_tm else zz_perfil.get("altura_cm")
    if altura_tm and zz_perfil.get("altura_cm") and abs(int(altura_tm) - zz_perfil["altura_cm"]) > 2:
        discrepancias.append({"campo": "altura_cm", "transfermarkt": int(altura_tm), "zerozero": zz_perfil["altura_cm"],
                              "escolha": "transfermarkt"})

    # --- prémios e treinador --------------------------------------------------------------------------------------------
    premios, premios_treinador, desconhecidas, n_titulos_treinador = _premios(ctx, wp.titulos(texto))
    treinador = None
    equipas_treino = [t for t in car["treinador"] if not t["adjunto"]]
    if equipas_treino:
        eq, abertas = [], []
        for t in equipas_treino:
            qs = (info_sel.get(t["titulo"]) or {}).get("qid")
            pais_sel = ctx.pais_de_selecao((info_sel.get(t["titulo"]) or {}).get("titulo", t["titulo"]), qs) \
                if e_selecao(t["titulo"]) else None
            q = qid_clube.get(t["titulo"])
            if pais_sel:
                eq.append({"tipo": "selecao", "pais": pais_sel, "nome": ctx.paises.get(pais_sel, {}).get("nome", t["nome"]),
                           "inicio": t["inicio"], "fim": t["fim"], "interino": t["interino"]})
            elif q:
                eq.append({"tipo": "clube", "equipa": q, "nome": t["nome"], "pais": ctx.pais_clube(q),
                           "inicio": t["inicio"], "fim": t["fim"], "interino": t["interino"]})
            else:
                avisos.append(f"equipa treinada sem QID: {t['nome']}")
                continue
            abertas.append(t["aberto"])
        # O "aberto" é da própria linha da caixa ("2026–"): o nome das seleções já vem traduzido ("França").
        atual = next((e for e, aberta in zip(eq, abertas) if e["fim"] is None and not e["interino"] and aberta), None)
        treinador = {"equipas": eq, "atual": atual, "titulos": premios_treinador, "n_titulos": n_titulos_treinador}

    # --- nomes, fama, foto, factos ---------------------------------------------------------------------------------
    nome = _DESAMBIG.sub("", artigo["titulo"])
    alcunhas = [v.get("text") for c in wd.afirmacoes(ent, "P1449") if isinstance(v := wd.valor(c), dict)]
    aliases = list(dict.fromkeys(a for a in [dc["nome"], dc["nome_completo"], wd.rotulo(ent, ("pt",)),
                                             wd.rotulo(ent, ("en",))] + wd.aliases(ent) + alcunhas
                                 if a and normalizar(a) != normalizar(nome)))
    ficheiro_foto = next((wd.valor(c) for c in wd.afirmacoes(ent, "P18")), None)
    pais_dica = ctx.paises.get(nacionalidades[0], {}).get("nome", "?") if nacionalidades else "?"

    registo = {
        "id": qid,
        "nome": nome,
        "aliases": aliases[:12],
        "dica": f"{nascimento[:4] if nascimento else '?'} · {pais_dica}",
        "nacionalidades": nacionalidades,
        "confederacoes": confederacoes,
        "posicao": posicao,
        "nascimento": nascimento,
        "estreia": estreia,
        "estado": "ativo" if ativo else "retirado",
        # A carreira já tem os ids próprios dos clubes sem artigo ("x-vv-woudenberg").
        "clube_atual": carreira[-1]["clube"] if ativo and carreira else None,
        "carreira": carreira,
        "selecoes": [dict(s, numeros=sorted(s["numeros"])) for s in selecoes],
        "totais": {
            "base": base,
            "jogos": jogos_total, "golos": golos_total,
            "internacionalizacoes": jogos_sel, "golos_selecao": golos_sel,
            "assistencias": {
                "conhecidas": assist_conhecidas + assist_sel,
                "cobertura": round(jogos_com_assist / jogos_zz, 3) if jogos_zz else 0.0,
                "jogos_com_dados": jogos_com_assist + jogos_sel_com_assist,
                "jogos_sem_dados": (jogos_zz - jogos_com_assist) + (jogos_sel - jogos_sel_com_assist),
                # Estimativa generosa (assistencias.py): abaixo dela, o jogo pode responder "não".
                "maximo": assistencias.maximo(assist_conhecidas + assist_sel, jogos_com_assist + jogos_sel_com_assist,
                                              (jogos_zz - jogos_com_assist) + (jogos_sel - jogos_sel_com_assist),
                                              posicao)},
            "numeros": {"cobertura": round(jogos_com_numero / jogos_zz, 3) if jogos_zz else 0.0,
                        "conhecidos": sorted({n for c in carreira for n in c["numeros"]}
                                             | {n for s in selecoes for n in s["numeros"]}
                                             | ({zz_perfil["numero"]} if zz_perfil.get("numero") else set()))},
            "clubes": len({c["clube"] or c["nome"] for c in carreira}),
        },
        "premios": premios,
        "treinador": treinador,
        "perfil": {"pe": pe, "altura_cm": altura, "naturalidade": naturalidade, "alcunhas": alcunhas,
                   "foto": _foto(cliente, ficheiro_foto)},
        "factos": {
            "maior_transferencia": ctx.tm.maior_transferencia(tm_id) if tm else None,
            "valor_maximo_eur": (tm or {}).get("highest_market_value_in_eur"),
            "familiares_futebolistas": _familiares(ctx, ent),
        },
        "fama": {"wikipedias": wd.n_wikipedias(ent)},
        "fontes": {"wikipedia": artigo["titulo"], "wikipedia_rev": artigo["revid"], "zerozero": zz_id,
                   "transfermarkt": tm_id},
        "atualizado_em": date.today().isoformat(),
    }
    if desconhecidas:
        avisos.append("competições sem prémio associado: " + "; ".join(sorted(desconhecidas)))
    return registo, discrepancias, avisos


def _naturalidade(ctx: Contexto, ent: dict) -> tuple[str | None, str | None]:
    """('Funchal, Portugal', 'PT') pelo local de nascimento (P19), subindo pela P131 até um país do futebol
    (fronteiras atuais; Manchester → Inglaterra, não Reino Unido)."""
    lugar = (wd.itens(ent, "P19") or [None])[0]
    if not lugar:
        return None, None
    atual, nome_lugar, visto = lugar, None, set()
    for _ in range(8):
        if not atual or atual in visto:
            break
        visto.add(atual)
        cod = ctx.codigo_pais(atual)
        if cod:
            nome_pais = ctx.paises[cod]["nome"]
            return (f"{nome_lugar}, {nome_pais}" if nome_lugar else nome_pais), cod
        e = wd.entidades(ctx.cliente, [atual], props="claims|labels").get(atual, {})
        if nome_lugar is None:
            nome_lugar = wd.rotulo(e)
        pais = (wd.itens(e, "P17") or [None])[0]
        cod = ctx.codigo_pais(pais)
        if cod:
            return f"{nome_lugar}, {ctx.paises[cod]['nome']}", cod
        acima = wd.itens(e, "P131")
        atual = acima[0] if acima else None
    return nome_lugar, None


def _familiares(ctx: Contexto, ent: dict) -> list[dict]:
    """Irmãos, pais e filhos que também são futebolistas (P106 = futebolista, Q937857)."""
    rel = {"P3373": "irmão/irmã", "P22": "pai", "P40": "filho/filha"}
    pares = [(wd.item(c), r) for p, r in rel.items() for c in wd.afirmacoes(ent, p) if wd.item(c)]
    if not pares:
        return []
    ents = wd.entidades(ctx.cliente, [q for q, _ in pares], props="claims|labels")
    return [{"relacao": r, "nome": wd.rotulo(ents[q])} for q, r in pares
            if q in ents and "Q937857" in wd.itens(ents[q], "P106")]


def _premios(ctx: Contexto, linhas: list[dict]):
    """(prémios de jogador, prémios de treinador, competições desconhecidas, n.º de títulos como treinador)."""
    jogador, treinador = {}, {}
    desconhecidas = set()
    n_treinador = 0
    tipos = ctx.perguntas.get("premios", {})
    for l in linhas:
        if l["vice"]:
            continue
        comp = _limpar_competicao(l["competicao"])
        mapa = ctx.competicoes.get(comp or "") or ctx.competicoes.get(l["competicao"] or "")
        if l["tipo"] == "jovem" and not (mapa and mapa["id"] == "jogos_olimpicos"):
            continue                                     # títulos das seleções jovens não contam
        tipo = tipos.get(mapa["id"], {}).get("tipo", l["tipo"]) if mapa else l["tipo"]
        if mapa and l["tipo"] == "individual" and tipo != "individual":
            continue                                     # "Melhor marcador da Liga dos Campeões" não é a Liga
        if mapa and tipo == "individual" and not l["anos"]:
            continue                                     # um prémio individual sem ano é um cabeçalho de lista
        if l["contexto"] == "treinador" and tipo != "individual":
            n_treinador += l["n"]
        if not mapa or not mapa.get("id"):              # "id": null = conhecida, mas sem pergunta (supertaças…)
            if not mapa and tipo != "individual" and comp:
                desconhecidas.add(comp)
            continue
        alvo = treinador if l["contexto"] == "treinador" else jogador
        chave = (mapa["id"], mapa.get("pais"))
        p = alvo.setdefault(chave, {"id": mapa["id"], **({"pais": mapa["pais"]} if mapa.get("pais") else {}),
                                    "n": 0, "anos": [], "_sem_ano": 0})
        p["anos"] = sorted(set(p["anos"]) | set(l["anos"]))
        p["_sem_ano"] += 0 if l["anos"] else 1
        p["n"] = len(p["anos"]) + p["_sem_ano"]          # o mesmo ano em duas linhas conta uma vez
    for p in list(jogador.values()) + list(treinador.values()):
        del p["_sem_ano"]
    return list(jogador.values()), list(treinador.values()), desconhecidas, n_treinador
