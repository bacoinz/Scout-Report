"""Curiosidades do dossier: o LLM lê as secções do artigo (introdução, infância, vida pessoal, estilo de jogo…) e
escreve 4–6 frases curtas em PT-PT, cada uma com a frase original da Wikipédia em que se baseia.

Cada curiosidade só é aceite se:
- a frase de origem existir mesmo no artigo (comparação sem acentos nem pontuação);
- todos os números da curiosidade aparecerem na frase de origem;
- os nomes próprios da curiosidade aparecerem na frase de origem (ou forem a tradução de um país, ou partilharem o
  início com uma palavra da frase: Lisboa/Lisbon, Milão/Milan).
As outras vão para saida/curiosidades/<QID>.json, e o relatório mostra-as com o motivo."""
import json
import re

from . import config
from .fontes import llm
from .fontes import wikipedia as wp
from .normalizar import normalizar

VERSAO = 1
SAIDA_CURIOSIDADES = config.SAIDA / "curiosidades"
TEMAS = ["infancia", "vida_pessoal", "estilo", "carreira", "outro"]

SISTEMA = """És o redator de um jogo de adivinhar futebolistas, em português de Portugal (PT-PT: "equipa", "golo",
"guarda-redes", "treinador", "seleção", "relvado"; nunca português do Brasil).
Recebes o texto de um artigo da Wikipédia inglesa sobre um futebolista. Escreve entre 4 e 6 curiosidades sobre ele:
- factos que só estão no texto: infância e origem, família, vida pessoal, estilo de jogo, alcunhas e a sua origem,
  momentos marcantes ou insólitos da carreira;
- evita o que já está nas estatísticas (lista de clubes, jogos, golos, títulos, internacionalizações);
- cada curiosidade tem no máximo 140 caracteres, é uma frase simples e verdadeira segundo o texto, sem opiniões;
- não começes pelo nome do jogador; escreve na terceira pessoa ("Cresceu…", "O pai…");
- mantém os nomes próprios como estão no texto (exceto os países, que vão em português) e os números em algarismos;
- em "origem" copia, letra a letra, a frase do texto em que a curiosidade se baseia (uma só frase, completa).
Se o texto não tiver curiosidades suficientes, devolve menos. Nunca inventes."""

ESQUEMA = {
    "type": "object",
    "properties": {"curiosidades": {"type": "array", "items": {
        "type": "object",
        "properties": {"texto": {"type": "string"}, "origem": {"type": "string"}, "tema": {"type": "string", "enum": TEMAS}},
        "required": ["texto", "origem", "tema"]}}},
    "required": ["curiosidades"],
}

# Palavras com maiúscula que não são nomes a verificar (início de frase, vocabulário do futebol em PT).
_COMUNS = {
    "o", "a", "os", "as", "um", "uma", "em", "no", "na", "nos", "nas", "de", "do", "da", "dos", "das", "ao", "aos", "e",
    "foi", "era", "é", "ele", "cresceu", "nasceu", "começou", "aos", "quando", "durante", "depois", "antes", "apesar",
    "liga", "campeões", "taça", "mundial", "europeu", "seleção", "bola", "ouro", "jogos", "olímpicos", "copa", "campeonato",
    "supertaça", "série", "primeira", "segunda", "divisão", "clube", "estádio", "prémio", "melhor", "jogador",
    "treinador", "presidente", "rei", "rainha", "papa", "dom", "sir", "são", "santo", "santa", "nações",
}


def _paises_en_pt() -> dict:
    """{nome PT normalizado: nome EN normalizado} a partir de paises.json (o EN sai do título da seleção)."""
    caminho = config.PARTILHADO / "paises.json"
    if not caminho.exists():
        return {}
    paises = json.loads(caminho.read_text(encoding="utf-8"))["paises"]
    return {normalizar(v["nome"]): normalizar(re.sub(r"\s+(men's\s+)?national.*$", "", v["selecao"])) for v in paises.values()}


