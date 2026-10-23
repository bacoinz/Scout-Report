from scout.normalizar import ler_anos, ler_epoca, mesmo_clube, normalizar, reserva, semelhanca_clube


def test_normalizar():
    assert normalizar("Luka Modrić") == "luka modric"
    assert normalizar("Sebastián Coates") == "sebastian coates"
    assert normalizar("Martin Ødegaard") == "martin odegaard"
    assert normalizar("N'Golo Kanté") == "ngolo kante"


def test_ler_epoca():
    assert ler_epoca("2007/08") == 2007
    assert ler_epoca("1999/00") == 1999
    assert ler_epoca("2009") == 2009
    assert ler_epoca("Total") is None


def test_ler_anos():
    assert ler_anos("2002–2003") == (2002, 2003, False)
    assert ler_anos("2023–") == (2023, None, True)
    assert ler_anos("2009") == (2009, 2009, False)
    assert ler_anos("1995–97") == (1995, 1997, False)


def test_clubes():
    assert mesmo_clube("S.L. Benfica", "Benfica")
    assert mesmo_clube("Sporting CP", "Sporting")
    assert not mesmo_clube("Al Hilal", "Al Nassr")
    assert semelhanca_clube("Manchester City", "Manchester City F.C.") > semelhanca_clube("Manchester United", "Manchester City F.C.")
    assert semelhanca_clube("PSG", "Paris Saint-Germain") and semelhanca_clube("Internazionale", "Inter Milan")
    assert semelhanca_clube("Sporting", "Sporting CP B") == 0 and semelhanca_clube("Sporting", "Sporting CP")
    assert semelhanca_clube("Bryne[B]", "Bryne 2") and semelhanca_clube("S.C. Braga", "Braga")
    assert not reserva("Manchester City F.C.") and reserva("Dynamo-2 Kyiv") and reserva("Barcelona C")
