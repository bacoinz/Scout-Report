"""Linha de comandos do pipeline (correr a partir de pipeline/):

    python -m scout tm descarregar|preparar
    python -m scout paises
    python -m scout recolher --amostra | --titulo "Rui Costa" | --id Q190608   [--refazer] [--fresco]
    python -m scout curiosidades [--id Q…] [--limite N] [--refazer]
    python -m scout validar
    python -m scout relatorio
    python -m scout estado
"""
import argparse
import json
import sys

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


def cmd_curiosidades(args):
    from . import curiosidades
    from .fontes import llm
    if not llm.tem_chave():
        sys.exit("Falta a variável de ambiente GEMINI_API_KEY (cria a chave em https://aistudio.google.com/apikey).")
    res = curiosidades.correr(_cliente(), ids=args.id, limite=args.limite, refazer=args.refazer)
    print(f"Feitos: {len(res['feitos'])} · saltados: {len(res['saltados'])} · falhas: {len(res['falhas'])}")
    for q, erro in res["falhas"].items():
        print(f"  {q}: {erro}")


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


def cmd_estado(args):
    registos = [json.loads(c.read_text(encoding="utf-8")) for c in config.JOGADORES.glob("*.json")]
    print(f"Jogadores: {len(registos)} · com curiosidades: {sum(bool(r.get('curiosidades')) for r in registos)} · "
          f"ativos: {sum(r.get('estado') == 'ativo' for r in registos)}")


def main(argv=None):
    p = argparse.ArgumentParser(prog="python -m scout", description="Pipeline de dados do Scout Report")
    sub = p.add_subparsers(dest="comando", required=True)
    s = sub.add_parser("tm", help="transfermarkt-datasets")
    s.add_argument("acao", choices=["descarregar", "preparar"])
    s.set_defaults(f=cmd_tm)
    sub.add_parser("paises", help="gera partilhado/paises.json").set_defaults(f=cmd_paises)
    s = sub.add_parser("recolher", help="recolhe jogadores para dados/jogadores/")
    s.add_argument("--amostra", action="store_true", help="os 30 jogadores da amostra")
    s.add_argument("--titulo", action="append", help="artigo da Wikipédia inglesa (repetível)")
    s.add_argument("--id", action="append", help="QID da Wikidata (repetível)")
    s.add_argument("--refazer", action="store_true", help="refaz quem já tem registo")
    s.add_argument("--fresco", action="store_true", help="ignora a cache")
    s.set_defaults(f=cmd_recolher)
    s = sub.add_parser("curiosidades", help="curiosidades com o Gemini (precisa de GEMINI_API_KEY)")
    s.add_argument("--id", action="append")
    s.add_argument("--limite", type=int)
    s.add_argument("--refazer", action="store_true")
    s.set_defaults(f=cmd_curiosidades)
    s = sub.add_parser("validar", help="valida os registos (sai com 1 se houver erros)")
    s.add_argument("--avisos", action="store_true", help="mostra também os avisos")
    s.set_defaults(f=cmd_validar)
    sub.add_parser("relatorio", help="escreve saida/qualidade.md").set_defaults(f=cmd_relatorio)
    sub.add_parser("estado", help="contagens").set_defaults(f=cmd_estado)
    args = p.parse_args(argv)
    args.f(args)


if __name__ == "__main__":
    main()