def verificar(cur: dict, fonte_norm: str, nomes_jogador: set[str], paises: dict) -> str | None:
    """Motivo para rejeitar a curiosidade, ou None se estiver bem."""
    texto, origem = cur.get("texto", "").strip(), cur.get("origem", "").strip()
    if not texto or not origem:
        return "vazia"
    if len(texto) > 180:
        return "demasiado longa"
    origem_norm = normalizar(origem)
    if len(origem_norm) < 20 or origem_norm not in fonte_norm:
        return "a frase de origem não está no artigo"
    numeros_origem = set(re.findall(r"\d+", origem.replace(",", "").replace(".", "")))
    for n in re.findall(r"\d+", texto.replace(".", "").replace(",", "")):
        if n not in numeros_origem:
            return f"o número {n} não está na frase de origem"
    palavras_origem = set(origem_norm.split())
    for i, palavra in enumerate(re.findall(r"[A-ZÀ-Ý][\wÀ-ÿ'-]+", texto)):
        p = normalizar(palavra)
        if not p or p in _COMUNS or len(p) < 3 or p in nomes_jogador or any(p in n.split() for n in nomes_jogador):
            continue
        if p in palavras_origem or p in origem_norm:
            continue
        if any(p in pt.split() and en in origem_norm for pt, en in paises.items()):
            continue
        if len(p) >= 4 and any(w.startswith(p[:4]) for w in palavras_origem):
            continue
        return f"o nome \"{palavra}\" não está na frase de origem"
    return None


def gerar(cliente, registo: dict, fresco: bool = False) -> tuple[list[dict], list[dict], dict]:
    """(aceites, rejeitadas, fonte) para um registo."""
    titulo = registo["fontes"]["wikipedia"]
    textos = wp.wikitextos(cliente, [titulo])
    artigo = textos.get(titulo) or next(iter(textos.values()))
    fonte = wp.texto_curiosidades(artigo["texto"])
    pedido = f"Futebolista: {registo['nome']}\n\nTexto do artigo:\n\n{fonte}"
    resposta = llm.gerar_json(cliente, SISTEMA, pedido, ESQUEMA,
                              chave_cache=f"curiosidades|v{VERSAO}|{registo['id']}|{artigo['revid']}", fresco=fresco)
    fonte_norm = normalizar(fonte)
    nomes = {normalizar(registo["nome"])} | {normalizar(a) for a in registo.get("aliases", [])}
    paises = _paises_en_pt()
    aceites, rejeitadas = [], []
    for cur in resposta.get("curiosidades", [])[:8]:
        motivo = verificar(cur, fonte_norm, nomes, paises)
        item = {"texto": cur.get("texto", "").strip(), "origem": cur.get("origem", "").strip(), "tema": cur.get("tema")}
        (rejeitadas.append(dict(item, motivo=motivo)) if motivo else aceites.append(item))
    return aceites[:6], rejeitadas, {"modelo": config.GEMINI_MODELO, "versao": VERSAO, "revid": artigo["revid"]}


def correr(cliente, ids: list[str] | None = None, limite: int | None = None, refazer: bool = False,
           fresco: bool = False, registar=print) -> dict:
    """Gera as curiosidades em falta (ou todas, com refazer). Devolve {'feitos', 'saltados', 'falhas'}."""
    res = {"feitos": [], "saltados": [], "falhas": {}}
    caminhos = sorted(config.JOGADORES.glob("*.json"))
    if ids:
        caminhos = [c for c in caminhos if c.stem in set(ids)]
    feitos = 0
    for caminho in caminhos:
        registo = json.loads(caminho.read_text(encoding="utf-8"))
        if registo.get("curiosidades") and not refazer:
            res["saltados"].append(registo["id"])
            continue
        if limite is not None and feitos >= limite:
            break
        try:
            aceites, rejeitadas, fonte = gerar(cliente, registo, fresco=fresco)
        except llm.SemChave:
            raise
        except Exception as e:                       # noqa: BLE001 — um jogador com problemas não para o resto
            res["falhas"][registo["id"]] = f"{type(e).__name__}: {e}"
            registar(f"{registo['nome']}: FALHOU ({type(e).__name__})")
            continue
        registo["curiosidades"] = aceites
        registo.setdefault("fontes", {})["curiosidades"] = fonte
        caminho.write_text(json.dumps(registo, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        SAIDA_CURIOSIDADES.mkdir(parents=True, exist_ok=True)
        (SAIDA_CURIOSIDADES / f"{registo['id']}.json").write_text(
            json.dumps({"id": registo["id"], "nome": registo["nome"], "aceites": aceites, "rejeitadas": rejeitadas},
                       ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        feitos += 1
        res["feitos"].append(registo["id"])
        registar(f"{registo['nome']}: {len(aceites)} aceites, {len(rejeitadas)} rejeitadas")
    return res
