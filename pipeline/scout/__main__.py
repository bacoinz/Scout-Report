"""Linha de comandos do pipeline (correr a partir de pipeline/):

    python -m scout tm descarregar|preparar
    python -m scout paises
    python -m scout sementes
    python -m scout recolher --amostra | --candidatos | --titulo "Rui Costa" | --id Q190608   [--refazer] [--fresco]
    python -m scout premios
    python -m scout validar
    python -m scout relatorio
    python -m scout exportar
    python -m scout assistencias
    python -m scout estado
"""
import argparse
import json
import sys
from datetime import timedelta

from . import config


def _cliente():
    from .http import Cliente
    return Cliente()


def cmd_tm(args):
    from .fontes import transfermarkt as tm
    if args.acao == "descarregar":
        for tabela, n in tm.descarregar(_cliente()).items():
            print(f"{tabela}: {n / 1e6:.1f} MB")
    else:
        for tabela, n in tm.preparar().items():
            print(f"{tabela}: {n} linhas")


def cmd_paises(args):
    from . import paises
    dados = paises.gerar(_cliente())
    print(f"{len(dados['paises'])} países → {paises.escrever(dados)}")


def cmd_sementes(args):
    from . import sementes
    candidatos = sementes.gerar(_cliente(), registar=lambda s: print(s, flush=True))
    caminho = sementes.escrever(candidatos)
    cats = {}
    for d in candidatos.values():
        for c in d["categorias"]:
            cats[c] = cats.get(c, 0) + 1
    print(f"{len(candidatos)} candidatos → {caminho}")
    print("  por categoria: " + ", ".join(f"{k} {v}" for k, v in sorted(cats.items())))
    print(f"  conhecidos: {sum(d['conhecido'] for d in candidatos.values())} · "
          f"Desafio do Dia: {sum(d['diario'] for d in candidatos.values())}")


def cmd_recolher(args):
    from . import recolha
    from .fontes import transfermarkt as tm
    from .jogador import Contexto
    cliente = _cliente()
    if not tm.disponivel():
        print("Aviso: sem o transfermarkt-datasets (python -m scout tm descarregar && python -m scout tm preparar).")
    ctx = Contexto(cliente, tm.Transfermarkt() if tm.disponivel() else None, fresco=args.fresco)
    titulos = list(args.titulo or [])
    if args.amostra:
        titulos += recolha.AMOSTRA
    if args.candidatos:
        titulos += recolha.titulos_candidatos()
    if args.limite:
        titulos = titulos[:args.limite]
    if args.id:
        encontrados = recolha.titulos_de_qids(cliente, args.id)
        for q in args.id:
            if q not in encontrados:
                print(f"{q}: sem artigo na Wikipédia inglesa")
        titulos += list(encontrados.values())
    if not titulos:
        sys.exit("Nada para recolher: usa --amostra, --titulo ou --id.")
    res = recolha.recolher(ctx, titulos, refazer=args.refazer)
    print(f"Feitos: {len(res['feitos'])} · saltados (já existiam): {len(res['saltados'])} · falhas: {len(res['falhas'])}"
          f" · pedidos à rede: {cliente.pedidos}")
    for t, erro in res["falhas"].items():
        print(f"  {t}: {erro}")


def cmd_premios(args):
    from . import recolha
    from .jogador import Contexto
    n = recolha.atualizar_premios(Contexto(_cliente()))
    print(f"{n} registos com prémios atualizados (dados/competicoes.json)")


def cmd_exportar(args):
    from . import exportar
    r = exportar.gerar()
    print(f"{r['jogadores']} jogadores, {r['clubes']} clubes, {r['ligas']} ligas (versão {r['versao']}) → "
          f"{exportar.SAIDA_D1}: {', '.join(r['ficheiros'])}")
    print(f"Calendário do Desafio do Dia até {r['desafios']} (dados/calendario.json)")
    print("Para o D1 local: cd ../jogo && npm run db:local")


def cmd_validar(args):
    from .validar import validar_todos
    res = validar_todos()
    erros = 0
    for q, v in res.items():
        for e in v["erros"]:
            print(f"ERRO  {v['nome']} ({q}): {e}")
            erros += 1
        if args.avisos:
            for a in v["avisos"]:
                print(f"aviso {v['nome']} ({q}): {a}")
    print(f"{len(res)} registos · {erros} erros · {sum(len(v['avisos']) for v in res.values())} avisos")
    sys.exit(1 if erros else 0)


