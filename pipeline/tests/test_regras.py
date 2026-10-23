"""Cruzamento de fontes, prémios, SEM REGISTO e curiosidades (sem rede)."""
import json

from scout import config
from scout.curiosidades import verificar
from scout.jogador import _limpar_competicao, _premios, passagem_da_epoca, ultimo_ano
from scout.relatorio import respostas_sem_registo
from scout.validar import validar_registo

PERGUNTAS = json.loads((config.PARTILHADO / "perguntas.json").read_text(encoding="utf-8"))


def _p(nome, titulo, inicio, fim, aberto=False):
    return {"nome": nome, "titulo": titulo, "inicio": inicio, "fim": fim, "aberto": aberto}


def test_ultimo_ano():
    assert ultimo_ano(_p("A", None, 2003, 2009)) == 2008
    assert ultimo_ano(_p("A", None, 2009, 2009)) == 2009
    assert ultimo_ano(_p("A", None, 2023, None, aberto=True)) == config.ANO_ATUAL


def test_passagem_da_epoca():
    passagens = [_p("Benfica", "S.L. Benfica", 1990, 1994), _p("Fafe", "AD Fafe", 1990, 1991),
                 _p("Manchester United", "Manchester United F.C.", 2007, 2009),
                 _p("Manchester City", "Manchester City F.C.", 2009, 2013)]
    assert passagem_da_epoca(passagens, 1990, "Fafe") == 1                # empréstimo no meio da passagem
    assert passagem_da_epoca(passagens, 1991, "Benfica") == 0
    assert passagem_da_epoca(passagens, 2009, "Manchester City") == 3     # não confunde os dois Manchester
    assert passagem_da_epoca(passagens, 2008, "Manchester Utd") == 2
    assert passagem_da_epoca(passagens, 2000, "Benfica") is None
    gyokeres = [_p("Swansea City", "Swansea City A.F.C.", 2020, 2021), _p("Coventry City", "Coventry City F.C.", 2021, 2021),
                _p("Coventry City", "Coventry City F.C.", 2021, 2023)]
    assert passagem_da_epoca(gyokeres, 2020, "Coventry City") == 1      # empréstimo de janeiro ("2021" = 2020/21)
    assert passagem_da_epoca(gyokeres, 2021, "Coventry City") == 2
    assert passagem_da_epoca(gyokeres, 2020, "Swansea City") == 0


def test_limpar_competicao():
    assert _limpar_competicao("2015–16 UEFA Champions League") == "UEFA Champions League"
    assert _limpar_competicao("UEFA Euro 2016") == "UEFA Euro"
    assert _limpar_competicao("2002 FIFA World Cup") == "FIFA World Cup"


class _Ctx:
    perguntas = PERGUNTAS
    competicoes = {k: v for k, v in json.loads((config.DADOS / "competicoes.json").read_text(encoding="utf-8")).items()
                   if not k.startswith("_")}


def _linha(comp, anos, contexto="jogador", tipo="clube", vice=False):
    return {"contexto": contexto, "tipo": tipo, "competicao": comp, "texto": comp, "n": max(1, len(anos)),
            "anos": anos, "vice": vice}


def test_premios():
    linhas = [_linha("UEFA Champions League", [2002]), _linha("2002–03 UEFA Champions League", [2002], tipo="individual"),
              _linha("FIFA World Youth Championship", [1991], tipo="jovem"), _linha("Primeira Liga", [1993]),
              _linha("Supercoppa Italiana", [1996]), _linha("Emperor's Cup", [2011]),
              _linha("Ballon d'Or", [], tipo="individual", vice=True),
              _linha("UEFA Champions League", [2016, 2017, 2018], contexto="treinador"),
              _linha("Supercopa de España", [2017], contexto="treinador")]
    jogador, treinador, desconhecidas, n_treinador = _premios(_Ctx(), linhas)
    por_id = {(p["id"], p.get("pais")): p for p in jogador}
    assert por_id[("liga_campeoes", None)]["n"] == 1                      # o prémio individual da UCL não soma
    assert ("campeonato_nacional", "PT") in por_id
    assert not any(p["id"] == "bola_de_ouro" for p in jogador)
    assert desconhecidas == {"Emperor's Cup"}       # as supertaças são conhecidas; a das seleções jovens fica de fora
    assert treinador[0]["n"] == 3 and n_treinador == 4                     # a supertaça conta nos títulos


