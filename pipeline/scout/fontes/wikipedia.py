"""Wikipédia inglesa: títulos → QID, wikitexto, caixa de informação (os dois formatos), títulos ganhos,
plantéis com números (épocas dos clubes e fases finais) e texto para as curiosidades."""
import re

import mwparserfromhell as mwp

from .. import config
from ..normalizar import ler_anos, normalizar

LOTE_TITULOS = 50
LOTE_TEXTO = 10


# --- API --------------------------------------------------------------------------------------------------------

def info_titulos(cliente, titulos, fresco: bool = False) -> dict:
    """{título pedido: {'titulo': canónico, 'qid': Q… | None, 'existe': bool}} (segue redirecionamentos)."""
    titulos = [t for t in dict.fromkeys(titulos) if t]
    res = {}
    for i in range(0, len(titulos), LOTE_TITULOS):
        lote = titulos[i:i + LOTE_TITULOS]
        dados = cliente.api(config.WIKIPEDIA_API, {"action": "query", "prop": "pageprops", "ppprop": "wikibase_item",
                                                   "redirects": "1", "titles": "|".join(lote)}, fresco=fresco)
        q = dados.get("query", {})
        passo = {d["from"]: d["to"] for d in q.get("normalized", [])}
        redir = {d["from"]: d["to"] for d in q.get("redirects", [])}
        paginas = {p["title"]: p for p in q.get("pages", [])}
        for t in lote:
            final = passo.get(t, t)
            final = redir.get(final, final)
            p = paginas.get(final, {})
            res[t] = {"titulo": final, "qid": (p.get("pageprops") or {}).get("wikibase_item"),
                      "existe": bool(p) and not p.get("missing") and not p.get("invalid")}
    return res


def wikitextos(cliente, titulos, fresco: bool = False) -> dict:
    """{título canónico: {'revid': n, 'texto': wikitexto}} (só os que existem)."""
    titulos = [t for t in dict.fromkeys(titulos) if t]
    res = {}
    for i in range(0, len(titulos), LOTE_TEXTO):
        lote = titulos[i:i + LOTE_TEXTO]
        params = {"action": "query", "prop": "revisions", "rvprop": "ids|content", "rvslots": "main", "redirects": "1",
                  "titles": "|".join(lote)}
        while True:
            dados = cliente.api(config.WIKIPEDIA_API, params, fresco=fresco)
            for p in dados.get("query", {}).get("pages", []):
                revs = p.get("revisions")
                if revs:
                    res[p["title"]] = {"revid": revs[0]["revid"], "texto": revs[0]["slots"]["main"]["content"]}
            # Páginas grandes passam o limite da resposta: a API devolve só algumas e pede para continuar.
            if "continue" not in dados:
                break
            params = {**params, **dados["continue"]}
    return res


# --- Secções ----------------------------------------------------------------------------------------------------
_CABECALHO = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$", re.M)


def secoes(texto: str) -> list[tuple[int, str, str]]:
    """[(nível, título, wikitexto da secção com as subsecções)], lidas com uma expressão regular: o
    mwparserfromhell perde secções quando uma tabela ou predefinição anterior fica por fechar (Cristiano Ronaldo)."""
    cabs = list(_CABECALHO.finditer(texto))
    res = []
    for i, m in enumerate(cabs):
        nivel = len(m.group(1))
        fim = next((c.start() for c in cabs[i + 1:] if len(c.group(1)) <= nivel), len(texto))
        res.append((nivel, limpo(m.group(2)), texto[m.start():fim]))
    return res


# --- Caixa de informação ------------------------------------------------------------------------------------------

def caixa_futebol(texto: str) -> dict | None:
    """Parâmetros da {{Infobox football biography}}, mesmo quando vem dentro de outra caixa (module=)."""
    for t in mwp.parse(texto).filter_templates(recursive=True):
        if normalizar(str(t.name)).startswith("infobox football biography"):
            return {str(p.name).strip(): p.value for p in t.params}
    return None


