"""Recolha: artigos da Wikipédia → QID → entidade Wikidata → registo (jogador.construir) → dados/jogadores/<QID>.json.

As discrepâncias e os avisos de cada jogador vão para saida/recolha/<QID>.json (lidos pelo relatório).
Quem já tem registo é saltado, a não ser com refazer; reprocessar só pede à rede o que não estiver na cache."""
import json
import time

from . import config
from .fontes import wikidata as wd
from .fontes import wikipedia as wp
from .http import BloqueioAntiBot
from .jogador import Contexto, construir

# Amostra do passo 2 (plano, 1.6): artigos da Wikipédia inglesa.
AMOSTRA = [
    "Cristiano Ronaldo", "Lionel Messi", "Zinedine Zidane", "Ronaldo (Brazilian footballer)", "Andriy Shevchenko",
    "Luka Modrić", "Erling Haaland", "Didier Drogba", "Gianluigi Buffon", "Mohamed Salah", "Son Heung-min",
    "Luís Figo", "Rui Costa", "Pauleta", "Bernardo Silva", "Rúben Dias", "Ricardo Carvalho", "Vítor Baía",
    "Rúben Amorim", "Luisão", "Mário Jardel", "Deco", "Hulk (footballer)", "Liedson", "Sebastián Coates",
    "Nicolás Otamendi", "Pizzi (footballer)", "Diogo Costa", "Viktor Gyökeres",
    "João Pinto",                                        # o de 1971; o de 1961 é "João Pinto (footballer, born 1961)"
]

SAIDA_RECOLHA = config.SAIDA / "recolha"


def _gravar(caminho, dados):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def _ajustar(registo: dict, ajustes: dict) -> dict:
    """Correções à mão de dados/ajustes.json ({QID: {campo: valor}}), por cima do que veio das fontes."""
    for campo, valor in ajustes.get(registo["id"], {}).items():
        alvo, *resto = campo.split(".")
        if resto:                                        # "perfil.altura_cm": 180
            registo.setdefault(alvo, {})[resto[0]] = valor
        else:
            registo[campo] = valor
    return registo


def _marcar_fama(registo: dict, candidatos: dict) -> bool:
    """Copia de dados/candidatos.json as categorias e as marcas Conhecido / Desafio do Dia. Devolve se mudou algo."""
    c = candidatos.get(registo["id"])
    if not c:
        return False
    marcas = {"categorias": c["categorias"], "conhecido": c["conhecido"], "diario": c["diario"]}
    if all(registo.get("fama", {}).get(k) == v for k, v in marcas.items()):
        return False
    registo.setdefault("fama", {}).update(marcas)
    return True


def titulos_candidatos() -> list[str]:
    """Os artigos de todos os candidatos (dados/candidatos.json), pela ordem do QID."""
    candidatos = json.loads((config.DADOS / "candidatos.json").read_text(encoding="utf-8"))
    return [c["titulo"] for _, c in sorted(candidatos.items())]


def titulos_de_qids(cliente, qids) -> dict:
    """{QID: artigo da Wikipédia inglesa}."""
    ents = wd.entidades(cliente, qids, props="sitelinks", lote_max=10)
    return {q: wd.titulo_enwiki(e) for q, e in ents.items() if wd.titulo_enwiki(e)}


def recolher(ctx: Contexto, titulos: list[str], refazer: bool = False, registar=print) -> dict:
    """Recolhe os jogadores destes artigos. Devolve {'feitos': [...], 'saltados': [...], 'falhas': {título: erro}}."""
    cliente = ctx.cliente
    ajustes = {k: v for k, v in json.loads((config.DADOS / "ajustes.json").read_text(encoding="utf-8")).items()
               if not k.startswith("_")} if (config.DADOS / "ajustes.json").exists() else {}
    candidatos = json.loads((config.DADOS / "candidatos.json").read_text(encoding="utf-8")) \
        if (config.DADOS / "candidatos.json").exists() else {}
    info = wp.info_titulos(cliente, titulos, fresco=ctx.fresco)
    res = {"feitos": [], "saltados": [], "falhas": {}}
    pendentes = []
    for t in titulos:
        q = info[t]["qid"]
        if not q:
            res["falhas"][t] = "artigo sem QID (não existe?)"
        elif not refazer and (config.JOGADORES / f"{q}.json").exists():
            res["saltados"].append(q)
            caminho = config.JOGADORES / f"{q}.json"          # só atualiza as marcas de fama (categorias, conhecido…)
            registo = json.loads(caminho.read_text(encoding="utf-8"))
            if _marcar_fama(registo, candidatos):
                _gravar(caminho, registo)
        else:
            pendentes.append((t, q))
    if not pendentes:
        return res
    if not ctx.ligas_tm:
        ctx.preparar_ligas_tm()
    textos = wp.wikitextos(cliente, [info[t]["titulo"] for t, _ in pendentes], fresco=ctx.fresco)
    ents = wd.entidades(cliente, [q for _, q in pendentes], lote_max=10, fresco=ctx.fresco)
    for n, (t, q) in enumerate(pendentes, 1):
        inicio = time.monotonic()
        canon = info[t]["titulo"]
        try:
            artigo = {"titulo": canon, **textos[canon]}
            registo, discrepancias, avisos = construir(ctx, q, ents[q], artigo)
        except BloqueioAntiBot:
            raise                                    # um site a bloquear: parar já, sem insistir com os seguintes
        except Exception as e:                       # noqa: BLE001 — um jogador com problemas não para a recolha
            res["falhas"][t] = f"{type(e).__name__}: {e}"
            registar(f"[{n}/{len(pendentes)}] {canon}: FALHOU ({e})")
            continue
        _marcar_fama(registo, candidatos)
        _gravar(config.JOGADORES / f"{q}.json", _ajustar(registo, ajustes))
        _gravar(SAIDA_RECOLHA / f"{q}.json", {"id": q, "nome": registo["nome"], "discrepancias": discrepancias,
                                             "avisos": avisos})
        ctx.gravar_catalogo()
        res["feitos"].append(q)
        registar(f"[{n}/{len(pendentes)}] {canon} ({q}) · {len(avisos)} avisos · {len(discrepancias)} discrepâncias · "
                 f"{time.monotonic() - inicio:.0f} s")
    return res