def _registo(**extra):
    r = {"id": "Q1", "nome": "Teste", "nascimento": "1985-02-05", "estreia": 2002, "estado": "retirado",
         "nacionalidades": ["PT"], "confederacoes": ["UEFA"], "clube_atual": None,
         "posicao": {"setores": ["avancado"], "especificas": ["PL"], "texto": "Forward"},
         "carreira": [{"clube": "Q75729", "nome": "Sporting", "inicio": 2002, "fim": 2003, "emprestimo": False,
                       "ligas": ["Q182994"], "paises_liga": ["PT"], "jogos": 31, "golos": 5, "assistencias": 4,
                       "jogos_liga": 25, "golos_liga": 3, "numeros": [28]}],
         "selecoes": [], "premios": [], "treinador": None, "curiosidades": [],
         "totais": {"base": "todas", "jogos": 31, "golos": 5, "internacionalizacoes": 0, "golos_selecao": 0,
                    "assistencias": {"conhecidas": 4, "cobertura": 0.5},
                    "numeros": {"cobertura": 0.95, "conhecidos": [28]}, "clubes": 1},
         "perfil": {"pe": "direito", "altura_cm": 187, "foto": None}}
    r.update(extra)
    return r


def test_sem_registo():
    falta = respostas_sem_registo(_registo(), PERGUNTAS)
    assert not any(f.startswith("números") for f in falta)               # cobertura ≥ 90%: dá para dizer "não"
    assert "mais de 25 assistências" in falta                            # 4 conhecidas, cobertura 50%
    r = _registo()
    r["totais"]["numeros"] = {"cobertura": 0.4, "conhecidos": [7]}
    falta = respostas_sem_registo(r, PERGUNTAS)
    assert "números 1–9" not in falta and "números 10–20" in falta       # o "sim" sai com um número conhecido


def test_validar():
    paises = json.loads((config.PARTILHADO / "paises.json").read_text(encoding="utf-8"))["paises"]
    erros, _ = validar_registo(_registo(), PERGUNTAS, paises)
    assert erros == []
    erros, _ = validar_registo(_registo(estreia=1980), PERGUNTAS, paises)
    assert any("antes do nascimento" in e for e in erros)
    erros, _ = validar_registo(_registo(posicao={"setores": ["defesa"], "especificas": ["PL"], "texto": ""}), PERGUNTAS, paises)
    assert any("setor" in e for e in erros)


def test_verificar_curiosidade():
    fonte = "ronaldo was born in funchal madeira portugal he was the youngest of four children"
    paises = {"portugal": "portugal", "inglaterra": "england"}
    ok = {"texto": "Nasceu no Funchal, na Madeira, e é o mais novo de quatro irmãos.",
          "origem": "Ronaldo was born in Funchal, Madeira, Portugal."}
    assert verificar(ok, fonte, {"cristiano ronaldo"}, paises) is None
    numero = {"texto": "Nasceu no Funchal em 1985.", "origem": "Ronaldo was born in Funchal, Madeira, Portugal."}
    assert "1985" in verificar(numero, fonte, set(), paises)
    inventada = {"texto": "Nasceu em Lisboa.", "origem": "He was born in Lisbon in a big family."}
    assert "origem" in verificar(inventada, fonte, set(), paises)
    nome = {"texto": "Nasceu no Funchal, como o Eusébio.", "origem": "Ronaldo was born in Funchal, Madeira, Portugal."}
    assert "Eusébio" in verificar(nome, fonte, set(), paises)