def limpo(valor) -> str:
    """Texto visível de um valor (sem ligações, referências nem predefinições)."""
    if valor is None:
        return ""
    texto = mwp.parse(str(valor)).strip_code(normalize=True, collapse=True)
    return re.sub(r"\s+", " ", texto).strip()


def primeira_ligacao(valor) -> tuple[str | None, str]:
    """(título da 1.ª ligação interna, texto visível)."""
    if valor is None:
        return None, ""
    codigo = mwp.parse(str(valor))
    for l in codigo.filter_wikilinks():
        titulo = str(l.title).strip()
        if ":" in titulo and titulo.split(":")[0].lower() in {"file", "image", "category", "ficheiro"}:
            continue
        return titulo.split("#")[0], limpo(l.text if l.text else l.title)
    return None, limpo(codigo)


def _num(valor) -> int | None:
    m = re.search(r"\d+", limpo(valor))
    return int(m.group()) if m else None


def _p(caixa: dict, *nomes):
    for n in nomes:
        if n in caixa and str(caixa[n]).strip():
            return caixa[n]
    return None


_SELECAO_JOVEM = re.compile(r"\bunder[- ]?\d{2}\b|\bu-?\d{2}\b|olympic|\bb\b national|\bb team\b|youth|amateur|"
                            r"\bsub-?\d{2}\b|universiade|futsal|beach", re.I)


def carreira(caixa: dict) -> dict:
    """Passagens de clube (seniores), seleções seniores e equipas treinadas, tal como a caixa as dá."""
    clubes, selecoes, treinador = [], [], []
    for i in range(1, 61):
        v = _p(caixa, f"clubs{i}")
        if v is None:
            continue
        titulo, nome = primeira_ligacao(v)
        texto = str(v)
        inicio, fim, aberto = ler_anos(limpo(_p(caixa, f"years{i}")))
        clubes.append({"titulo": titulo, "nome": nome.replace("→", "").replace("(loan)", "").strip(),
                       "emprestimo": "→" in texto or "loan" in texto.lower() or "&rarr;" in texto,
                       "inicio": inicio, "fim": fim, "aberto": aberto,
                       "jogos_liga": _num(_p(caixa, f"caps{i}")), "golos_liga": _num(_p(caixa, f"goals{i}"))})
    for i in range(1, 31):
        v = _p(caixa, f"national_team{i}", f"nationalteam{i}")
        if v is None:
            continue
        titulo, nome = primeira_ligacao(v)
        alvo = f"{titulo or ''} {nome}"
        inicio, fim, aberto = ler_anos(limpo(_p(caixa, f"national_years{i}", f"nationalyears{i}")))
        selecoes.append({"titulo": titulo, "nome": nome, "senior": not _SELECAO_JOVEM.search(alvo),
                         "inicio": inicio, "fim": fim, "aberto": aberto,
                         "jogos": _num(_p(caixa, f"national_caps{i}", f"nationalcaps{i}")),
                         "golos": _num(_p(caixa, f"national_goals{i}", f"nationalgoals{i}"))})
    for i in range(1, 41):
        v = _p(caixa, f"manager_clubs{i}", f"managerclubs{i}")
        if v is None:
            continue
        titulo, nome = primeira_ligacao(v)
        inicio, fim, aberto = ler_anos(limpo(_p(caixa, f"manager_years{i}", f"manageryears{i}")))
        interino = "caretaker" in str(v).lower() or "interim" in str(v).lower()
        adjunto = "assistant" in str(v).lower()
        treinador.append({"titulo": titulo, "nome": re.sub(r"\((caretaker|interim|assistant)\)", "", nome).strip(),
                          "inicio": inicio, "fim": fim, "aberto": aberto, "interino": interino, "adjunto": adjunto})
    return {"clubes": clubes, "selecoes": selecoes, "treinador": treinador}


