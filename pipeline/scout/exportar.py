"""Exportação para o D1 do jogo: SQL em saida/d1/, aplicado com `npm run db:local` (ou --remote no deploy).

Tabelas (jogo/migrations/0001_inicial.sql):
- jogadores: o registo validado em `dados` (JSON), mais as colunas para sortear e para o autocompletar;
- clubes e ligas: só os que aparecem nas carreiras. As ligas de um clube são as das passagens dos jogadores (assim o
  menu "jogou no {clube}?" abre com as mesmas ligas que as respostas usam), e as "outra-PT" chamam-se
  "Outra liga de Portugal";
- resumo: a versão, para o /api/catalogo e o /api/nomes ficarem em cache até à exportação seguinte.

Cada instrução fica abaixo de 90 KB (o D1 aceita até 100 KB). Os jogadores que saíram da base ficam com ativo = 0."""
import hashlib
import json
import random
from collections import Counter, defaultdict
from datetime import datetime, timezone

from . import config
from .validar import validar_todos

LIMITE_INSTRUCAO = 90_000
POR_FICHEIRO = 200
SAIDA_D1 = config.SAIDA / "d1"


def _sql(valor) -> str:
    if valor is None:
        return "NULL"
    if isinstance(valor, bool):
        return "1" if valor else "0"
    if isinstance(valor, (int, float)):
        return repr(valor)
    return "'" + str(valor).replace("'", "''") + "'"


def _insert(tabela: str, linha: dict, chave: str = "id") -> str:
    colunas = list(linha)
    atualizar = ", ".join(f"{c} = excluded.{c}" for c in colunas if c != chave)
    return (f"INSERT INTO {tabela} ({', '.join(colunas)}) VALUES ({', '.join(_sql(linha[c]) for c in colunas)}) "
            f"ON CONFLICT({chave}) DO UPDATE SET {atualizar};")


def _aleatorio(qid: str) -> float:
    """Posição no sorteio, estável entre exportações (não baralha a base de cada vez)."""
    return random.Random(int(hashlib.sha1(qid.encode()).hexdigest()[:12], 16)).random()


def _dados_do_jogo(r: dict) -> dict:
    """O que vai para o D1: o registo sem o que só serve ao pipeline."""
    d = {k: v for k, v in r.items() if k not in ("atualizado_em",)}
    d["fontes"] = {"wikipedia": r["fontes"].get("wikipedia")}
    return d


