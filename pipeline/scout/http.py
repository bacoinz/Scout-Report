"""Cliente HTTP educado (do Guess The Kit), com as regras das APIs da Wikimedia.

- Um pedido de cada vez por anfitrião, com espera entre pedidos reais (os da cache não esperam).
- User-Agent identificável; robots.txt respeitado, exceto nas APIs da Wikimedia (regem-se pela etiqueta da API).
- Cache gzip em .cache/<anfitrião>/<sha1>.gz. Erros nunca vão para a cache.
- Na Wikimedia: maxlag=5, formatversion=2; uma resposta 200 com "error" (p. ex. maxlag) espera e repete.
- Para de vez perante um desafio anti-bot (nunca se tenta contornar).
"""
import gzip
import hashlib
import json
import random
import time
from urllib.parse import urlencode, urlsplit
from urllib.robotparser import RobotFileParser

import requests

from . import config


class BloqueioAntiBot(RuntimeError):
    """O site respondeu com um desafio anti-bot: a recolha para aqui."""


class ProibidoPeloRobots(RuntimeError):
    pass


class ErroHttp(RuntimeError):
    def __init__(self, url: str, estado: int, texto: str = ""):
        super().__init__(f"HTTP {estado} em {url}" + (f": {texto[:200]}" if texto else ""))
        self.estado = estado
        self.texto = texto


class ErroApi(RuntimeError):
    """A API respondeu 200 mas com um erro no corpo (que não seja maxlag)."""


def _parece_desafio(resposta: requests.Response) -> bool:
    if resposta.headers.get("cf-mitigated", "").lower() == "challenge":
        return True
    if resposta.headers.get("x-amzn-waf-action", "").lower() in ("challenge", "captcha"):   # AWS WAF (Transfermarkt)
        return True
    if resposta.status_code in (403, 503) and "text/html" in resposta.headers.get("content-type", ""):
        inicio = resposta.text[:3000].lower()
        return "just a moment" in inicio or "challenge-platform" in inicio or "cf-chl" in inicio
    return False


def _url_completo(url: str, params: dict | None) -> str:
    if not params:
        return url
    return f"{url}?{urlencode(sorted((k, str(v)) for k, v in params.items()))}"


