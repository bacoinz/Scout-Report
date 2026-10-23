import pytest
import requests

from scout.http import BloqueioAntiBot, Cliente


class _Sessao(requests.Session):
    """Responde sempre com o desafio da AWS WAF que o Transfermarkt devolve a pedidos automáticos."""

    def request(self, metodo, url, **kwargs):
        r = requests.Response()
        r.status_code = 202
        r.headers["x-amzn-waf-action"] = "challenge"
        r.headers["content-type"] = "text/html; charset=UTF-8"
        r._content = b""
        r.url = url
        return r


def test_desafio_aws_waf_para_a_recolha(tmp_path):
    cliente = Cliente(pasta_cache=tmp_path, dormir=lambda s: None, sessao=_Sessao())
    cliente._robots["https://www.transfermarkt.com"] = None      # sem ir buscar o robots.txt
    cliente.pode = lambda url: True
    with pytest.raises(BloqueioAntiBot):
        cliente.texto("https://www.transfermarkt.com/x/rueckennummern/spieler/3624")
    assert not list(tmp_path.rglob("*.gz"))                        # nada fica em cache