def gerar() -> dict:
    """Escreve saida/d1/*.sql. Devolve contagens. Recusa se houver erros de validação."""
    validacao = validar_todos()
    com_erros = {q: v for q, v in validacao.items() if v["erros"]}
    if com_erros:
        raise SystemExit(f"{len(com_erros)} registos com erros de validação: corre `python -m scout validar`.")
    paises = json.loads((config.PARTILHADO / "paises.json").read_text(encoding="utf-8"))["paises"]
    clubes_cat = json.loads((config.DADOS / "clubes.json").read_text(encoding="utf-8"))
    ligas_cat = json.loads((config.DADOS / "ligas.json").read_text(encoding="utf-8"))
    registos = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(config.JOGADORES.glob("*.json"))]
    registos = [r for r in registos if not r["nascimento"] or int(r["nascimento"][:4]) >= config.NASCIDOS_DESDE]

    # Clubes e ligas que aparecem nas carreiras (e nas equipas treinadas).
    ligas_do_clube = defaultdict(set)
    paises_do_clube = defaultdict(Counter)
    nome_do_clube = {}
    usadas = set()
    for r in registos:
        for c in r["carreira"]:
            ligas_do_clube[c["clube"]].update(c["ligas"])
            paises_do_clube[c["clube"]].update(c["paises_liga"])
            nome_do_clube.setdefault(c["clube"], c["nome"])
            usadas.update(c["ligas"])
        for e in (r.get("treinador") or {}).get("equipas", []):
            if e["tipo"] == "clube":
                nome_do_clube.setdefault(e["equipa"], e["nome"])
                if e.get("pais"):
                    paises_do_clube[e["equipa"]].update([e["pais"]])

    linhas_clubes = []
    for q, nome in sorted(nome_do_clube.items()):
        cat = clubes_cat.get(q, {})
        pais = paises_do_clube[q].most_common(1)[0][0] if paises_do_clube[q] else None
        linhas_clubes.append({"id": q, "nome": cat.get("nome") or nome, "pais": pais,
                              "ligas": json.dumps(sorted(ligas_do_clube[q]))})
    # O país de cada liga abre-a no menu ("jogou numa liga de X ✓" → "jogou na liga L?"). As ligas extintas (a da
    # URSS, a da Jugoslávia…) não têm país no catálogo: ficam com o das passagens, que já é o da sucessora.
    paises_da_liga = defaultdict(Counter)
    for r in registos:
        for c in r["carreira"]:
            for l in c["ligas"]:
                paises_da_liga[l].update(c["paises_liga"])
    pais_liga = {}
    linhas_ligas = []
    for l in sorted(usadas):
        if l.startswith("outra-"):
            pais = l.removeprefix("outra-")
            nome = f"Outra liga de {paises.get(pais, {}).get('nome', pais)}"
        else:
            pais = ligas_cat.get(l, {}).get("pais") or \
                (paises_da_liga[l].most_common(1)[0][0] if paises_da_liga[l] else None)
            nome = ligas_cat.get(l, {}).get("nome") or l
        pais_liga[l] = pais
        linhas_ligas.append({"id": l, "nome": nome, "pais": pais})

    # Cada jogador tem de ter um clube alcançável pelo menu (país da liga → liga → clube), senão o palpite final, que
    # pede um clube confirmado, nunca se desbloquearia.
    sem_clube = [r["nome"] for r in registos
                 if not any(pais_liga.get(l) in c["paises_liga"] for c in r["carreira"] for l in c["ligas"])]
    if sem_clube:
        raise SystemExit(f"{len(sem_clube)} jogadores sem nenhum clube alcançável pelo menu: {', '.join(sem_clube[:10])}")

    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    linhas_jog = []
    for r in registos:
        dados = json.dumps(_dados_do_jogo(r), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        linhas_jog.append({"id": r["id"], "nome": r["nome"], "aliases": json.dumps(r["aliases"], ensure_ascii=False),
                           "dica": r["dica"], "conhecido": bool(r["fama"].get("conhecido")),
                           "diario": bool(r["fama"].get("diario")), "dados": dados, "aleatorio": _aleatorio(r["id"]),
                           "decada_nascimento": int(r["nascimento"][:3]) * 10 if r["nascimento"] else None,
                           "hash": hashlib.sha1(dados.encode()).hexdigest()[:16], "ativo": True, "atualizado_em": agora})
    versao = hashlib.sha1("".join(l["hash"] for l in linhas_jog).encode()
                          + json.dumps([linhas_clubes, linhas_ligas], sort_keys=True).encode()).hexdigest()[:10]

    SAIDA_D1.mkdir(parents=True, exist_ok=True)
    for f in SAIDA_D1.glob("*.sql"):
        f.unlink()
    ficheiros = []

    def escrever(nome, instrucoes):
        for i in instrucoes:
            if len(i.encode()) > LIMITE_INSTRUCAO:
                raise SystemExit(f"Instrução com {len(i.encode())} bytes em {nome} (máximo {LIMITE_INSTRUCAO}).")
        (SAIDA_D1 / nome).write_text("\n".join(instrucoes) + "\n", encoding="utf-8")
        ficheiros.append(nome)

    for i in range(0, len(linhas_jog), POR_FICHEIRO):
        escrever(f"01_jogadores_{i // POR_FICHEIRO + 1:02d}.sql",
                 [_insert("jogadores", l) for l in linhas_jog[i:i + POR_FICHEIRO]])
    ids = ", ".join(_sql(l["id"]) for l in linhas_jog)
    escrever("02_desativar.sql", [f"UPDATE jogadores SET ativo = 0 WHERE id NOT IN ({ids});"])
    escrever("03_catalogo.sql", [_insert("ligas", l) for l in linhas_ligas] + [_insert("clubes", l) for l in linhas_clubes])
    escrever("04_resumo.sql", [_insert("resumo", {"chave": "versao", "valor": versao}, chave="chave")])
    return {"jogadores": len(linhas_jog), "clubes": len(linhas_clubes), "ligas": len(linhas_ligas), "versao": versao,
            "ficheiros": ficheiros}
