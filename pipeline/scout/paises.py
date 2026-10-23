"""Gera partilhado/paises.json: um país por seleção masculina da FIFA, com o nome em PT-PT, a confederação e as
ligações à Wikidata. As confederações saem das secções da página "List of men's national association football teams"
(expandida pela API), porque a Wikidata não as tem de forma fiável nas seleções."""
import json

from . import config
from .fontes import wikidata as wd
from .fontes import wikipedia as wp

PAGINA = "List of men's national association football teams"
SECOES = {"AFC": "AFC", "CAF": "CAF", "CONCACAF": "CONCACAF", "CONMEBOL": "CONMEBOL", "OFC": "OFC", "UEFA": "UEFA"}

# Seleções que já não existem → a sucessora reconhecida pela FIFA.
SUCESSORAS = {
    "Yugoslavia national football team": "Serbia national football team",
    "Serbia and Montenegro national football team": "Serbia national football team",
    "Soviet Union national football team": "Russia national football team",
    "CIS national football team": "Russia national football team",
    "Czechoslovakia national football team": "Czech Republic national football team",
    "East Germany national football team": "Germany national football team",
    "West Germany national football team": "Germany national football team",
    "Zaire national football team": "DR Congo national football team",
}

# Nomes em português de Portugal quando o rótulo "pt" da Wikidata não serve (editável à mão).
NOMES_PT = {
    "IR": "Irão", "KE": "Quénia", "RW": "Ruanda", "VN": "Vietname", "SG": "Singapura", "BH": "Barém", "QA": "Catar",
    "AM": "Arménia", "LV": "Letónia", "SI": "Eslovénia", "MK": "Macedónia do Norte", "CZ": "Chéquia", "PL": "Polónia",
    "BJ": "Benim", "CD": "RD Congo", "CI": "Costa do Marfim", "NL": "Países Baixos", "US": "Estados Unidos",
    "GB-ENG": "Inglaterra", "GB-SCT": "Escócia", "GB-WLS": "País de Gales", "GB-NIR": "Irlanda do Norte",
    "IE": "Irlanda", "KR": "Coreia do Sul", "KP": "Coreia do Norte", "TR": "Turquia", "RU": "Rússia",
    "AZ": "Azerbaijão", "KZ": "Cazaquistão", "UZ": "Usbequistão", "TJ": "Tajiquistão", "KG": "Quirguistão",
    "TM": "Turquemenistão", "AE": "Emirados Árabes Unidos", "SA": "Arábia Saudita", "CV": "Cabo Verde",
    "GW": "Guiné-Bissau", "ST": "São Tomé e Príncipe", "MZ": "Moçambique", "AO": "Angola", "TL": "Timor-Leste",
}


# Países cujo item na Wikidata não tem o código ISO de 2 letras (p. ex. os Países Baixos "constituintes").
CODIGOS = {"Q55": "NL"}


def _dados_paises(cliente, qids) -> dict:
    """{QID: {'iso', 'sub', 'pt', 'en'}} por SPARQL (as entidades dos países são enormes para o wbgetentities)."""
    valores = " ".join(f"wd:{q}" for q in sorted(qids))
    linhas = wd.sparql(cliente, f"""SELECT ?p ?iso ?sub ?pt ?en WHERE {{
      VALUES ?p {{ {valores} }}
      OPTIONAL {{ ?p wdt:P297 ?iso }}
      OPTIONAL {{ ?p wdt:P300 ?sub }}
      OPTIONAL {{ ?p rdfs:label ?pt FILTER(lang(?pt) = "pt") }}
      OPTIONAL {{ ?p rdfs:label ?en FILTER(lang(?en) = "en") }}
    }}""")
    res = {}
    for l in linhas:
        q = l["p"].rsplit("/", 1)[-1]
        d = res.setdefault(q, {})
        for k in ("iso", "sub", "pt", "en"):
            if l.get(k) and not d.get(k):
                d[k] = l[k]
    return res


def _codigo(dados: dict, qid: str) -> str:
    if qid in CODIGOS:
        return CODIGOS[qid]
    if dados.get("iso"):
        return dados["iso"].upper()
    if dados.get("sub", "").upper().startswith("GB-"):
        return dados["sub"].upper()
    return qid


def gerar(cliente) -> dict:
    secoes = cliente.api(config.WIKIPEDIA_API, {"action": "parse", "page": PAGINA, "prop": "sections"})["parse"]["sections"]
    selecoes = {}                                           # título da seleção → confederação
    for s in secoes:
        conf = next((c for k, c in SECOES.items() if s["line"].startswith(k)), None)
        if not conf or int(s["level"]) != 3:
            continue
        dados = cliente.api(config.WIKIPEDIA_API, {"action": "parse", "page": PAGINA, "prop": "links", "section": s["index"]})
        for l in dados["parse"]["links"]:
            t = l["title"]
            if l.get("exists") and ("national" in t and ("football" in t or "soccer" in t)) and "women" not in t:
                selecoes.setdefault(t, conf)
    info = wp.info_titulos(cliente, list(selecoes) + list(SUCESSORAS))
    qid_selecao = {t: info[t]["qid"] for t in selecoes if info[t]["qid"]}
    ent_sel = wd.entidades(cliente, qid_selecao.values(), props="claims", lote_max=10)
    pais_de = {}
    for t, q in qid_selecao.items():
        e = ent_sel.get(q, {})
        pais = (wd.itens(e, "P1532") or wd.itens(e, "P17") or [None])[0]
        if pais:
            pais_de[t] = pais
    dados_pais = _dados_paises(cliente, set(pais_de.values()))
    res, sem = {}, []
    for t, conf in sorted(selecoes.items()):
        qp = pais_de.get(t)
        if not qp:
            sem.append(t)
            continue
        d = dados_pais.get(qp, {})
        cod = _codigo(d, qp)
        res[cod] = {"nome": NOMES_PT.get(cod) or d.get("pt") or d.get("en") or qp, "confederacao": conf,
                    "selecao": info[t]["titulo"], "qid_selecao": qid_selecao[t], "qid_pais": qp}
    if sem:
        print(f"Seleções sem país na Wikidata ({len(sem)}): {', '.join(sem)}")
    # Seleções extintas: apontam para o código da sucessora.
    extintas = {}
    por_selecao = {v["selecao"]: k for k, v in res.items()}
    for antiga, nova in SUCESSORAS.items():
        cod = por_selecao.get(info.get(nova, {}).get("titulo", nova))
        if cod:
            extintas[info.get(antiga, {}).get("titulo", antiga)] = cod
    return {"paises": res, "selecoes_extintas": extintas}


def escrever(dados: dict):
    caminho = config.PARTILHADO / "paises.json"
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return caminho


def ler() -> dict:
    return json.loads((config.PARTILHADO / "paises.json").read_text(encoding="utf-8"))
