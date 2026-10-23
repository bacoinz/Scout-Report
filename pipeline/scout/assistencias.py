"""Máximo possível de assistências, para o jogo poder responder "não" sem dados de todas as épocas.

Ninguém registava assistências de forma sistemática antes de ~2005, por isso a regra da cobertura (≥ 90% dos jogos
com dados) deixava muitos defesas e guarda-redes em SEM REGISTO. A estimativa generosa resolve a maior parte:

    máximo = assistências conhecidas + jogos sem dados × max(2 × taxa conhecida do jogador, teto da posição)

(a taxa do jogador só conta com pelo menos 50 jogos com dados).

O teto da posição fica muito acima do que os melhores fazem (um lateral de topo anda pelas 0,2 assistências por
jogo; o Messi no auge, ~0,45), para um "não" nunca estar errado. Se o máximo não chega ao limiar da pergunta, a
resposta é "não"; um "sim" continua a precisar de assistências conhecidas acima do limiar.
`python -m scout assistencias` testa a estimativa com as épocas conhecidas (esconde as mais antigas ou as mais
recentes e vê se o máximo chega ao valor verdadeiro)."""
import math
import statistics

from . import config

TETO = {"GR": 0.02, "DC": 0.10, "LD": 0.25, "LE": 0.25, "MDC": 0.20, "MC": 0.35, "MO": 0.45, "MD": 0.40, "ME": 0.40,
        "ED": 0.45, "EE": 0.45, "SA": 0.45, "PL": 0.40}
TETO_SETOR = {"gr": 0.02, "defesa": 0.25, "medio": 0.45, "avancado": 0.45}
# Afinados com `python -m scout assistencias` na amostra (23/10): sem falhas em 156 casos. Só o teto falhava no
# Messi (a taxa dele passa o teto); 3× sem mínimo de jogos deixava o Vítor Baía em SEM REGISTO por ruído (2
# assistências em ~70 jogos conhecidos).
FATOR_PROPRIO = 2
MINIMO_JOGOS_TAXA = 50         # com menos jogos conhecidos, a taxa do próprio é ruído e conta só o teto


def teto(posicao: dict) -> float:
    """O teto mais alto das posições do jogador (um central que foi lateral fica com o teto do lateral)."""
    valores = [TETO[e] for e in posicao.get("especificas", []) if e in TETO]
    valores += [TETO_SETOR[s] for s in posicao.get("setores", []) if s in TETO_SETOR and not valores]
    return max(valores, default=max(TETO_SETOR.values()))


def maximo(conhecidas: int, jogos_com_dados: int, jogos_sem_dados: int, posicao: dict) -> int:
    taxa = conhecidas / jogos_com_dados if jogos_com_dados and jogos_com_dados >= MINIMO_JOGOS_TAXA else 0.0
    return conhecidas + math.ceil(max(0, jogos_sem_dados) * max(FATOR_PROPRIO * taxa, teto(posicao)))


def resposta(assist: dict, limiar: int) -> str:
    """"Mais de {limiar} assistências?" → 'sim' | 'nao' | 'sem_registo' (a mesma regra do jogo)."""
    if assist["conhecidas"] > limiar:
        return "sim"
    if assist.get("maximo", math.inf) <= limiar or assist["cobertura"] >= config.COBERTURA_MINIMA:
        return "nao"
    return "sem_registo"


def testar(cliente, registos: list[dict]) -> dict:
    """Esconde as épocas mais antigas (ou as mais recentes) de cada jogador até 25/50/75% dos jogos com
    assistências conhecidas no zerozero, calcula o máximo com o resto e compara-o com o total verdadeiro.
    Usa só a cache (as páginas já foram pedidas na recolha)."""
    from .fontes import zerozero as zz
    casos = []
    for r in registos:
        zz_id = r["fontes"].get("zerozero")
        if not zz_id:
            continue
        epocas = sorted((e for e in zz.epocas(zz.pagina_epocas(cliente, zz_id))["clubes"]
                         if e["assistencias"] is not None and e["jogos"]), key=lambda e: e["epoca"])
        total_j = sum(e["jogos"] for e in epocas)
        total_a = sum(e["assistencias"] for e in epocas)
        if total_j < 100:
            continue
        for lado in ("antigas", "recentes"):
            ordem = epocas if lado == "antigas" else epocas[::-1]
            for fracao in (0.25, 0.5, 0.75):
                escondidas, j = [], 0
                for e in ordem:
                    if j >= fracao * total_j:
                        break
                    escondidas.append(e)
                    j += e["jogos"]
                vistas_a = total_a - sum(e["assistencias"] for e in escondidas)
                m = maximo(vistas_a, total_j - j, j, r["posicao"])
                casos.append({"nome": r["nome"], "lado": lado, "fracao": fracao, "real": total_a, "maximo": m,
                              "ok": m >= total_a})
    falhas = [c for c in casos if not c["ok"]]
    folga = [c["maximo"] / c["real"] for c in casos if c["real"]]
    return {"casos": len(casos), "falhas": falhas, "folga_mediana": round(statistics.median(folga), 2) if folga else None}
