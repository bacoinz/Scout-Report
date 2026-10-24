"""Curiosidades do dossier, sobre a carreira: o LLM lê a introdução do artigo, a formação e os parágrafos de carreira
e estilo de jogo com mais sinais de facto curioso (recordes, estreias, transferências, finais, alcunhas…) e escreve
5–6 frases curtas em PT-PT, cada uma com a frase original da Wikipédia em que se baseia.

Cada curiosidade só é aceite se:
- a frase de origem existir mesmo no artigo (comparação sem acentos nem pontuação);
- todos os números da curiosidade aparecerem na frase de origem;
- os nomes próprios da curiosidade aparecerem na frase de origem (ou forem a tradução de um país, ou partilharem o
  início com uma palavra da frase: Lisboa/Lisbon, Milão/Milan).
As outras vão para saida/curiosidades/<QID>.json, e o relatório mostra-as com o motivo."""
import hashlib
import json
import re

from . import config
from .fontes import llm
from .fontes import wikipedia as wp
from .normalizar import normalizar

VERSAO = 5
SAIDA_CURIOSIDADES = config.SAIDA / "curiosidades"
TEMAS = ["recorde", "momento", "transferencia", "estreia", "formacao", "alcunha", "estilo", "selecao", "treinador",
         "fora_de_campo"]

