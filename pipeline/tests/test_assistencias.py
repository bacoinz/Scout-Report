from scout import assistencias as A

GR = {"setores": ["gr"], "especificas": ["GR"]}
CENTRAL_E_LATERAL = {"setores": ["defesa"], "especificas": ["DC", "LD"]}


def test_teto():
    assert A.teto(GR) == 0.02
    assert A.teto(CENTRAL_E_LATERAL) == 0.25                        # o teto mais alto das posições
    assert A.teto({"setores": ["medio"], "especificas": []}) == A.TETO_SETOR["medio"]


def test_maximo():
    # Guarda-redes: 0 em 300 jogos conhecidos, 700 sem dados → só o teto (0,02 × 700 = 14).
    assert A.maximo(0, 300, 700, GR) == 14
    # A taxa do próprio conta quando passa o teto: 0,4 por jogo → 2 × 0,4 × 100 = 80 a mais.
    assert A.maximo(40, 100, 100, {"setores": ["avancado"], "especificas": ["PL"]}) == 120
    # Com poucos jogos conhecidos, a taxa do próprio é ruído e fica só o teto.
    assert A.maximo(2, 30, 500, GR) == 12


def test_resposta():
    assert A.resposta({"conhecidas": 30, "cobertura": 0.2, "maximo": 400}, 25) == "sim"
    assert A.resposta({"conhecidas": 3, "cobertura": 0.2, "maximo": 20}, 25) == "nao"      # o máximo não chega
    assert A.resposta({"conhecidas": 3, "cobertura": 0.2, "maximo": 60}, 25) == "sem_registo"
    assert A.resposta({"conhecidas": 3, "cobertura": 0.95}, 25) == "nao"                    # cobertura ≥ 90%
