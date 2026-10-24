"""saida/qualidade.md: cobertura por campo, perguntas que dariam SEM REGISTO, ficha a ficha, discrepâncias entre
fontes, competições desconhecidas e curiosidades ao lado da frase de origem."""
import json
import re
from collections import Counter
from datetime import date

from . import assistencias, config
from .fontes import llm
from .validar import validar_todos


def _ler(caminho, padrao=None):
    return json.loads(caminho.read_text(encoding="utf-8")) if caminho.exists() else padrao


def _sem_artigo(texto: str) -> str:
    texto = re.sub(r"^(o|a|os|as|um|uma)\s+", "", texto)
    return texto[:1].upper() + texto[1:]


def _pct(n, total):
    return f"{n}/{total} ({round(100 * n / total) if total else 0}%)"


def respostas_sem_registo(r: dict, perguntas: dict) -> list[str]:
    """Perguntas a que o jogo responderia SEM REGISTO para este jogador (as mesmas regras do jogo): um "sim" basta
    um dado conhecido; um "não" precisa de cobertura ≥ 90% dos jogos de clube ou, nas assistências, de o máximo
    possível (assistencias.py) não chegar ao limiar."""
    t = r["totais"]
    falta = []
    conhecidos = set(t["numeros"]["conhecidos"])
    for a, b in perguntas["numeros"]["faixas"]:
        if not any(a <= n <= b for n in conhecidos) and t["numeros"]["cobertura"] < config.COBERTURA_MINIMA:
            falta.append(f"números {a}–{b}")
    for limiar in perguntas["estatisticas"]["assistencias"]:
        if assistencias.resposta(t["assistencias"], limiar) == "sem_registo":
            falta.append(f"mais de {limiar} assistências")
    perfil = r.get("perfil") or {}
    if not perfil.get("pe"):
        falta.append("pé")
    if not perfil.get("altura_cm"):
        falta.append("altura")
    return falta


def _linha_carreira(c, ligas):
    nomes_liga = ", ".join(ligas.get(l, {}).get("nome") or l for l in c["ligas"])
    anos = f"{c['inicio'] or '?'}–{c['fim'] or ''}"
    v = lambda x: "—" if x is None else x
    return (f"| {c['nome']}{' (emp.)' if c['emprestimo'] else ''} | {anos} | {nomes_liga} ({', '.join(c['paises_liga'])}) | "
            f"{v(c['jogos'])} | {v(c['golos'])} | {v(c['assistencias'])} | {v(c['jogos_liga'])} | {v(c['golos_liga'])} | "
            f"{', '.join(map(str, c['numeros'])) or '—'} |")