SISTEMA = """És o redator de um jogo de adivinhar futebolistas, em português de Portugal (PT-PT: "equipa", "golo",
"guarda-redes", "treinador", "seleção", "relvado", "adepto"; nunca português do Brasil). Atenção às diferenças:
Mundial (não "Copa do Mundo"), livre (não "cobrança de falta"), baliza, equipa (não "time"), alcunha (feminino:
"a alcunha"), Jugoslávia, Montevideu, Jogos Olímpicos, dar os parabéns (não "parabenizar"), facto, contacto; e os
pronomes depois do verbo ("deu-lhe", "tornou-se"; não "lhe deu", "se tornou"). Os meses escrevem-se em minúsculas.
Recebes excertos de um artigo da Wikipédia inglesa sobre um futebolista. Escreve 7 curiosidades sobre a
CARREIRA dele, de preferência factos que um adepto acharia surpreendentes:
- recordes e "primeiras vezes" (o mais novo a…, o primeiro a…, o único a…);
- momentos marcantes ou insólitos em campo: estreias, golos decisivos, finais, expulsões, lesões, polémicas;
- transferências (valores, recordes, circunstâncias), como foi descoberto e a formação no clube;
- alcunhas ganhas em campo, celebrações, número da camisola, estilo de jogo;
- seleção e, se foi treinador, a carreira de treinador;
- no máximo uma curiosidade fora do campo (tema "fora_de_campo"), e só se tiver a ver com futebol; nada de vida
  amorosa, filhos ou família;
- evita só repetir o que o jogo já mostra noutro lado (lista de clubes, totais de jogos e golos, lista de títulos,
  local e data de nascimento): um título ou um clube podem aparecer, mas como parte de uma história;
- cada curiosidade é uma frase simples, com no máximo 140 caracteres, verdadeira segundo o texto, sem opiniões;
- escreve com ortografia correta do português europeu: acentos, maiúsculas nos nomes próprios ("Jugoslávia",
  "França"), concordância; relê cada frase e confirma que faz sentido;
- não comeces pelo nome do jogador; escreve na terceira pessoa ("Estreou-se…", "Foi o primeiro…");
- mantém os nomes próprios como estão no texto (exceto os países, que vão em português) e os números em algarismos;
- em "origem" copia, letra a letra, a frase do texto em que a curiosidade se baseia. Cada facto, número, ano,
  clube e competição da curiosidade tem de estar na origem: se a frase não tiver o ano, o clube ou a competição
  (porque vêm de trás), copia também a frase anterior que os tem, ou então não os ponhas na curiosidade. Não
  juntes factos de outras partes do texto.
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
    "jovem", "ano", "mundo", "século", "revelação", "bota", "prata", "bronze", "africano", "sul-americano",
    # Palavras genéricas dentro de nomes de prémios e instituições ("Melhor Médio", "Central Nuclear", "Associação de
    # Futebol"), que a frase inglesa escreve com outras palavras.
    "torneio", "geração", "botas", "central", "nuclear", "futebol", "médio", "guarda-redes", "defesa", "avançado",
    "extremo", "lateral", "capitão", "guerra", "independência", "associação", "federação", "nacional",
    "internacional", "equipa", "ordem", "oficial", "comendador", "cidade", "deus", "exército", "verão", "inverno",
    "academia", "escola", "universidade", "instituto", "fundação", "programa", "canal", "filme", "primeiro-ministro",
    "ministro", "governo", "república", "igreja", "infantaria", "marinha", "francês", "inglês", "egípcio", "italiano",
    "espanhol", "alemão", "holandês", "brasileiro", "argentino", "português", "europeia", "europeias", "mundiais",
}
# Marcas do português do Brasil que escapam aos modelos pequenos (o pedido já as proíbe; estas rejeitam-se).
_BRASIL = re.compile(r"\b(copa do mundo|cobranças? de (falta|livre)|parabeniz\w*|goleiro|zagueiro|torcedor\w*|camisa|"
                     r"gramado|gols?|time|equipe|você|ônibus|trem|balé|iugoslav\w*|montevidéu|olimpíadas|penais|pênaltis?|"
                     r"fato|contato|acadêmi\w*|o alcunha)\b",
                     re.I)
# Pronome antes do verbo sem palavra que o justifique ("Os pais o enviaram", "A avó o acompanhava"): em PT-PT é
# "enviaram-no", "acompanhava-o". Com "que", "não", "já"… antes, a próclise está certa ("que se tornou").
_PROCLISE = re.compile(r"(?<![\w-])(o|a|os|as|lhe|lhes|se|me|te|nos)\s+(\w+(?:ava|avam|ou|aram|eram|iram|iu)|deu|deram|fez|fizeram|disse|disseram|pôs|trouxe)\b",
                       re.I)
_ATRAEM = {"que", "não", "nunca", "já", "também", "quando", "onde", "como", "quem", "porque", "ainda", "sempre", "só",
           "até", "se", "mais", "bem", "assim", "talvez", "cujo", "cuja", "qual", "pois", "nem", "tanto", "logo"}
_COMUNS = {normalizar(p) for p in _COMUNS}               # compara-se sem acentos ("Campeões" → "campeoes")
# Grafias do Brasil que se corrigem sem risco (só muda o acento): "O Fenômeno" → "O Fenómeno".
_GRAFIAS_PT = {"fenômeno": "fenómeno", "prêmio": "prémio", "gênio": "génio", "tênis": "ténis", "quilômetro": "quilómetro",
               "econômic": "económic", "acadêmic": "académic", "atômic": "atómic", "cômic": "cómic", "gênero": "género",
               "anônim": "anónim", "fôlego": "fôlego", "elastico": "elástico"}


def corrigir_grafia(texto: str) -> str:
    for br, pt in _GRAFIAS_PT.items():
        texto = re.sub(br, lambda m: pt.capitalize() if m.group()[0].isupper() else pt, texto, flags=re.I)
    return texto
# Nomes de lugares que o português escreve de outra maneira (os países saem de paises.json).
_EXONIMOS = {"jugoslavia": "yugoslavia", "uniao sovietica": "soviet union", "checoslovaquia": "czechoslovakia",
             "kiev": "kyiv", "napoles": "naples", "genova": "genoa", "florenca": "florence", "sevilha": "seville",
             "corunha": "coruna", "argel": "algiers", "cairo": "cairo", "pequim": "beijing", "xangai": "shanghai",
             "basileia": "basel", "colonia": "cologne", "estugarda": "stuttgart", "dresda": "dresden"}


_POR_EXTENSO = dict(enumerate("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen "
                              "fifteen sixteen seventeen eighteen nineteen twenty".split()))
_POR_EXTENSO.update({30: "thirty", 40: "forty", 50: "fifty", 60: "sixty", 70: "seventy", 80: "eighty", 90: "ninety",
                     100: "hundred"})


def _paises_en_pt() -> dict:
    """{nome PT normalizado: nome EN normalizado} a partir de paises.json (o EN sai do título da seleção)."""
    caminho = config.PARTILHADO / "paises.json"
    if not caminho.exists():
        return {}
    paises = json.loads(caminho.read_text(encoding="utf-8"))["paises"]
    res = {normalizar(v["nome"]): normalizar(re.sub(r"\s+(men's\s+)?national.*$", "", v["selecao"])) for v in paises.values()}
    return {**res, **_EXONIMOS}


def _no_artigo(origem_norm: str, fonte_norm: str) -> str | None:
    """A frase de origem tal como está no artigo (normalizada), ou None. Os modelos pequenos às vezes copiam-na com
    uma ou duas palavras mudadas: aceita-se o trecho do artigo que tenha ≥ 85% das palavras dela (e as verificações
    seguintes usam esse trecho, não a cópia do modelo)."""
    if len(origem_norm) < 20:
        return None
    if origem_norm in fonte_norm:
        return origem_norm
    palavras = origem_norm.split()
    chave = {w for w in palavras if len(w) >= 4}
    if len(palavras) < 6 or not chave:
        return None
    fonte = fonte_norm.split()
    tamanho = len(palavras) + 4
    melhor, trecho = 0.0, None
    for i in range(max(1, len(fonte) - tamanho + 1)):
        janela = fonte[i:i + tamanho]
        r = len(chave & set(janela)) / len(chave)
        if r > melhor:
            melhor, trecho = r, " ".join(janela)
    return trecho if melhor >= 0.85 else None


def verificar(cur: dict, fonte_norm: str, nomes_jogador: set[str], paises: dict) -> str | None:
    """Motivo para rejeitar a curiosidade, ou None se estiver bem."""
    texto, origem = cur.get("texto", "").strip(), cur.get("origem", "").strip()
    if not texto or not origem:
        return "vazia"
    if len(texto) > 180:
        return "demasiado longa"
    brasil = _BRASIL.search(texto) or next(
        (m for m in _PROCLISE.finditer(texto)
         if (texto[:m.start()].split() or [""])[-1].lower().strip(",;") not in _ATRAEM), None)
    if brasil:
        return f"português do Brasil (\"{brasil.group()}\")"
    origem_norm = _no_artigo(normalizar(origem), fonte_norm)
    if not origem_norm:
        return "a frase de origem não está no artigo"
    numeros_origem = set(re.findall(r"\d+", origem.replace(",", "").replace(".", ""))) & set(origem_norm.split()) \
        if origem_norm != normalizar(origem) else set(re.findall(r"\d+", origem.replace(",", "").replace(".", "")))
    palavras_origem = set(origem_norm.split())
    for n in re.findall(r"\d+", texto.replace(".", "").replace(",", "")):
        if n in numeros_origem or _POR_EXTENSO.get(int(n)) in palavras_origem:
            continue                                     # "at age five" → "aos 5 anos"
        if len(n) == 2 and any(len(o) == 4 and o.endswith(n) for o in numeros_origem):
            continue                                     # "in the 1990s" → "nos anos 90"
        return f"o número {n} não está na frase de origem"
    for m in re.finditer(r"[A-ZÀ-Ý][\wÀ-ÿ'-]+", texto):
        if re.search(r"(^|[.!?:;]\s*[\"“«(]?)\s*$", texto[:m.start()]):
            continue                                     # início de frase: "Começou…", "Casou-se…"
        palavra = m.group()
        p = normalizar(palavra)
        if not p or p in _COMUNS or len(p) < 3 or p in nomes_jogador or any(p in n.split() for n in nomes_jogador):
            continue
        if p in palavras_origem or p in origem_norm:
            continue
        if any(p in pt.split() and (en in origem_norm or any(w[:5] == e[:5] for e in en.split() if len(e) >= 5
                                                               for w in palavras_origem))
               for pt, en in paises.items()):
            continue                                     # Ucrânia ↔ Ukraine/Ukrainian, Coreia do Sul ↔ Korea
        if len(p) >= 4 and any(w.startswith(p[:4]) for w in palavras_origem):
            continue
        return f"o nome \"{palavra}\" não está na frase de origem"
    return None


def gerar(cliente, registo: dict, fresco: bool = False,
          modelo: str = config.LLM_MODELO) -> tuple[list[dict], list[dict], dict]:
    """(aceites, rejeitadas, fonte) para um registo."""
    titulo = registo["fontes"]["wikipedia"]
    textos = wp.wikitextos(cliente, [titulo])
    artigo = textos.get(titulo) or next(iter(textos.values()))
    fonte = wp.texto_curiosidades(artigo["texto"])
    pedido = f"Futebolista: {registo['nome']}\n\nTexto do artigo:\n\n{fonte}"
    resposta = llm.gerar_json(cliente, SISTEMA, pedido, ESQUEMA,
                              chave_cache=f"curiosidades|v{VERSAO}|{registo['id']}|{artigo['revid']}", modelo=modelo,
                              fresco=fresco)
    fonte_norm = normalizar(fonte)
    nomes = {normalizar(registo["nome"])} | {normalizar(a) for a in registo.get("aliases", [])}
    paises = _paises_en_pt()
    candidatas = [c for c in resposta.get("curiosidades", [])[:8] if c.get("texto", "").strip()]
    revistas = [corrigir_grafia(r) for r in
                _rever(cliente, registo, artigo["revid"], [c["texto"].strip() for c in candidatas], modelo, fresco)]
    aceites, rejeitadas = [], []
    for cur, revista in zip(candidatas, revistas):
        original = cur["texto"].strip()
        item = {"texto": original, "origem": cur.get("origem", "").strip(), "tema": cur.get("tema")}
        motivo = verificar(dict(item, texto=revista), fonte_norm, nomes, paises)
        if motivo is None:
            aceites.append(dict(item, texto=revista, **({"antes": original} if revista != original else {})))
            continue
        # A revisão estragou alguma coisa (tirou um número, mudou um nome): fica a original, se passar.
        motivo_original = verificar(item, fonte_norm, nomes, paises) if revista != original else motivo
        if motivo_original is None:
            aceites.append(item)
        else:
            rejeitadas.append(dict(item, texto=revista, motivo=motivo,
                                   **({"antes": original} if revista != original else {})))
    # Confirmação: a frase portuguesa diz o mesmo que a de origem? (a verificação acima só vê números e nomes)
    fieis = _confirmar(cliente, registo, artigo["revid"], aceites, modelo, fresco)
    for item, (fiel, porque) in zip(list(aceites), fieis):
        if not fiel:
            aceites.remove(item)
            rejeitadas.append(dict(item, motivo=f"não diz o mesmo que a origem ({porque})" if porque
                                   else "não diz o mesmo que a origem"))
    # A carreira primeiro; no máximo uma fora do campo, no fim.
    carreira = [c for c in aceites if c.get("tema") != "fora_de_campo"]
    aceites = carreira[:6] + [c for c in aceites if c.get("tema") == "fora_de_campo"][:max(0, min(1, 6 - len(carreira)))]
    return aceites, rejeitadas, {"modelo": modelo, "versao": VERSAO, "revisao": REVISAO_VERSAO,
                                 "confirmacao": CONFIRMACAO_VERSAO,
                                     "revid": artigo["revid"]}


CONFIRMACAO_VERSAO = 2
CONFIRMACAO_SISTEMA = """Verificas traduções para um jogo de futebol. Cada par numerado tem uma curiosidade em português
(PT) e a frase da Wikipédia inglesa em que se baseia (EN). A curiosidade é um resumo: omitir pormenores (datas,
resultados, contexto, nomes secundários) NÃO é problema. Para cada par, classifica o "problema":
- "nenhum": tudo o que o PT diz está no EN, sem mudar o sentido;
- "acrescenta": o PT diz algo que o EN não diz;
- "troca": o PT muda um facto (quem fez o quê, a quem, quando, quanto, em que clube ou competição);
- "exagera": o PT diz "o primeiro", "o único", "o mais…" quando o EN diz "um dos", "o segundo", "o primeiro desde…",
  "o mais rápido" ou coisa parecida;
