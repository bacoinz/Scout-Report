"""Validação dos registos de dados/jogadores/: erros (impedem a exportação) e avisos (para rever)."""
import json

from . import config


def _ler(caminho):
    return json.loads(caminho.read_text(encoding="utf-8"))


def validar_registo(r: dict, perguntas: dict, paises: dict) -> tuple[list[str], list[str]]:
    erros, avisos = [], []
    for campo in ("id", "nome", "nascimento", "estreia", "estado", "carreira", "totais", "nacionalidades", "posicao"):
        if not r.get(campo):
            erros.append(f"falta o campo {campo}")
    if not (r.get("posicao") or {}).get("setores"):
        erros.append("posição sem setor")
    ano_nasc = int(str(r.get("nascimento") or "0")[:4] or 0)
    estreia = r.get("estreia")
    if ano_nasc and estreia:
        if estreia <= ano_nasc:
            erros.append(f"estreia ({estreia}) antes do nascimento ({ano_nasc})")
        elif not 15 <= estreia - ano_nasc <= 23:
            avisos.append(f"estreia aos {estreia - ano_nasc} anos")
    carreira = r.get("carreira") or []
    for c in carreira:
        nome = c.get("nome") or c.get("clube")
        if c.get("inicio") and c.get("fim") and c["inicio"] > c["fim"]:
            erros.append(f"{nome}: início depois do fim")
        if c.get("inicio") and estreia and c["inicio"] < estreia:
            erros.append(f"{nome}: passagem antes da estreia")
        if c.get("fim") and c["fim"] > config.ANO_ATUAL + 1:
            erros.append(f"{nome}: fim no futuro ({c['fim']})")
        if not c.get("clube"):
            erros.append(f"{nome}: clube sem QID")
        if not c.get("ligas") or not c.get("paises_liga"):
            erros.append(f"{nome}: sem liga ou país da liga")
        for n in c.get("numeros", []):
            if not 1 <= n <= 99:
                erros.append(f"{nome}: número {n} fora de 1–99")
    if r.get("estado") == "ativo" and not r.get("clube_atual"):
        avisos.append("no ativo e sem clube (contrato acabado)")
    if r.get("clube_atual") and r["clube_atual"] not in {c["clube"] for c in carreira}:
        erros.append("o clube atual não está na carreira")
    for p in r.get("nacionalidades", []):
        if p not in paises:
            erros.append(f"nacionalidade {p} sem país em paises.json")
    if len(r.get("confederacoes", [])) < 1:
        erros.append("sem confederação")
    pos = r.get("posicao") or {}
    for e in pos.get("especificas", []):
        info = perguntas["posicoes"].get(e)
        if not info:
            erros.append(f"posição {e} desconhecida")
        elif info["setor"] not in pos.get("setores", []):
            erros.append(f"o setor de {e} ({info['setor']}) não está nos setores")
    if not pos.get("especificas"):
        avisos.append("sem posição específica (só o setor)")
    for p in r.get("premios", []) + ((r.get("treinador") or {}).get("titulos") or []):
        if p["id"] not in perguntas["premios"]:
            erros.append(f"prémio {p['id']} desconhecido")
    t = r.get("totais") or {}
    soma = sum((c.get("jogos") if t.get("base") == "todas" else c.get("jogos_liga")) or 0 for c in carreira)
    if t and t.get("jogos", 0) < soma:
        erros.append(f"total de jogos ({t.get('jogos')}) menor do que a soma das passagens ({soma})")
    if t and t.get("internacionalizacoes", 0) < sum(s.get("jogos") or 0 for s in r.get("selecoes", [])):
        erros.append("internacionalizações menores do que a soma das seleções")
    perfil = r.get("perfil") or {}
    if not perfil.get("pe"):
        avisos.append("sem pé preferido")
    if not perfil.get("altura_cm"):
        avisos.append("sem altura")
    elif not 150 <= perfil["altura_cm"] <= 210:
        erros.append(f"altura estranha: {perfil['altura_cm']} cm")
    if not perfil.get("foto"):
        avisos.append("sem foto")
    return erros, avisos


def validar_todos() -> dict:
    """{QID: {'nome', 'erros': [...], 'avisos': [...]}}."""
    perguntas = _ler(config.PARTILHADO / "perguntas.json")
    paises = _ler(config.PARTILHADO / "paises.json")["paises"]
    res = {}
    for caminho in sorted(config.JOGADORES.glob("*.json")):
        r = _ler(caminho)
        erros, avisos = validar_registo(r, perguntas, paises)
        if caminho.stem != r.get("id"):
            erros.append(f"o ficheiro {caminho.name} não corresponde ao id {r.get('id')}")
        res[caminho.stem] = {"nome": r.get("nome"), "erros": erros, "avisos": avisos}
    return res
