"""Gemini (plano gratuito) por HTTP, sem SDK, com saída em JSON segundo um esquema e temperatura 0.

A chave vem só da variável de ambiente GEMINI_API_KEY: nunca é escrita em ficheiros, na cache nem no relatório,
e a chave da cache de cada pedido é dada por quem chama (modelo + jogador + revisão do artigo + versão do pedido)."""
import json
import os

from .. import config
from ..http import ErroHttp


class SemChave(RuntimeError):
    pass


def tem_chave() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


def gerar_json(cliente, sistema: str, pedido: str, esquema: dict, chave_cache: str, modelo: str = config.GEMINI_MODELO,
               fresco: bool = False) -> dict:
    chave = os.environ.get("GEMINI_API_KEY")
    if not chave:
        raise SemChave("falta a variável de ambiente GEMINI_API_KEY")
    url = config.GEMINI_URL.format(modelo=modelo)
    cabecalhos = {"x-goog-api-key": chave, "Content-Type": "application/json"}
    corpo = {"systemInstruction": {"parts": [{"text": sistema}]},
             "contents": [{"role": "user", "parts": [{"text": pedido}]}],
             "generationConfig": {"temperature": 0, "responseMimeType": "application/json",
                                  "responseJsonSchema": esquema}}
    try:
        dados = cliente.post_json(url, corpo, cabecalhos, f"gemini|{modelo}|{chave_cache}", fresco=fresco)
    except ErroHttp as e:
        if e.estado != 400 or "responseJsonSchema" not in str(e):
            raise
        # Modelos que ainda só aceitam o esquema antigo (subconjunto da OpenAPI).
        corpo["generationConfig"]["responseSchema"] = corpo["generationConfig"].pop("responseJsonSchema")
        dados = cliente.post_json(url, corpo, cabecalhos, f"gemini|{modelo}|{chave_cache}|antigo", fresco=fresco)
    candidatos = dados.get("candidates") or []
    if not candidatos or not candidatos[0].get("content", {}).get("parts"):
        motivo = (candidatos[0].get("finishReason") if candidatos else None) or dados.get("promptFeedback")
        raise RuntimeError(f"o Gemini não devolveu texto ({motivo})")
    return json.loads(candidatos[0]["content"]["parts"][0]["text"])
