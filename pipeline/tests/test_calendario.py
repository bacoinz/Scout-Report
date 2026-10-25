"""Calendário do Desafio do Dia (sem rede)."""
from collections import Counter
from datetime import date, datetime, timezone

from scout import calendario

IDS = ["Q615", "Q11571", "Q36488", "Q1835", "Q83163"]
HOJE = date(2026, 10, 25)


def test_hoje_lisboa_com_hora_de_verao():
    utc = lambda *a: datetime(*a, tzinfo=timezone.utc)
    assert calendario.hoje_lisboa(utc(2026, 10, 24, 22, 59)) == date(2026, 10, 24)
    assert calendario.hoje_lisboa(utc(2026, 10, 24, 23, 0)) == date(2026, 10, 25)   # ainda UTC+1
    assert calendario.hoje_lisboa(utc(2026, 10, 25, 23, 59)) == date(2026, 10, 25)  # já UTC+0
    assert calendario.hoje_lisboa(utc(2026, 3, 28, 23, 30)) == date(2026, 3, 28)
    assert calendario.hoje_lisboa(utc(2026, 3, 29, 23, 30)) == date(2026, 3, 30)
    assert calendario.hoje_lisboa(utc(2026, 12, 31, 23, 30)) == date(2026, 12, 31)


def test_ordem_igual_a_do_worker():
    # A mesma ordem que jogo/test/dia.test.js verifica do lado do Worker.
    assert calendario.ordem(IDS) == ["Q1835", "Q83163", "Q11571", "Q615", "Q36488"]


def test_preenche_de_hoje_mais_dois_sem_repetir_antes_de_todos_sairem():
    cal = calendario.estender({}, IDS, HOJE, dias=12)
    assert min(cal) == "2026-10-27" and max(cal) == "2026-11-06" and len(cal) == 11
    primeiros = [cal[d] for d in sorted(cal)][:5]
    assert primeiros == calendario.ordem(IDS)
    assert max(Counter(cal.values()).values()) - min(Counter(cal.values()).values()) <= 1


def test_nao_mexe_em_hoje_nem_amanha_e_continua_do_que_ja_ha():
    antes = {"2026-10-25": "Q1835", "2026-10-26": "Q99999", "2026-10-27": "Q83163"}
    cal = calendario.estender(antes, IDS, HOJE, dias=5)
    assert cal["2026-10-25"] == "Q1835" and cal["2026-10-26"] == "Q99999"   # mesmo que já não esteja na base
    assert cal["2026-10-27"] == "Q83163"
    # Os seguintes são os que ainda não saíram, pela ordem.
    assert [cal[d] for d in ["2026-10-28", "2026-10-29", "2026-10-30"]] == ["Q11571", "Q615", "Q36488"]
    assert antes == {"2026-10-25": "Q1835", "2026-10-26": "Q99999", "2026-10-27": "Q83163"}  # não altera o original


def test_substitui_quem_saiu_da_base_nas_datas_futuras():
    antes = {"2026-10-27": "Q99999", "2026-10-28": "Q1835"}
    cal = calendario.estender(antes, IDS, HOJE, dias=3)
    assert cal["2026-10-28"] == "Q1835"
    assert cal["2026-10-27"] == "Q83163"   # o primeiro dos que ainda não saíram


def test_jogadores_novos_entram_logo():
    cal = calendario.estender({}, IDS, HOJE, dias=6)
    cal = calendario.estender(cal, IDS + ["Q42"], date(2026, 10, 31), dias=4)
    assert cal["2026-11-02"] == "Q42"


def test_dias_a_frente():
    cal = {"2026-10-25": "a", "2026-10-26": "b", "2026-10-28": "c"}
    assert calendario.dias_a_frente(cal, HOJE) == 2
    assert calendario.dias_a_frente({}, HOJE) == 0
