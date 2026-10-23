"""Normalização de texto e de épocas (puro, sem I/O). `normalizar` é igual a `normalizar` em jogo/…/nomes.js."""
import re
import unicodedata

_ESPECIAIS = str.maketrans({"ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ß": "ss", "æ": "ae", "œ": "oe", "ı": "i"})
_APOSTROFOS = re.compile(r"['’‘`´ʼ]")
_NAO_ALFANUM = re.compile(r"[^a-z0-9]+")


def normalizar(texto) -> str:
    """Minúsculas, sem acentos, sem pontuação, espaços simplificados."""
    t = unicodedata.normalize("NFD", str(texto or "").lower())
    t = "".join(c for c in t if not unicodedata.category(c).startswith("M"))
    t = _APOSTROFOS.sub("", t.translate(_ESPECIAIS))
    return _NAO_ALFANUM.sub(" ", t).strip()


def slug(texto) -> str:
    return normalizar(texto).replace(" ", "-")


# Palavras que não distinguem clubes ("FC", "Sporting Clube de"…), para comparar nomes de fontes diferentes.
_VAZIAS_CLUBE = {
    "fc", "cf", "sc", "sl", "ac", "afc", "cd", "ud", "sd", "rc", "rcd", "ssc", "as", "us", "sv", "vfb", "vfl", "tsg",
    "fk", "nk", "sk", "hnk", "gnk", "pfc", "ca", "ec", "se", "cr", "club", "clube", "futebol", "football", "calcio",
    "al", "el", "fussball",
    "de", "do", "da", "dos", "das", "del", "la", "le", "les", "the", "of", "e", "y", "and", "1893", "1899", "1900",
    "1909", "1904", "1906", "1912", "1919", "1860", "05", "04", "1846",
}


# Nomes que as fontes escrevem de maneiras sem palavras em comum (normalizados, palavra inteira).
_ALIAS_CLUBE = {"psg": "paris saint germain", "internazionale": "inter milan",
                "man utd": "manchester united", "man city": "manchester city", "spurs": "tottenham hotspur",
                "atleti": "atletico madrid", "bayern munchen": "bayern munich", "dinamo kiev": "dynamo kyiv",
                "dynamo kiev": "dynamo kyiv", "zenit sao petersburgo": "zenit saint petersburg"}
_ALIAS_NOME_INTEIRO = {"inter": "inter milan"}
# Palavras que muitos clubes partilham: contam pouco ('Swansea City' e 'Coventry City' quase não se parecem).
_FRACAS_CLUBE = {"city", "united", "real", "sporting", "athletic", "atletico", "inter", "dynamo", "dinamo", "racing",
                 "olympique", "deportivo", "town", "rovers", "wanderers", "albion", "hotspur", "county", "union"}
# Só no fim do nome ("S.C. Braga" normaliza para "s c braga", e esse "c" não é uma equipa C), ou "Dynamo-2 Kyiv".
_RESERVA = re.compile(r"\b(b|c|ii|u ?2[1-3]|reserves?)$|\b2\b")


def _expandir(nome: str) -> str:
    t = normalizar(nome)
    t = _ALIAS_NOME_INTEIRO.get(t, t)
    for curto, longo in _ALIAS_CLUBE.items():
        t = re.sub(rf"\b{curto}\b", longo, t)
    return t


def reserva(nome: str) -> bool:
    """Equipa B / segunda equipa: 'Benfica B', 'Molde FK 2', 'Dynamo-2 Kyiv', 'Bryne[B]' (sem as siglas com pontos:
    'Manchester City F.C.' não é uma equipa C)."""
    return bool(_RESERVA.search(normalizar(str(nome or "").replace(".", ""))))


def chaves_clube(nome: str) -> set[str]:
    """Palavras significativas de um nome de clube: 'S.L. Benfica' → {'benfica'}; 'AC Milan' → {'milan'}."""
    return {p for p in _expandir(nome).split() if p not in _VAZIAS_CLUBE and len(p) > 1}


def semelhanca_clube(a: str, b: str) -> float:
    """Quanto se parecem dois nomes de clube: palavras significativas em comum, +1 se um nome contém o outro.
    0 = nada em comum (ou só um deles é uma equipa B). Serve para escolher entre passagens no mesmo ano
    ('Manchester City' vs 'Manchester United', 'Sporting CP' vs 'Sporting CP B')."""
    if not a or not b or reserva(a) != reserva(b):
        return 0
    na, nb = _expandir(a).replace(" ", ""), _expandir(b).replace(" ", "")
    contem = bool(na and nb) and (na in nb or nb in na)
    comuns = chaves_clube(a) & chaves_clube(b)
    return sum(0.25 if p in _FRACAS_CLUBE else 1 for p in comuns) + int(contem)


def mesmo_clube(a: str, b: str) -> bool:
    """Nomes de clube compatíveis (partilham uma palavra significativa, ou um contém o outro)."""
    ka, kb = chaves_clube(a), chaves_clube(b)
    if ka & kb:
        return True
    na, nb = normalizar(a).replace(" ", ""), normalizar(b).replace(" ", "")
    return bool(na and nb) and (na in nb or nb in na)


# --- Épocas -------------------------------------------------------------------------------------
# Uma época guarda-se pelo ano em que começa: "2024/25" → 2024; "2009" (calendário) → 2009.
_EPOCA = re.compile(r"^\s*(\d{2}|\d{4})\s*(?:[-/–]\s*(\d{2}|\d{4}))?\s*$")


def ler_epoca(texto: str) -> int | None:
    """Ano de início de uma época: '2007/08' → 2007; '1999/00' → 1999; '2009' → 2009; '07/08' → 2007."""
    m = _EPOCA.match(str(texto or ""))
    if not m:
        return None
    n = m.group(1)
    if len(n) == 4:
        return int(n)
    v = int(n)
    return 1900 + v if v >= 50 else 2000 + v


_ANOS = re.compile(r"(\d{4})\s*(?:[–\-—]\s*(\d{4}|\d{2})?)?")


def ler_anos(texto: str) -> tuple[int | None, int | None, bool]:
    """Anos de uma passagem na caixa da Wikipédia: '2002–2003' → (2002, 2003, False); '2023–' → (2023, None, True);
    '2009' → (2009, 2009, False). O terceiro valor diz se a passagem continua (sem fim)."""
    t = str(texto or "").strip()
    m = _ANOS.search(t)
    if not m:
        return None, None, False
    inicio = int(m.group(1))
    tem_traco = bool(re.search(r"\d{4}\s*[–\-—]", t))
    if m.group(2):
        fim = int(m.group(2))
        if fim < 100:
            fim = inicio // 100 * 100 + fim
        return inicio, fim, False
    if tem_traco:
        return inicio, None, True
    return inicio, inicio, False
