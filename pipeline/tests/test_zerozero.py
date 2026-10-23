import gzip
from pathlib import Path

from scout.fontes import zerozero as zz

FIXTURES = Path(__file__).parent / "fixtures"


def _html(nome):
    return gzip.decompress((FIXTURES / nome).read_bytes()).decode("utf-8")


def test_perfil_rui_costa():
    p = zz.perfil(_html("zz_rui_costa.html.gz"))
    assert p["pe"] == "direito" and p["altura_cm"] == 180 and p["nascimento"] == "1972-03-29" and p["numero"] == 10


def test_epocas_rui_costa():
    e = zz.epocas(_html("zz_rui_costa_epocas.html.gz"))
    benfica_91 = next(x for x in e["clubes"] if x["epoca"] == 1991 and "Benfica" in x["clube"])
    assert benfica_91["jogos"] == 32 and benfica_91["golos"] == 4 and benfica_91["assistencias"] == 1
    assert not any(zz.jovem(x["clube"]) for x in e["clubes"])
    assert any(x["assistencias"] is None for x in e["clubes"])          # épocas com "-" = sem registo
    portugal = e["selecoes"][0]
    assert (portugal["jogos"], portugal["golos"], portugal["assistencias"]) == (94, 26, 22)


def test_jovem():
    assert zz.jovem("Benfica[Jun.D S13]") and zz.jovem("Portugal[S21]") and not zz.jovem("Benfica")