def cmd_relatorio(args):
    from .relatorio import escrever
    print(escrever())


def cmd_assistencias(args):
    from . import assistencias
    registos = [json.loads(c.read_text(encoding="utf-8")) for c in sorted(config.JOGADORES.glob("*.json"))]
    res = assistencias.testar(_cliente(), registos)
    print(f"{res['casos']} casos · {len(res['falhas'])} em que o máximo ficou abaixo do real · "
          f"folga mediana: máximo = {res['folga_mediana']} × o real")
    for c in res["falhas"]:
        print(f"  {c['nome']}: escondidas as {c['lado']} ({round(100 * c['fracao'])}% dos jogos) → máximo {c['maximo']}, "
              f"real {c['real']}")
    sys.exit(1 if res["falhas"] else 0)


def cmd_estado(args):
    registos = [json.loads(c.read_text(encoding="utf-8")) for c in config.JOGADORES.glob("*.json")]
    print(f"Jogadores: {len(registos)} · ativos: {sum(r.get('estado') == 'ativo' for r in registos)}")
    from . import calendario
    hoje = calendario.hoje_lisboa()
    # Hoje e amanhã têm sempre jogador (do calendário ou da ordem de reserva do Worker); conta-se o resto.
    dias = 2 + calendario.dias_a_frente(calendario.ler(), hoje + timedelta(days=2))
    print(f"Desafio do Dia: {sum(bool(r['fama'].get('diario')) for r in registos)} jogadores · calendário com "
          f"{dias} dias a partir de hoje ({hoje.isoformat()})")
    if dias < calendario.DIAS_MINIMOS:
        print(f"  Aviso: menos de {calendario.DIAS_MINIMOS} dias. Corre `python -m scout exportar` e aplica o SQL no D1.")


def main(argv=None):
    p = argparse.ArgumentParser(prog="python -m scout", description="Pipeline de dados do Scout Report")
    sub = p.add_subparsers(dest="comando", required=True)
    s = sub.add_parser("tm", help="transfermarkt-datasets")
    s.add_argument("acao", choices=["descarregar", "preparar"])
    s.set_defaults(f=cmd_tm)
    sub.add_parser("paises", help="gera partilhado/paises.json").set_defaults(f=cmd_paises)
    sub.add_parser("sementes", help="quem entra na base → dados/candidatos.json").set_defaults(f=cmd_sementes)
    s = sub.add_parser("recolher", help="recolhe jogadores para dados/jogadores/")
    s.add_argument("--amostra", action="store_true", help="os 30 jogadores da amostra")
    s.add_argument("--candidatos", action="store_true", help="todos os candidatos (python -m scout sementes)")
    s.add_argument("--limite", type=int, help="só os primeiros N")
    s.add_argument("--titulo", action="append", help="artigo da Wikipédia inglesa (repetível)")
    s.add_argument("--id", action="append", help="QID da Wikidata (repetível)")
    s.add_argument("--refazer", action="store_true", help="refaz quem já tem registo")
    s.add_argument("--fresco", action="store_true", help="ignora a cache")
    s.set_defaults(f=cmd_recolher)
    sub.add_parser("premios", help="volta a aplicar dados/competicoes.json aos títulos de todos os registos"
                   ).set_defaults(f=cmd_premios)
    sub.add_parser("exportar", help="SQL para o D1 do jogo → saida/d1/").set_defaults(f=cmd_exportar)
    s = sub.add_parser("validar", help="valida os registos (sai com 1 se houver erros)")
    s.add_argument("--avisos", action="store_true", help="mostra também os avisos")
    s.set_defaults(f=cmd_validar)
    sub.add_parser("relatorio", help="escreve saida/qualidade.md").set_defaults(f=cmd_relatorio)
    sub.add_parser("assistencias", help="testa o máximo de assistências com as épocas conhecidas"
                   ).set_defaults(f=cmd_assistencias)
    sub.add_parser("estado", help="contagens").set_defaults(f=cmd_estado)
    args = p.parse_args(argv)
    args.f(args)


if __name__ == "__main__":
    main()
