"""Wikidata: entidades em lote (wbgetentities, 50 de cada vez) e ajudas para ler as afirmações."""
from .. import config

LOTE = 50


def entidades(cliente, qids, props: str = "claims|labels|aliases|sitelinks", idiomas: str = "pt|pt-br|en",
              fresco: bool = False, lote_max: int = LOTE) -> dict:
    """{QID: entidade} para todos os QIDs pedidos (os inexistentes ficam de fora).
    Entidades muito grandes (países) podem passar o limite da resposta da API, que as corta sem erro: aí usa-se
    lote_max pequeno, ou SPARQL para ler só o que interessa."""
    qids = sorted(q for q in dict.fromkeys(qids) if q)
    res = {}
    for i in range(0, len(qids), lote_max):
        lote = qids[i:i + lote_max]
        dados = cliente.api(config.WIKIDATA_API, {"action": "wbgetentities", "ids": "|".join(lote), "props": props,
                                                  "languages": idiomas}, fresco=fresco)
        for qid, ent in dados.get("entities", {}).items():
            if "missing" not in ent:
                res[qid] = ent
    return res


def sparql(cliente, consulta: str, fresco: bool = False) -> list[dict]:
    """Linhas de uma consulta SPARQL 1.1 simples (sem SERVICE wikibase:label, para funcionar também no QLever)."""
    dados = cliente.api(config.WIKIDATA_SPARQL, {"query": consulta, "format": "json"}, fresco=fresco)
    return [{k: v["value"] for k, v in linha.items()} for linha in dados["results"]["bindings"]]


# --- Leitura das afirmações -------------------------------------------------------------------------------------

def afirmacoes(ent: dict, prop: str) -> list[dict]:
    """Afirmações de uma propriedade, sem as descontinuadas; as preferidas primeiro."""
    todas = [c for c in ent.get("claims", {}).get(prop, []) if c.get("rank") != "deprecated"]
    return sorted(todas, key=lambda c: c.get("rank") != "preferred")


def _valor(snak: dict):
    return (snak.get("datavalue") or {}).get("value")


def valor(afirmacao: dict):
    return _valor(afirmacao.get("mainsnak", {}))


def item(afirmacao_ou_snak: dict) -> str | None:
    v = _valor(afirmacao_ou_snak.get("mainsnak", afirmacao_ou_snak))
    return v.get("id") if isinstance(v, dict) else None


def itens(ent: dict, prop: str) -> list[str]:
    return [q for c in afirmacoes(ent, prop) if (q := item(c))]


def qualificadores(afirmacao: dict, prop: str) -> list:
    return [_valor(s) for s in afirmacao.get("qualifiers", {}).get(prop, []) if _valor(s) is not None]


def ano(valor_tempo) -> int | None:
    """'+1985-02-05T00:00:00Z' → 1985."""
    if isinstance(valor_tempo, dict):
        valor_tempo = valor_tempo.get("time")
    if not valor_tempo:
        return None
    try:
        return int(str(valor_tempo).lstrip("+").split("-")[0])
    except ValueError:
        return None


def data(valor_tempo) -> str | None:
    """'+1985-02-05T00:00:00Z' (precisão de dia) → '1985-02-05'; com precisão menor devolve só o ano."""
    if not isinstance(valor_tempo, dict) or not valor_tempo.get("time"):
        return None
    t = valor_tempo["time"].lstrip("+")[:10]
    return t if valor_tempo.get("precision", 0) >= 11 else t[:4]


def intervalo(afirmacao: dict) -> tuple[int | None, int | None]:
    """Anos de início (P580) e fim (P582) de uma afirmação."""
    inicio = qualificadores(afirmacao, "P580")
    fim = qualificadores(afirmacao, "P582")
    return (ano(inicio[0]) if inicio else None), (ano(fim[0]) if fim else None)


def rotulo(ent: dict, idiomas=("pt", "pt-br", "en")) -> str | None:
    for l in idiomas:
        if l in ent.get("labels", {}):
            return ent["labels"][l]["value"]
    return None


def aliases(ent: dict, idiomas=("pt", "en")) -> list[str]:
    return [a["value"] for l in idiomas for a in ent.get("aliases", {}).get(l, [])]


def n_wikipedias(ent: dict) -> int:
    """Quantas Wikipédias têm artigo (a medida de fama): sitelinks 'xxwiki', sem commons/species/etc."""
    fora = {"commonswiki", "specieswiki", "metawiki", "wikidatawiki", "mediawikiwiki", "sourceswiki"}
    return sum(1 for s in ent.get("sitelinks", {}) if s.endswith("wiki") and s not in fora)


def titulo_enwiki(ent: dict) -> str | None:
    return (ent.get("sitelinks", {}).get("enwiki") or {}).get("title")