- "confuso": a frase portuguesa não faz sentido ou está mal escrita.
Em "porque", explica em poucas palavras (vazio se for "nenhum")."""
ESQUEMA_CONFIRMACAO = {"type": "object", "properties": {"respostas": {"type": "array", "items": {
    "type": "object",
    "properties": {"problema": {"type": "string", "enum": ["nenhum", "acrescenta", "troca", "exagera", "confuso"]},
                   "porque": {"type": "string"}},
    "required": ["problema", "porque"]}}}, "required": ["respostas"]}


def _confirmar(cliente, registo: dict, revid, itens: list[dict], modelo: str, fresco: bool) -> list[tuple[bool, str]]:
    """[(fiel, porquê)] por curiosidade. Se a confirmação falhar, ficam todas (a verificação já passou)."""
    if not itens:
        return []
    pedido = "\n\n".join(f"{i}. PT: {c['texto']}\n   EN: {c['origem']}" for i, c in enumerate(itens, 1))
    chave = "|".join(c["texto"] for c in itens)
    try:
        res = llm.gerar_json(cliente, CONFIRMACAO_SISTEMA, pedido, ESQUEMA_CONFIRMACAO, modelo=modelo, fresco=fresco,
                             chave_cache=f"confirmacao|v{CONFIRMACAO_VERSAO}|{registo['id']}|{revid}|"
                                         f"{hashlib.sha1(chave.encode()).hexdigest()}")
    except (llm.SemChave, llm.SemOllama, llm.QuotaDiaria):
        raise
    except Exception:                                    # noqa: BLE001
        return [(True, "")] * len(itens)
    respostas = res.get("respostas", [])
    if len(respostas) != len(itens):
        return [(True, "")] * len(itens)
    return [(r.get("problema", "nenhum") == "nenhum",
             f"{r.get('problema')}: {(r.get('porque') or '').strip()}".rstrip(": ")) for r in respostas]


REVISAO_VERSAO = 2
REVISAO_SISTEMA = """És revisor de textos em português de Portugal. Recebes frases curtas sobre um futebolista.
Muda só o que estiver errado; uma frase que já esteja correta fica exatamente igual. Corrige:
- gralhas, acentos e concordância (sem inventar palavras: usa só palavras portuguesas que existem);
- construções do Brasil: o pronome vai depois do verbo ("deu-lhe", "enviaram-no", "acompanhava-o"), exceto depois de
  "que", "não", "já", "também", "nunca" e afins; "Mundial" em vez de "Copa do Mundo"; "livre", "baliza", "equipa",
  "facto", "contacto", "Fenómeno", "dar os parabéns";