class Cliente:
    def __init__(self, pasta_cache=config.CACHE, dormir=time.sleep, sessao: requests.Session | None = None,
                 atrasos: dict | None = None):
        self.pasta_cache = pasta_cache
        self.dormir = dormir
        self.atrasos = atrasos or config.ATRASOS
        self.sessao = sessao or requests.Session()
        self.sessao.headers.update({"User-Agent": config.USER_AGENT, "Accept-Encoding": "gzip",
                                    "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8"})
        self._robots: dict[str, RobotFileParser] = {}
        self._ultimo: dict[str, float] = {}
        self.pedidos = 0           # pedidos reais feitos (não conta a cache)

    # --- regras -----------------------------------------------------------------------------------
    def _esperar_vez(self, anfitriao: str):
        ultimo = self._ultimo.get(anfitriao)
        if ultimo is not None:
            minimo, maximo = self.atrasos.get(anfitriao, self.atrasos["padrao"])
            falta = random.uniform(minimo, maximo) - (time.monotonic() - ultimo)
            if falta > 0:
                self.dormir(falta)
        self._ultimo[anfitriao] = time.monotonic()

    def _robots_de(self, url: str) -> RobotFileParser:
        partes = urlsplit(url)
        base = f"{partes.scheme}://{partes.netloc}"
        if base not in self._robots:
            rp = RobotFileParser()
            resposta = self._pedir("GET", f"{base}/robots.txt", verificar_robots=False)
            rp.parse([] if resposta.status_code >= 400 else resposta.text.splitlines())
            self._robots[base] = rp
        return self._robots[base]

    def pode(self, url: str) -> bool:
        anfitriao = urlsplit(url).netloc
        if anfitriao in config.WIKIMEDIA:
            return True
        return self._robots_de(url).can_fetch(config.USER_AGENT, url)

    # --- pedidos ----------------------------------------------------------------------------------
    def _pedir(self, metodo: str, url: str, verificar_robots: bool = True, **kwargs) -> requests.Response:
        if verificar_robots and not self.pode(url):
            raise ProibidoPeloRobots(url)
        anfitriao = urlsplit(url).netloc
        resposta = None
        for tentativa in range(config.TENTATIVAS):
            self._esperar_vez(anfitriao)
            try:
                resposta = self.sessao.request(metodo, url, **{"timeout": config.TIMEOUT, **kwargs})
            except requests.RequestException:
                if tentativa == config.TENTATIVAS - 1:
                    raise
                self.dormir(5 * (tentativa + 1))
                continue
            self.pedidos += 1
            if _parece_desafio(resposta):
                raise BloqueioAntiBot(f"{anfitriao} respondeu com um desafio anti-bot ({resposta.status_code}) em {url}")
            if resposta.status_code == 429 or resposta.status_code >= 500:
                espera = resposta.headers.get("retry-after")
                self.dormir(float(espera) if espera and espera.isdigit() else 10 * (tentativa + 1))
                continue
            return resposta
        return resposta

    def _ficheiro_cache(self, chave: str, anfitriao: str):
        # Um anfitrião com porta ("host:8080"): o Windows não aceita ":" nos nomes das pastas.
        return self.pasta_cache / anfitriao.replace(":", "_") / f"{hashlib.sha1(chave.encode()).hexdigest()}.gz"

    def _ler_cache(self, ficheiro):
        return gzip.decompress(ficheiro.read_bytes()).decode("utf-8") if ficheiro.exists() else None

    def _gravar_cache(self, ficheiro, texto: str):
        ficheiro.parent.mkdir(parents=True, exist_ok=True)
        ficheiro.write_bytes(gzip.compress(texto.encode("utf-8")))

    def texto(self, url: str, params: dict | None = None, fresco: bool = False) -> str:
        """HTML/texto de uma página, da cache se já foi pedida. Erros HTTP levantam ErroHttp (não ficam em cache)."""
        completo = _url_completo(url, params)
        ficheiro = self._ficheiro_cache(completo, urlsplit(url).netloc)
        if not fresco and (guardado := self._ler_cache(ficheiro)) is not None:
            return guardado
        resposta = self._pedir("GET", completo)
        if resposta.status_code != 200:
            raise ErroHttp(completo, resposta.status_code)
        resposta.encoding = resposta.encoding or "utf-8"
        self._gravar_cache(ficheiro, resposta.text)
        return resposta.text

    def api(self, url: str, params: dict, fresco: bool = False) -> dict:
        """Pedido GET a uma API JSON. Na Wikimedia acrescenta maxlag/format e trata os erros no corpo."""
        params = dict(params)
        anfitriao = urlsplit(url).netloc
        if url.endswith("api.php"):
            params.setdefault("format", "json")
            params.setdefault("formatversion", "2")
            # Na Wikidata o maxlag soma o atraso do serviço de consultas (WDQS), que trava edições de robôs durante
            # horas; para leituras não serve de nada. Aí lê-se sem maxlag (1 pedido de cada vez, ~1 s entre pedidos).
            if anfitriao != "www.wikidata.org":
                params.setdefault("maxlag", "5")
        completo = _url_completo(url, params)
        ficheiro = self._ficheiro_cache(completo, anfitriao)
        if not fresco and (guardado := self._ler_cache(ficheiro)) is not None:
            return json.loads(guardado)
        # O maxlag é frequente na Wikidata: espera-se (cada vez mais, até 60 s) e repete-se, como pede a etiqueta.
        for tentativa in range(config.TENTATIVAS_MAXLAG):
            resposta = self._pedir("GET", completo, headers={"Accept": "application/json"})
            if resposta.status_code != 200:
                raise ErroHttp(completo, resposta.status_code, resposta.text)
            dados = resposta.json()
            erro = dados.get("error") if isinstance(dados, dict) else None
            if erro:
                if erro.get("code") == "maxlag":
                    espera = resposta.headers.get("retry-after")
                    base = float(espera) if espera and espera.isdigit() else 5.0
                    self.dormir(min(60.0, base * (tentativa + 1)))
                    continue
                raise ErroApi(f"{erro.get('code')}: {erro.get('info')} ({completo[:200]})")
            self._gravar_cache(ficheiro, json.dumps(dados, ensure_ascii=False))
            return dados
        raise ErroApi(f"maxlag persistente em {completo[:200]}")

    def descarregar(self, url: str, destino) -> int:
        """Ficheiro binário grande (CSV.gz do transfermarkt-datasets) direto para o disco. Devolve os bytes."""
        resposta = self._pedir("GET", url, stream=True)
        if resposta.status_code != 200:
            raise ErroHttp(url, resposta.status_code)
        destino.parent.mkdir(parents=True, exist_ok=True)
        total = 0
        with open(destino, "wb") as f:
            for bloco in resposta.iter_content(1 << 20):
                f.write(bloco)
                total += len(bloco)
        return total