def dados_caixa(caixa: dict) -> dict:
    return {
        "nome": limpo(_p(caixa, "name")),
        "nome_completo": limpo(_p(caixa, "full_name", "fullname")),
        "posicao": limpo(_p(caixa, "position")),
        "clube_atual": primeira_ligacao(_p(caixa, "current_club", "currentclub"))[0],
        "altura": limpo(_p(caixa, "height")),
        "atualizacao_clubes": limpo(_p(caixa, "club-update", "club_update", "pcupdate")),
        "atualizacao_selecao": limpo(_p(caixa, "nationalteam-update", "national_team_update", "ntupdate")),
    }


# --- Títulos (secção "Honours") ------------------------------------------------------------------------------------

_SECAO_TITULOS = re.compile(r"^\s*(honours|honors|titles|achievements)", re.I)
_TREINADOR = re.compile(r"manager|coach|head coach|as a manager", re.I)
_INDIVIDUAL = re.compile(r"individual|personal|records|orders|decorations", re.I)
_VICE = re.compile(r"runner[s]?[- ]?up|second place|third place|finalist|silver|bronze", re.I)
_ANO = re.compile(r"\b(1[89]\d{2}|20\d{2})(?:\s*[–\-/]\s*\d{2,4})?\b")
# "Ballon d'Or: 1996 (26th place)" é um lugar na votação, não uma vitória.
_LUGAR = re.compile(r"^\s*\)?\s*\(?\s*(\d+\s*(st|nd|rd|th)\b|runner|second|third|nominated|shortlist)", re.I)
# "7th place (1999)": o lugar vem antes do ano.
_LUGAR_ANTES = re.compile(r"(\d+\s*(st|nd|rd|th)\s+place|runners?[- ]?up|second place|third place|nominated)\W*$", re.I)
_REF = re.compile(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", re.I | re.S)
_JOVEM = re.compile(r"\bu-?\d{2}\b|under-?\d{2}|youth", re.I)


def _anos_ganhos(texto: str) -> list[int]:
    """Anos de vitória numa lista "2002–03, 2004 (2nd place); runner-up: 2004–05" → [2002]."""
    anos = []
    for parte in texto.split(";"):
        if _VICE.search(parte.split(":")[0]) and ":" in parte:     # "runner-up: 2004–05"
            continue
        for m in _ANO.finditer(parte):
            if not _LUGAR.match(parte[m.end():m.end() + 20]) and \
                    not _LUGAR_ANTES.search(parte[max(0, m.start() - 25):m.start()]):
                anos.append(int(m.group(1)))
    return anos


def titulos(texto: str) -> list[dict]:
    """Linhas da secção de títulos: {'contexto': jogador|treinador, 'tipo': clube|selecao|individual|jovem,
    'competicao': título da ligação, 'texto', 'n': quantas vezes, 'anos': [...], 'vice': bool}.
    'jovem' = títulos das seleções jovens (U20, U21…), que não contam."""
    seccoes = [c for n, t, c in secoes(texto) if n == 2 and _SECAO_TITULOS.match(t)]
    if not seccoes:
        return []
    res = []
    contexto, tipo, tipo_secao = "jogador", "clube", "clube"
    ignorar = False
    for linha in _REF.sub("", str(seccoes[0])).splitlines():
        cab = re.match(r"^(={2,6})\s*(.*?)\s*\1\s*$", linha) or re.match(r"^'''\s*(.*?)\s*'''\s*:?\s*$", linha)
        if cab:
            titulo_cab = limpo(cab.group(cab.lastindex))
            nivel = len(cab.group(1)) if cab.lastindex == 2 else 9      # 9 = nome a negrito (clube, país)
            if nivel <= 3:                               # "Records" e "Orders" não são títulos ganhos
                ignorar = bool(re.search(r"records|orders|decorations|state honours", titulo_cab, re.I))
            if ignorar:
                continue
            if _TREINADOR.search(titulo_cab) and (nivel <= 4 or nivel == 9):
                contexto, tipo_secao = "treinador", "clube"
            elif nivel <= 3 and re.search(r"\bplayer\b", titulo_cab, re.I):
                contexto, tipo_secao = "jogador", "clube"
            # O tipo sai dos cabeçalhos ("Club", "International", "Individual"). Um nome a negrito volta ao tipo da
            # secção (um país dentro de "International" continua a ser de seleção), exceto as seleções jovens.
            if _JOVEM.search(titulo_cab):
                tipo = "jovem"
                continue
            if re.search(r"international|national team", titulo_cab, re.I) or \
                    re.search(r"national (football|soccer) team", str(cab.group(cab.lastindex)), re.I):
                tipo_secao = "selecao"
            elif _INDIVIDUAL.search(titulo_cab):
                tipo_secao = "individual"
            elif nivel != 9 and re.search(r"\bclubs?\b", titulo_cab, re.I):
                tipo_secao = "clube"
            tipo = tipo_secao
            continue
        if ignorar or not linha.startswith("*"):
            continue
        if linha.startswith("**") and res:               # sub-linha ("** 7th place (1999)"): anos da linha de cima
            res[-1]["_anos_texto"] += "; " + limpo(linha.lstrip("*"))
            continue
        corpo = linha.lstrip("*").strip()
        antes, _, depois = corpo.partition(":")
        comp, _ = primeira_ligacao(antes if "[[" in antes else corpo)
        texto_linha = limpo(corpo)
        res.append({"contexto": contexto, "tipo": tipo, "competicao": comp, "texto": texto_linha,
                    "_anos_texto": limpo(depois) if depois else texto_linha,
                    "vice": bool(_VICE.search(limpo(antes) if depois else texto_linha))})
    for l in res:
        texto_anos = l.pop("_anos_texto")
        l["anos"] = _anos_ganhos(texto_anos)
        l["n"] = max(1, len(l["anos"]))
        l["vice"] = l["vice"] or (not l["anos"] and bool(_ANO.search(texto_anos)))   # só lugares, nenhuma vitória
    return res


# --- Plantéis com números ------------------------------------------------------------------------------------------

def titulos_epoca(titulo_clube: str, inicio: int, fim: int) -> list[str]:
    """'Manchester United F.C.', 2003, 2005 → ['2003–04 Manchester United F.C. season', ...]."""
    res = []
    for a in range(inicio, fim + 1):
        b = a + 1
        res.append(f"{a}–{b % 100:02d} {titulo_clube} season" if b % 100 else f"{a}–{b} {titulo_clube} season")
    return res


def _e_o_jogador(titulo: str | None, visivel: str, nomes_jogador: set[str], so_ligacao: bool) -> bool:
    if titulo and "(" in titulo and normalizar(titulo) not in nomes_jogador:
        return False                                     # outro jogador com o mesmo nome visível
    candidatos = {normalizar(titulo)} if (so_ligacao and titulo) else {normalizar(titulo or ""), normalizar(visivel)}
    return bool(candidatos & nomes_jogador)


def _numero(texto: str) -> int | None:
    m = re.fullmatch(r"\s*(\d{1,2})\s*", texto or "")
    return int(m.group(1)) if m and 1 <= int(m.group(1)) <= 99 else None


_TABELA = re.compile(r"^\{\|(.*?)^\|\}", re.S | re.M)
_CAB_NUMERO = {"no", "no.", "n", "nº", "n.º", "number", "squad no", "squad no.", "#", "shirt", "shirt no"}


def _numeros_em_tabelas(texto: str, nomes_jogador: set[str], so_ligacao: bool) -> set[int]:
    """Tabelas "Squad statistics" ({| … |}) cuja 1.ª coluna é o número: '|7||MF||[[Cristiano Ronaldo]]'."""
    res = set()
    for tabela in _TABELA.finditer(texto):
        corpo = tabela.group(1)
        cab = re.search(r"^!(.*)$", corpo, re.M)
        if not cab:
            continue
        primeiro = cab.group(1).split("!!")[0].split("|")[-1]
        if limpo(primeiro).lower() not in _CAB_NUMERO:
            continue
        for linha in re.split(r"^\|-.*$", corpo, flags=re.M):
            linha = linha.strip()
            if not linha.startswith("|") or linha.startswith("|+"):
                continue
            celulas = re.split(r"\|\||\n\|", linha[1:])
            primeira = celulas[0].split("|")[-1] if "=" in celulas[0].split("|")[0] else celulas[0]
            n = _numero(limpo(primeira))
            if n is None:
                continue
            for l in mwp.parse(linha).filter_wikilinks():
                titulo = str(l.title).strip()
                if ":" in titulo:
                    continue
                if _e_o_jogador(titulo, limpo(l.text if l.text else l.title), nomes_jogador, so_ligacao):
                    res.add(n)
                    break
    return res


def numeros_no_plantel(texto: str, nomes_jogador: set[str], so_ligacao: bool = False) -> set[int]:
    """Números de camisola do jogador nas predefinições de plantel ({{fs player|no=7|name=[[…]]}} e afins) e nas
    tabelas de estatísticas do plantel. Com so_ligacao (homónimos: "João Pinto (footballer, born 1961)"), só conta a
    ligação para o artigo certo."""
    res = set()
    for t in mwp.parse(texto).filter_templates(recursive=True):
        if "player" not in normalizar(str(t.name)):
            continue
        # {{fs player|no=7|name=[[…]]}}, {{fb si player|n=10|p=[[…]]}} e afins.
        p_num = next((p for p in ("no", "n", "number", "num") if t.has(p)), None)
        p_nome = next((p for p in ("name", "nome", "p", "player") if t.has(p)), None)
        if not p_num or not p_nome:
            continue
        titulo, visivel = primeira_ligacao(t.get(p_nome).value)
        if _e_o_jogador(titulo, visivel, nomes_jogador, so_ligacao):
            m = re.search(r"\d{1,2}", limpo(t.get(p_num).value))
            if m and 1 <= int(m.group()) <= 99:
                res.add(int(m.group()))
    return res | _numeros_em_tabelas(texto, nomes_jogador, so_ligacao)


# --- Ligas por época (tabela "Career statistics") ------------------------------------------------------------------

def _separar_atributos(celula: str) -> tuple[str, str]:
    """'rowspan="5"|[[AS Cannes|Cannes]]' → ('rowspan="5"', '[[AS Cannes|Cannes]]'). Ignora as barras dentro de
    [[…]] e {{…}}."""
    nivel = 0
    for i, ch in enumerate(celula):
        if celula.startswith(("[[", "{{"), i):
            nivel += 1
        elif celula.startswith(("]]", "}}"), i):
            nivel -= 1
        elif ch == "|" and nivel == 0 and not celula.startswith("||", i):
            antes = celula[:i]
            if "=" in antes or not antes.strip():
                return antes, celula[i + 1:]
            break
    return "", celula


def _grelha(corpo: str) -> list[tuple[bool, list[str]]]:
    """Linhas de uma tabela wiki com os rowspan/colspan expandidos: [(é cabeçalho, [células em wikitexto])]."""
    res, pendentes = [], {}                              # coluna → [linhas que ainda ocupa, valor]

    def usar_pendente(linha_exp, col):
        linha_exp.append(pendentes[col][1])
        pendentes[col][0] -= 1
        if pendentes[col][0] <= 0:
            del pendentes[col]

    for bloco in re.split(r"^\|-.*$", corpo, flags=re.M):
        celulas, cabecalho = [], None
        for linha in bloco.split("\n"):
            linha = linha.strip()
            if not linha or linha.startswith("|+"):
                continue
            if linha[0] in "|!":
                if cabecalho is None:
                    cabecalho = linha[0] == "!"
                celulas += re.split(r"\|\||!!", linha[1:])
            elif celulas:
                celulas[-1] += "\n" + linha
        if not celulas:
            continue
        linha_exp, col, novos = [], 0, {}
        for celula in celulas:
            while col in pendentes:
                usar_pendente(linha_exp, col)
                col += 1
            atrs, valor = _separar_atributos(celula.strip())
            rs = re.search(r'rowspan\s*=\s*"?(\d+)', atrs)
            cs = re.search(r'colspan\s*=\s*"?(\d+)', atrs)
            for _ in range(int(cs.group(1)) if cs else 1):
                if rs and int(rs.group(1)) > 1:
                    novos[col] = [int(rs.group(1)) - 1, valor.strip()]
                linha_exp.append(valor.strip())
                col += 1
        while col in pendentes:
            usar_pendente(linha_exp, col)
            col += 1
        pendentes.update(novos)                          # só ocupam as linhas seguintes
        res.append((bool(cabecalho), linha_exp))
    return res


_EPOCA_TEXTO = re.compile(r"^\d{4}(?:\s*[–\-/]\s*\d{2,4})?$")


def ligas_por_epoca(texto: str) -> list[dict]:
    """Da tabela de clubes de "Career statistics": [{'clube_titulo', 'clube_nome', 'epoca', 'liga_titulo'}].
    A liga sai da ligação da coluna "Division" (as linhas seguintes repetem só o texto) ou, em falta, do artigo da
    época da liga ligado na coluna "Season" ("[[1988–89 French Division 1|1988–89]]")."""
    seccoes = [c for n, t, c in secoes(texto) if n == 2 and re.match(r"(career )?statistics", t, re.I)]
    res = []
    for seccao in seccoes[:1]:
        clube = [c for n, t, c in secoes(seccao) if n == 3 and re.match(r"club", t, re.I)]
        for tabela in _TABELA.finditer(clube[0] if clube else seccao):
            if not re.search(r"^!.*season", tabela.group(1), re.I | re.M):
                continue
            ligacao_de_texto = {}
            for cabecalho, linha in _grelha(tabela.group(1)):
                if cabecalho:
                    continue
                k = next((i for i, c in enumerate(linha) if _EPOCA_TEXTO.match(limpo(c))), None)
                if k is None or k == 0 or k + 1 >= len(linha):
                    continue
                titulo_clube, nome_clube = primeira_ligacao(linha[k - 1])
                titulo_div, texto_div = primeira_ligacao(linha[k + 1])
                if titulo_div:
                    ligacao_de_texto[texto_div] = titulo_div
                else:
                    titulo_div = ligacao_de_texto.get(texto_div)
                if not titulo_div:
                    titulo_ep, _ = primeira_ligacao(linha[k])
                    if titulo_ep and not titulo_ep.endswith("season"):
                        titulo_div = titulo_ep
                if titulo_div:                           # "2005–06 Premier League" → "Premier League"
                    titulo_div = re.sub(r"^\d{4}(?:[–\-]\d{2,4})?\s+", "", titulo_div)
                res.append({"clube_titulo": titulo_clube, "clube_nome": re.sub(r"\(loan\)", "", nome_clube).strip(),
                            "epoca": int(limpo(linha[k])[:4]), "liga_titulo": titulo_div})
    return res


# --- Texto para as curiosidades ------------------------------------------------------------------------------------

_SECOES_CURIOSIDADES = re.compile(r"early (life|years|career)|personal life|style of play|player profile|"
                                  r"background|outside football|legacy", re.I)


def texto_curiosidades(texto: str, maximo: int = 9000) -> str:
    """Texto simples das secções com mais curiosidades (infância, vida pessoal, estilo de jogo…) e da introdução."""
    partes = [limpo(_CABECALHO.split(texto, maxsplit=1)[0])]          # a introdução
    escolhidas = [(n, c) for n, t, c in secoes(texto) if n in (2, 3) and _SECOES_CURIOSIDADES.search(t)]
    for n, c in escolhidas:
        if n == 3 and any(n2 == 2 and c in c2 for n2, c2 in escolhidas):
            continue                                     # já vem dentro da secção de cima
        partes.append(limpo(c))
    juntos = "\n\n".join(p for p in partes if p)
    return juntos[:maximo]