def gerar() -> str:
    perguntas = _ler(config.PARTILHADO / "perguntas.json")
    paises = _ler(config.PARTILHADO / "paises.json")["paises"]
    ligas = _ler(config.DADOS / "ligas.json", {})
    clubes = _ler(config.DADOS / "clubes.json", {})
    registos = [_ler(c) for c in sorted(config.JOGADORES.glob("*.json"))]
    registos.sort(key=lambda r: r["nome"])
    recolha = {r["id"]: _ler(config.SAIDA / "recolha" / f"{r['id']}.json", {"discrepancias": [], "avisos": []})
               for r in registos}
    curios = {r["id"]: _ler(config.SAIDA / "curiosidades" / f"{r['id']}.json") for r in registos}
    validacao = validar_todos()
    n = len(registos)
    nome_pais = lambda c: paises.get(c, {}).get("nome", c)
    nome_premio = lambda p: _sem_artigo(perguntas["premios"].get(p["id"], {}).get("nome", p["id"])) + \
        (f" ({nome_pais(p['pais'])})" if p.get("pais") else "")

    sem_registo = {r["id"]: respostas_sem_registo(r, perguntas) for r in registos}
    contagem_sr = Counter(q for v in sem_registo.values() for q in v)
    n_erros = sum(len(v["erros"]) for v in validacao.values())
    n_avisos = sum(len(v["avisos"]) for v in validacao.values())
    com_curios = sum(1 for r in registos if r.get("curiosidades"))

    L = [f"# Scout Report — relatório de qualidade da amostra", "",
         f"Gerado a {date.today().isoformat()} · {n} jogadores · fontes: Wikipédia inglesa, Wikidata, zerozero, "
         f"transfermarkt-datasets, Wikimedia Commons.", "",
         "## Resumo", "", "| Medida | Valor |", "|---|---|",
         f"| Totais com todas as competições (zerozero) | {_pct(sum(r['totais']['base'] == 'todas' for r in registos), n)} |",
         f"| Números com cobertura ≥ 90% dos jogos de clube | {_pct(sum(r['totais']['numeros']['cobertura'] >= config.COBERTURA_MINIMA for r in registos), n)} |",
         f"| Assistências com cobertura ≥ 90% | {_pct(sum(r['totais']['assistencias']['cobertura'] >= config.COBERTURA_MINIMA for r in registos), n)} |",
         f"| Com pé preferido | {_pct(sum(bool(r['perfil']['pe']) for r in registos), n)} |",
         f"| Com altura | {_pct(sum(bool(r['perfil']['altura_cm']) for r in registos), n)} |",
         f"| Com foto (Commons) | {_pct(sum(bool(r['perfil']['foto']) for r in registos), n)} |",
         f"| Com posição específica | {_pct(sum(bool(r['posicao']['especificas']) for r in registos), n)} |",
         f"| Com curiosidades | {_pct(com_curios, n)}"
         + ("" if com_curios else (" — pendentes: falta a variável GEMINI_API_KEY" if not llm.tem_chave() else
                                   " — ainda não geradas (`python -m scout curiosidades`)")) + " |",
         f"| Erros de validação | {n_erros} em {sum(bool(v['erros']) for v in validacao.values())} jogadores |",
         f"| Avisos de validação | {n_avisos} |",
         f"| Discrepâncias entre fontes | {sum(len(v['discrepancias']) for v in recolha.values())} |", "",
         "## Perguntas que dariam SEM REGISTO", "",
         "Um \"sim\" basta um dado conhecido; um \"não\" precisa de dados que cubram ≥ 90% dos jogos de clube. "
         "Nas assistências, também sai \"não\" quando o máximo possível não chega ao limiar: as conhecidas mais os "
         "jogos sem dados × o maior de 2 × a taxa do jogador (com pelo menos 50 jogos conhecidos) e o teto da "
         "posição (0,02 por jogo num guarda-redes, "
         "0,10 num central, 0,25 num lateral, até 0,45 num médio ofensivo ou extremo). "
         "Quando não chega para decidir, a ficha leva SEM REGISTO e quem pergunta escolhe outra ação.", "",
         "| Pergunta | Jogadores com SEM REGISTO | Quem |", "|---|---|---|"]
    ordem = [f"números {a}–{b}" for a, b in perguntas["numeros"]["faixas"]] + \
            [f"mais de {x} assistências" for x in perguntas["estatisticas"]["assistencias"]] + ["pé", "altura"]
    for q in ordem:
        quem = [r["nome"] for r in registos if q in sem_registo[r["id"]]]
        L.append(f"| {q} | {_pct(len(quem), n)} | {', '.join(quem) or '—'} |")

    L += ["", "## Jogadores", "",
          "| Jogador | Nasc. | Nac. | Posição | Estado | Base | Jogos | Golos | Int. (golos) | Assist. (cob., máx.) | Números (cob.) | Clubes | Prémios | Fama |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in registos:
        t = r["totais"]
        L.append(f"| {r['nome']} | {r['nascimento']} | {', '.join(r['nacionalidades'])} | "
                 f"{'/'.join(r['posicao']['especificas'] or r['posicao']['setores'])} | {r['estado']}"
                 f"{' + treinador' if r.get('treinador') else ''} | {'todas' if t['base'] == 'todas' else 'camp.+sel.'} | "
                 f"{t['jogos']} | {t['golos']} | {t['internacionalizacoes']} ({t['golos_selecao']}) | "
                 f"{t['assistencias']['conhecidas']} ({round(100 * t['assistencias']['cobertura'])}%, "
                 f"máx. {t['assistencias'].get('maximo', '?')}) | "
                 f"{', '.join(map(str, t['numeros']['conhecidos'])) or '—'} ({round(100 * t['numeros']['cobertura'])}%) | "
                 f"{t['clubes']} | {sum(p['n'] for p in r['premios'])} | {r['fama']['wikipedias']} |")

    L += ["", "## Ficha a ficha", ""]
    for r in registos:
        v, rec, cur = validacao.get(r["id"], {}), recolha[r["id"]], curios.get(r["id"])
        perfil = r["perfil"]
        foto = perfil.get("foto")
        L += [f"### {r['nome']} · [{r['id']}](https://www.wikidata.org/wiki/{r['id']})", "",
              f"[Wikipédia](https://en.wikipedia.org/wiki/{r['fontes']['wikipedia'].replace(' ', '_')})"
              + (f" · [zerozero](https://www.zerozero.pt/jogador.php?id={r['fontes']['zerozero']})" if r['fontes'].get('zerozero') else "")
              + (f" · [Transfermarkt](https://www.transfermarkt.com/x/profil/spieler/{r['fontes']['transfermarkt']})" if r['fontes'].get('transfermarkt') else ""),
              "",
              f"- **Dica:** {r['dica']} · **Aliases:** {', '.join(r['aliases']) or '—'}",
              f"- **Nasceu:** {r['nascimento']} em {perfil.get('naturalidade') or '?'} · **Nacionalidades:** "
              f"{', '.join(nome_pais(p) for p in r['nacionalidades'])} ({', '.join(r['confederacoes'])})",
              f"- **Posição:** {', '.join(perguntas['posicoes'][e]['nome'] for e in r['posicao']['especificas']) or '—'} "
              f"(setor: {', '.join(perguntas['setores'][s] for s in r['posicao']['setores'])}; caixa: \"{r['posicao']['texto']}\")",
              f"- **Pé:** {perfil.get('pe') or 'SEM REGISTO'} · **Altura:** "
              f"{str(perfil['altura_cm']) + ' cm' if perfil.get('altura_cm') else 'SEM REGISTO'}",
              f"- **Estreia sénior:** {r['estreia']} · **Estado:** {r['estado']}"
              + (f" · **Clube atual:** {clubes.get(r['clube_atual'], {}).get('nome') or r['clube_atual']}" if r.get('clube_atual') else ""),
              f"- **Foto:** " + (f"[{foto['url'].rsplit('/', 1)[-1]}]({foto['pagina']}) — {foto.get('autor') or '?'}, {foto.get('licenca') or '?'}"
                                 if foto else "—"),
              f"- **Totais ({'todas as competições' if r['totais']['base'] == 'todas' else 'campeonato + seleção'}):** "
              f"{r['totais']['jogos']} jogos, {r['totais']['golos']} golos, {r['totais']['assistencias']['conhecidas']} assistências conhecidas",
              "", "| Clube | Anos | Liga (país) | J | G | A | J liga | G liga | Números |", "|---|---|---|---|---|---|---|---|---|"]
        L += [_linha_carreira(c, ligas) for c in r["carreira"]]
        for s in r["selecoes"]:
            L.append(f"| **{nome_pais(s['pais'])}** (seleção) | {s['inicio'] or '?'}–{s['fim'] or ''} | | {s['jogos']} | {s['golos']} | | | | "
                     f"{', '.join(map(str, s['numeros'])) or '—'} |")
        L.append("")
        if r["premios"]:
            L.append("- **Prémios:** " + "; ".join(f"{nome_premio(p)} ×{p['n']}" + (f" ({', '.join(map(str, p['anos']))})" if p['anos'] else "")
                                               for p in r["premios"]))
        f = r["factos"]
        factos = []
        if f.get("maior_transferencia"):
            mt = f["maior_transferencia"]
            factos.append(f"maior transferência: {mt['from_club_name']} → {mt['to_club_name']} ({mt['transfer_season']}, "
                          f"{mt['transfer_fee'] / 1e6:.1f} M€)")
        if f.get("valor_maximo_eur"):
            factos.append(f"valor de mercado máximo: {f['valor_maximo_eur'] / 1e6:.0f} M€")
        if f.get("familiares_futebolistas"):
            factos.append("familiares futebolistas: " + ", ".join(f"{x['nome']} ({x['relacao']})" for x in f["familiares_futebolistas"]))
        if factos:
            L.append("- **Factos:** " + "; ".join(factos))
        tr = r.get("treinador")
        if tr:
            L.append("- **Treinador:** " + "; ".join(f"{e['nome']} {e['inicio'] or '?'}–{e['fim'] or ''}{' (interino)' if e['interino'] else ''}"
                                                    for e in tr["equipas"])
                     + f" · títulos: {tr['n_titulos']}"
                     + (" (" + "; ".join(f"{nome_premio(p)} ×{p['n']}" for p in tr["titulos"]) + ")" if tr["titulos"] else "")
                     + (f" · treina agora: {tr['atual']['nome']}" if tr.get("atual") else ""))
        if sem_registo[r["id"]]:
            L.append(f"- **SEM REGISTO em:** {', '.join(sem_registo[r['id']])}")
        if r.get("curiosidades") or (cur and cur.get("rejeitadas")):
            L += ["", "| Curiosidade (PT-PT) | Frase de origem (Wikipédia) |", "|---|---|"]
            L += [f"| {c['texto']}" + (f"<br><sub>antes da revisão: {c['antes']}</sub>" if c.get("antes") else "")
                  + f" | {c['origem']} |" for c in ((cur or {}).get("aceites") or r.get("curiosidades", []))]
            L += [f"| ~~{c['texto']}~~ — rejeitada: {c['motivo']} | {c['origem']} |" for c in (cur or {}).get("rejeitadas", [])]
        for titulo, itens in (("Erros", v.get("erros")), ("Avisos", (rec.get("avisos") or []) + (v.get("avisos") or []))):
            if itens:
                L.append(f"- **{titulo}:** " + "; ".join(itens))
        if rec.get("discrepancias"):
            L.append("- **Discrepâncias:** " + "; ".join(_discrepancia(d) for d in rec["discrepancias"]))
        L.append("")

    desconhecidas = Counter()
    for rec in recolha.values():
        for a in rec.get("avisos", []):
            if a.startswith("competições sem prémio associado: "):
                desconhecidas.update(a.split(": ", 1)[1].split("; "))
    L += ["## Competições sem prémio associado", "",
          "Não dão perguntas de prémios (mas contam nos títulos de treinador). Para as juntar, acrescenta-as a "
          "`pipeline/dados/competicoes.json`.", ""]
    L += [f"- {c} ({k} jogador{'es' if k > 1 else ''})" for c, k in desconhecidas.most_common()] or ["- nenhuma"]
    return "\n".join(L) + "\n"


def _discrepancia(d: dict) -> str:
    resto = {k: v for k, v in d.items() if k not in ("campo", "nota", "escolha")}
    texto = f"{d['campo']}: " + ", ".join(f"{k} {v}" for k, v in resto.items())
    if d.get("escolha"):
        texto += f" → fica {d['escolha']}"
    if d.get("nota"):
        texto += f" ({d['nota']})"
    return texto


def escrever() -> object:
    config.SAIDA.mkdir(parents=True, exist_ok=True)
    caminho = config.SAIDA / "qualidade.md"
    caminho.write_text(gerar(), encoding="utf-8")
    return caminho