- frases confusas: reescreve-as de forma simples e clara.
Mantém todos os nomes próprios como estão, incluindo os das competições ("Copa América", "Copa Libertadores",
"Liga dos Campeões"). Não acrescentes nem tires factos, nomes, datas ou números. Devolve todas as frases, pela
mesma ordem."""


def _maiusculas(frase: str) -> set[str]:
    """Palavras com maiúscula que não estão no início de uma frase (nomes próprios)."""
    return {m.group() for m in re.finditer(r"[A-ZÀ-Ý][\wÀ-ÿ'-]+", frase)
            if not re.search(r"(^|[.!?:;]\s*[\"“«(']?)\s*$", frase[:m.start()])}
ESQUEMA_REVISAO = {"type": "object", "properties": {"frases": {"type": "array", "items": {"type": "string"}}},
                   "required": ["frases"]}


def _rever(cliente, registo: dict, revid, frases: list[str], modelo: str, fresco: bool) -> list[str]:
    """As frases revistas pelo mesmo modelo, pela mesma ordem; as originais se a revisão falhar."""
    if not frases:
        return frases
    pedido = "\n".join(f"{i}. {f}" for i, f in enumerate(frases, 1))
    try:
        res = llm.gerar_json(cliente, REVISAO_SISTEMA, pedido, ESQUEMA_REVISAO, modelo=modelo, fresco=fresco,
                             chave_cache=f"revisao|v{REVISAO_VERSAO}|v{VERSAO}|{registo['id']}|{revid}")
    except (llm.SemChave, llm.SemOllama, llm.QuotaDiaria):
        raise
    except Exception:                                    # noqa: BLE001 — sem revisão, ficam as originais
        return frases
    revistas = [re.sub(r"^\s*\d+[.)]\s*", "", f).strip() for f in res.get("frases", [])]
    if len(revistas) != len(frases) or not all(revistas):
        return frases
    # Uma revisão que tira um nome próprio ("Copa América" → "América") estraga a frase: fica a original.
    return [r if _maiusculas(f) <= _maiusculas(r) else f for f, r in zip(frases, revistas)]


def correr(cliente, ids: list[str] | None = None, limite: int | None = None, refazer: bool = False,
           fresco: bool = False, modelo: str = config.LLM_MODELO, registar=print) -> dict:
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
            aceites, rejeitadas, fonte = gerar(cliente, registo, fresco=fresco, modelo=modelo)
        except (llm.SemChave, llm.SemOllama):
            raise
        except llm.QuotaDiaria as e:                 # os seguintes também falhariam: retoma-se amanhã
            res["parado"] = str(e)
            registar(f"Parado: {e}")
            break
        except Exception as e:                       # noqa: BLE001 — um jogador com problemas não para o resto
            res["falhas"][registo["id"]] = f"{type(e).__name__}: {e}"
            registar(f"{registo['nome']}: FALHOU ({type(e).__name__})")
            continue
        registo["curiosidades"] = [{k: v for k, v in c.items() if k != "antes"} for c in aceites]
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
