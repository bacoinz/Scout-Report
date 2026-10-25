"""Calendário do Desafio do Dia: um jogador por data de Lisboa (dados/calendario.json → tabela `desafios` do D1).

- Hoje e amanhã nunca mudam (há quem esteja a jogar o de hoje, e o de amanhã já pode estar a ser servido pelo
  Worker): a exportação só preenche as datas de hoje + 2 a hoje + DIAS_A_FRENTE.
- Uma data a partir de hoje + 2 cujo jogador saiu da base, ou deixou de ser do Desafio, recebe outro.
- A ordem: os jogadores do Desafio pelo sha1("scout-report:dia:<QID>"), a mesma que o Worker usa nas datas sem
  linha (jogo/src/dia.js). Cada data nova recebe o que saiu menos vezes no calendário e, em empate, o primeiro
  nessa ordem. Assim ninguém repete antes de todos terem saído, e os jogadores novos entram logo a seguir.
"""
import hashlib
import json
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone

from . import config

CALENDARIO = config.DADOS / "calendario.json"
DIAS_A_FRENTE = 60
DIAS_MINIMOS = 30   # o `estado` avisa abaixo disto


def _ultimo_domingo(ano: int, mes: int) -> date:
    ultimo = (date(ano, mes + 1, 1) if mes < 12 else date(ano + 1, 1, 1)) - timedelta(days=1)
    return ultimo - timedelta(days=(ultimo.weekday() + 1) % 7)


def hoje_lisboa(agora: datetime | None = None) -> date:
    """A data em Lisboa: UTC+1 do último domingo de março ao último domingo de outubro (a hora muda à 01:00 UTC),
    UTC+0 no resto do ano. Sem zoneinfo, que no Windows precisaria do pacote tzdata."""
    agora = agora or datetime.now(timezone.utc)
    verao = datetime.combine(_ultimo_domingo(agora.year, 3), time(1), timezone.utc)
    inverno = datetime.combine(_ultimo_domingo(agora.year, 10), time(1), timezone.utc)
    return (agora + timedelta(hours=1 if verao <= agora < inverno else 0)).date()


def ordem(ids) -> list[str]:
    return sorted(ids, key=lambda q: hashlib.sha1(f"scout-report:dia:{q}".encode()).hexdigest())


def ler() -> dict:
    return json.loads(CALENDARIO.read_text(encoding="utf-8")) if CALENDARIO.exists() else {}


def guardar(calendario: dict) -> None:
    CALENDARIO.write_text(json.dumps(dict(sorted(calendario.items())), indent=1) + "\n", encoding="utf-8")


def estender(calendario: dict, ids_do_desafio, hoje: date, dias: int = DIAS_A_FRENTE) -> dict:
    """O calendário com as datas de hoje + 2 a hoje + `dias` preenchidas (devolve uma cópia)."""
    cal = dict(calendario)
    validos = set(ids_do_desafio)
    primeira = (hoje + timedelta(days=2)).isoformat()
    for d in [d for d, q in cal.items() if d >= primeira and q not in validos]:
        del cal[d]
    if not validos:
        return cal
    posicao = {q: i for i, q in enumerate(ordem(validos))}
    usos = Counter(q for q in cal.values() if q in validos)
    for i in range(2, dias + 1):
        d = (hoje + timedelta(days=i)).isoformat()
        if d in cal:
            continue
        q = min(posicao, key=lambda x: (usos[x], posicao[x]))
        cal[d] = q
        usos[q] += 1
    return cal


def dias_a_frente(calendario: dict, hoje: date) -> int:
    """Quantos dias seguidos, a partir de hoje, já têm jogador."""
    n = 0
    while (hoje + timedelta(days=n)).isoformat() in calendario:
        n += 1
    return n
