"""Configuração do pipeline: caminhos, cliente HTTP, fontes e limiares."""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent           # pipeline/
PROJETO = RAIZ.parent                                    # ScoutReport/
CACHE = RAIZ / ".cache"
DADOS = RAIZ / "dados"
JOGADORES = DADOS / "jogadores"
SAIDA = RAIZ / "saida"
PARTILHADO = PROJETO / "partilhado"
TM = CACHE / "tm"

USER_AGENT = "ScoutReport/0.1 (jogo pessoal; https://scout-report.bacoinz.workers.dev)"
TIMEOUT = 40
TIMEOUT_LLM = 150        # os modelos que "pensam" demoram 30–90 s com um artigo inteiro
TIMEOUT_LLM_LOCAL = 600  # no Ollama, o 1.º pedido carrega o modelo para a placa gráfica
TENTATIVAS = 4            # em 429/5xx ou erro de rede, com espera crescente
TENTATIVAS_MAXLAG = 15    # a Wikidata pede para esperar quando está atrasada (maxlag): até ~10 min no total

# Espera entre pedidos reais ao mesmo anfitrião (segundos, mín–máx). A Wikimedia pede um pedido de cada vez e
# corta quem pede depressa demais; o zerozero tem 1 pedido a cada 2–3 s, como no Guess The Kit.
ATRASOS = {
    "www.zerozero.pt": (2.0, 3.0),
    "generativelanguage.googleapis.com": (4.5, 5.5),     # plano gratuito do Gemini: ~15 pedidos por minuto
    "127.0.0.1:11434": (0.0, 0.0),                       # Ollama local: um pedido de cada vez, sem esperas
    "padrao": (0.8, 1.2),
}
# APIs da Wikimedia: regem-se pela política de User-Agent e pela etiqueta da API, não pelo robots.txt
# (que proíbe /w/ a robôs de páginas). Aqui não se consulta o robots.txt.
WIKIMEDIA = {"en.wikipedia.org", "pt.wikipedia.org", "www.wikidata.org", "query.wikidata.org", "commons.wikimedia.org"}

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
ZEROZERO = "https://www.zerozero.pt"
TM_URL = "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/{tabela}.csv.gz"
TM_TABELAS = ("players", "appearances", "games", "game_lineups", "clubs", "competitions", "transfers")

# Comparados na amostra (23/10): o flash-lite escrevia frases sem sentido ("trabalhava como armazém"); o 3.5-flash
# deu 27 curiosidades aceites em 29, em bom português; o 3.8-flash estava sobrecarregado (503).
GEMINI_MODELO = "gemini-3.5-flash"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"
# Ollama local (curiosidades com `--modelo ollama:gemma4:12b`): sem quotas, o texto não sai do PC.
OLLAMA_URL = "http://127.0.0.1:11434"
OLLAMA_CONTEXTO = 8192

# Regras de cobertura (ver Decisões no plano): um "não" só sai com dados que cubram ≥ 90% dos jogos de clube.
COBERTURA_MINIMA = 0.90
ANO_ATUAL = 2026
