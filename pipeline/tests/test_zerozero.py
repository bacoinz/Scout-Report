import gzip
from pathlib import Path

from scout.fontes import zerozero as zz

FIXTURES = Path(__file__).parent / "fixtures"


def _html(nome):
    return gzip.decompress((FIXTURES / nome).read_bytes()).decode("utf-8")


def test_perfil_rui_costa():
    p = zz.perfil(_html("zz_rui_costa.html.gz"))
    assert p["pe"] == "direito" and p["altura_cm"] == 180 and p["nascimento"] == "1972-03-29" and p["numero"] == 10


def test_classificacoes_do_plantel():
    linhas = zz.classificacoes(_html("zz_plantel_boavista_96.html.gz"))
    assert [(l["edicao"], l["posicao"], l["liga"], l["competicao"], l["pais"]) for l in linhas] == [
        ("Liga Portuguesa 96/97", "7º", True, "3", "PT"),
        ("Taça de Portugal 96/97", "1.º", True, "9", "PT"),     # o vencedor da taça também tem "1.º": decide o mapa
        ("UEFA Cup 96/97", "3R", False, "28", None),
    ]
    assert {l["seccao"] for l in linhas} == {"Competições Oficiais"}


def test_epocas_rui_costa():
    e = zz.epocas(_html("zz_rui_costa_epocas.html.gz"))
    benfica_91 = next(x for x in e["clubes"] if x["epoca"] == 1991 and "Benfica" in x["clube"])
    assert benfica_91["jogos"] == 32 and benfica_91["golos"] == 4 and benfica_91["assistencias"] == 1
    assert not any(zz.jovem(x["clube"]) for x in e["clubes"])
    assert any(x["assistencias"] is None for x in e["clubes"])          # épocas com "-" = sem registo
    portugal = e["selecoes"][0]
    assert (portugal["jogos"], portugal["golos"], portugal["assistencias"]) == (94, 26, 22)


PLANTEL = """<div class="staff_line">
<div class="staff"><div class="number">7</div><div class="name"><a title="Portugal" href="/pais/portugal">PT</a>
<a href="/jogador/cristiano-ronaldo?epoca_id=138">Cristiano Ronaldo</a></div></div>
<div class="staff"><div class="number">47</div><div class="name">
<a href="/jogador/matty-james/98546?epoca_id=138">Matty James</a></div></div>
</div>"""


def test_numero_no_plantel():
    assert zz.numero_no_plantel(PLANTEL, 1579, "cristiano-ronaldo") == 7
    assert zz.numero_no_plantel(PLANTEL, 98546, None) == 47             # a ligação traz o id
    assert zz.numero_no_plantel(PLANTEL, 1, "outro") is None


def test_epocas_tem_plantel_e_slug():
    e = zz.epocas(_html("zz_rui_costa_epocas.html.gz"))
    assert e["slug"] and all(x["plantel"].startswith("/equipa/") for x in e["clubes"] if x["plantel"])


def test_jovem():
    assert zz.jovem("Benfica[Jun.D S13]") and zz.jovem("Portugal[S21]") and not zz.jovem("Benfica")
