"""LLM por HTTP, sem SDK, com saída em JSON segundo um esquema e temperatura 0. Dois motores:

- **Ollama local** (modelo "ollama:<nome>", p. ex. "ollama:gemma4:12b"): corre no teu PC, sem quotas nem chave; o
  texto da Wikipédia não sai do computador. `format` com o esquema obriga a resposta a ser JSON válido.
- **Gemini** (plano gratuito): a chave vem só da variável de ambiente GEMINI_API_KEY e nunca é escrita em ficheiros,
  na cache nem no relatório.

A chave da cache de cada pedido é dada por quem chama (modelo + jogador + revisão do artigo + versão do pedido)."""
import json
import os
import re

from .. import config
from ..http import ErroHttp


class SemChave(RuntimeError):
    pass


class QuotaDiaria(RuntimeError):
    """O plano gratuito já não aceita mais pedidos a este modelo hoje (a quota é por modelo e por dia)."""


class SemOllama(RuntimeError):
    pass


def e_local(modelo: str) -> bool:
    return modelo.startswith("ollama:")


def tem_chave() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


def ollama_disponivel(modelo: str) -> str | None:
    """None se o Ollama estiver a correr e tiver o modelo; senão, o que falta (para mostrar ao utilizador)."""
    import requests
    nome = modelo.removeprefix("ollama:")
    try:
        modelos = requests.get(f"{config.OLLAMA_URL}/api/tags", timeout=5).json().get("models", [])
    except requests.RequestException:
        return f"o Ollama não está a correr em {config.OLLAMA_URL} (abre a aplicação Ollama ou corre `ollama serve`)"
    nomes = {m["name"] for m in modelos} | {m["name"].removesuffix(":latest") for m in modelos}
    return None if nome in nomes else f"falta o modelo: corre `ollama pull {nome}`"


def gerar_json(cliente, sistema: str, pedido: str, esquema: dict, chave_cache: str, modelo: str = config.GEMINI_MODELO,
               fresco: bool = False) -> dict:
    if e_local(modelo):
        return _ollama(cliente, sistema, pedido, esquema, chave_cache, modelo.removeprefix("ollama:"), fresco)
    return _gemini(cliente, sistema, pedido, esquema, chave_cache, modelo, fresco)


def _ollama(cliente, sistema, pedido, esquema, chave_cache, modelo, fresco) -> dict:
    corpo = {"model": modelo, "stream": False, "think": False, "format": esquema,
             "messages": [{"role": "system", "content": sistema}, {"role": "user", "content": pedido}],
             # O artigo (~9000 caracteres) e a resposta não cabem no contexto por omissão de alguns modelos.
             "options": {"temperature": 0, "num_ctx": config.OLLAMA_CONTEXTO}}
    try:
        dados = cliente.post_json(f"{config.OLLAMA_URL}/api/chat", corpo, {"Content-Type": "application/json"},
                                  f"ollama|{modelo}|{chave_cache}", fresco=fresco, timeout=config.TIMEOUT_LLM_LOCAL)
    except ErroHttp as e:
        raise SemOllama(f"o Ollama respondeu {e.estado}: {e.texto[:300]}") from e
    return _ler_json(dados.get("message", {}).get("content", ""))


def _gemini(cliente, sistema, pedido, esquema, chave_cache, modelo, fresco) -> dict:
    chave = os.environ.get("GEMINI_API_KEY")
    if not chave:
        raise SemChave("falta a variável de ambiente GEMINI_API_KEY")
    url = config.GEMINI_URL.format(modelo=modelo)
    cabecalhos = {"x-goog-api-key": chave, "Content-Type": "application/json"}
    if modelo.startswith("gemma"):
        # O Gemma (mesma API e mesma chave) não aceita instruções de sistema nem saída JSON forçada: vai tudo no
        # pedido e o JSON lê-se do texto.
        corpo = {"contents": [{"role": "user", "parts": [{"text": f"{sistema}\n\nResponde só com um objeto JSON "
                                                                  f"válido, com este esquema:\n{json.dumps(esquema)}"
                                                                  f"\n\n{pedido}"}]}],
                 "generationConfig": {"temperature": 0}}
    else:
        corpo = {"systemInstruction": {"parts": [{"text": sistema}]},
                 "contents": [{"role": "user", "parts": [{"text": pedido}]}],
                 "generationConfig": {"temperature": 0, "responseMimeType": "application/json",
                                      "responseJsonSchema": esquema}}
    try:
        dados = cliente.post_json(url, corpo, cabecalhos, f"gemini|{modelo}|{chave_cache}", fresco=fresco,
                                  timeout=config.TIMEOUT_LLM)
    except ErroHttp as e:
        if e.estado == 429 and "PerDay" in e.texto:
            espera = re.search(r"retry in ([\dhm]+)", e.texto)
            raise QuotaDiaria(f"acabou a quota diária do {modelo}" + (f" (volta daqui a {espera.group(1)})" if espera else ""))
        if e.estado != 400 or "responseJsonSchema" not in str(e):
            raise
        # Modelos que ainda só aceitam o esquema antigo (subconjunto da OpenAPI).
        corpo["generationConfig"]["responseSchema"] = corpo["generationConfig"].pop("responseJsonSchema")
        dados = cliente.post_json(url, corpo, cabecalhos, f"gemini|{modelo}|{chave_cache}|antigo", fresco=fresco,
                                  timeout=config.TIMEOUT_LLM)
    candidatos = dados.get("candidates") or []
    partes = [p["text"] for p in (candidatos[0].get("content", {}).get("parts") or []) if p.get("text") and not p.get("thought")] \
        if candidatos else []
    if not partes:
        motivo = (candidatos[0].get("finishReason") if candidatos else None) or dados.get("promptFeedback")
        raise RuntimeError(f"o Gemini não devolveu texto ({motivo})")
    return _ler_json(partes[-1])


def _ler_json(texto: str) -> dict:
    texto = texto.strip()
    if not texto.startswith("{"):                        # ```json … ``` ou texto à volta (Gemma)
        texto = texto[texto.find("{"):texto.rfind("}") + 1]
    return json.loads(texto)
