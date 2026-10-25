"""Ligas das passagens: competições que não são ligas, associações distritais e as datas por épocas (sem rede)."""
import json

from scout import config
from scout.jogador import Contexto, ligas_das_classificacoes
from scout.validar import validar_registo

PERGUNTAS = json.loads((config.PARTILHADO / "perguntas.json").read_text(encoding="utf-8"))
PAISES = json.loads((config.PARTILHADO / "paises.json").read_text(encoding="utf-8"))["paises"]
PL, SL, TACA, AF_PORTO, DISTRITAL = "Q182994", "Q754488", "Q29224", "Q7232154", "Q7232634"


def _ctx(clubes=None, ligas=None):
    ctx = Contexto(None)
    if clubes is not None:
        ctx.clubes = clubes
    if ligas is not None:
        ctx.ligas = ligas
    return ctx


def test_taças_saem_e_associações_dão_o_campeonato_distrital():
    ctx = _ctx()
    assert ctx.liga(PL) == PL
    assert ctx.liga(TACA) is None
    assert ctx.liga(AF_PORTO) == DISTRITAL
    assert ctx.so_ligas([TACA, PL, AF_PORTO, DISTRITAL]) == [PL, DISTRITAL]


def test_datas_contam_por_épocas():
    ligas = {PL: {"pais": "PT"}, SL: {"pais": "PT"}}
    clube = {"ligas": [{"liga": PL, "inicio": 1968, "fim": 2008}, {"liga": SL, "inicio": 2008, "fim": 2009}]}
    ctx = _ctx({"C": clube}, ligas)
    assert ctx.ligas_da_passagem("C", 2007, 2008) == [PL]          # 2007/08: já não apanha a II Liga de 2008/09
    assert ctx.ligas_da_passagem("C", 2008, 2009) == [SL]
    assert ctx.ligas_da_passagem("C", 2006, 2010) == [PL, SL]
    assert ctx.ligas_da_passagem("C", 2008, 2008) == [SL]          # meia época (entrou e saiu no mesmo ano)


def test_sem_datas_fica_a_liga_atual_sem_as_que_não_são_ligas():
    ligas = {AF_PORTO: {"pais": "PT", "substituir": DISTRITAL}, TACA: {"pais": "PT", "liga": False}}
    clube = {"ligas": [{"liga": AF_PORTO, "inicio": None, "fim": None}, {"liga": TACA, "inicio": None, "fim": None}]}
    assert _ctx({"C": clube}, ligas).ligas_da_passagem("C", 2002, 2003) == [DISTRITAL]


def test_boavista_e_maia_têm_as_ligas_por_época():
    ctx = _ctx()
    boavista, maia = "Q219703", "Q1387336"
    assert ctx.ligas_da_passagem(boavista, 1992, 2001) == [PL]
    assert ctx.ligas_da_passagem(boavista, 2007, 2008) == [PL]
    assert ctx.ligas_da_passagem(boavista, 2012, 2013) == ["Q618131"]   # II Divisão
    assert ctx.ligas_da_passagem(boavista, 2016, 2018) == [PL]
    assert ctx.ligas_da_passagem(boavista, 2025, None) == [DISTRITAL]
    assert ctx.ligas_da_passagem(maia, 2002, 2003) == [SL]


def test_validar_recusa_competições_que_não_são_ligas():
    ligas = json.loads((config.DADOS / "ligas.json").read_text(encoding="utf-8"))
    r = {"carreira": [{"clube": "Q1", "nome": "X", "inicio": 2000, "fim": 2001, "ligas": [TACA], "paises_liga": ["PT"]},
                      {"clube": "Q2", "nome": "Y", "inicio": 2001, "fim": 2002, "ligas": [AF_PORTO], "paises_liga": ["PT"]},
                      {"clube": "Q3", "nome": "Z", "inicio": 2002, "fim": 2003, "ligas": [PL], "paises_liga": ["PT"]}]}
    erros, _ = validar_registo(r, PERGUNTAS, PAISES, ligas)
    assert [e for e in erros if "não é uma liga" in e] == [
        "X: Taça de Portugal não é uma liga (ver dados/ligas.json; refaz a recolha)",
        "Y: Porto Football Association não é uma liga (ver dados/ligas.json; refaz a recolha)",
    ]


def _linha(edicao, posicao, competicao, pais="PT", seccao="Competições Oficiais"):
    return {"seccao": seccao, "posicao": posicao, "liga": posicao[:1].isdigit() and "º" in posicao, "edicao": edicao,
            "id_edicao": "1", "competicao": competicao, "pais": pais}


def test_ligas_das_classificacoes_do_zerozero():
    mapa = {"3": {"liga": PL}, "9": {"liga": None}, "49": {"liga": None}}
    linhas = [_linha("Liga Portuguesa 96/97", "7º", "3"), _linha("Taça de Portugal 96/97", "1.º", "9"),
              _linha("Supertaça 1997", "1.º", "49"), _linha("UEFA Cup 96/97", "3R", "28", pais=None),
              _linha("Liga Desconhecida 96/97", "4º", "777"), _linha("Torneio de verão", "1.º", "888", seccao="Particulares")]
    assert ligas_das_classificacoes(linhas, mapa, 1996) == ([PL], {"Liga Desconhecida 96/97 [777]"})


def test_competição_que_a_wikidata_separa_por_épocas():
    mapa = {"4": {"liga": "Q9448", "antes": [[1992, "Q754839"]]}}
    linha = [_linha("Premier League 92/93", "1º", "4", pais="GB-ENG")]
    assert ligas_das_classificacoes(linha, mapa, 1991)[0] == ["Q754839"]     # First Division
    assert ligas_das_classificacoes(linha, mapa, 1992)[0] == ["Q9448"]       # Premier League


def test_o_mapa_do_zerozero_aponta_para_ligas_conhecidas():
    mapa = json.loads((config.DADOS / "competicoes_zerozero.json").read_text(encoding="utf-8"))
    ligas = json.loads((config.DADOS / "ligas.json").read_text(encoding="utf-8"))
    for comp, info in mapa.items():
        if comp.startswith("_"):
            continue
        assert set(info) >= {"nome", "pais", "liga"}, comp
        if info["liga"]:
            assert info["liga"] in ligas and ligas[info["liga"]].get("liga") is not False, (comp, info)
    assert mapa["3"]["liga"] == PL and mapa["9"]["liga"] is None      # Liga Portuguesa → Primeira Liga; a Taça não
