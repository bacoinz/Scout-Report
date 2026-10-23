"""transfermarkt-datasets (CC0; parado desde 5/9/2026, dados até junho de 2026).

`preparar()` carrega uma vez os CSV.gz para .cache/tm/tm.sqlite (só as colunas usadas). Daí sai, por jogador:
pé, altura, posição, valor máximo, transferências e, época a época desde ~2012, jogos, golos, assistências, números
e a liga — só nas competições que o conjunto cobre (as principais ligas europeias e as competições da UEFA)."""
import csv
import gzip
import sqlite3

from .. import config

BD = config.TM / "tm.sqlite"

_ESQUEMA = """
CREATE TABLE IF NOT EXISTS players (player_id INTEGER PRIMARY KEY, name TEXT, date_of_birth TEXT, position TEXT,
  sub_position TEXT, foot TEXT, height_in_cm INTEGER, country_of_birth TEXT, country_of_citizenship TEXT,
  last_season INTEGER, current_club_id INTEGER, current_club_name TEXT, highest_market_value_in_eur REAL);
CREATE TABLE IF NOT EXISTS clubs (club_id INTEGER PRIMARY KEY, name TEXT, domestic_competition_id TEXT);
CREATE TABLE IF NOT EXISTS competitions (competition_id TEXT PRIMARY KEY, name TEXT, type TEXT, sub_type TEXT,
  country_name TEXT);
CREATE TABLE IF NOT EXISTS games (game_id INTEGER PRIMARY KEY, competition_id TEXT, season INTEGER, date TEXT,
  competition_type TEXT);
CREATE TABLE IF NOT EXISTS appearances (player_id INTEGER, game_id INTEGER, player_club_id INTEGER, date TEXT,
  competition_id TEXT, goals INTEGER, assists INTEGER, minutes_played INTEGER);
CREATE TABLE IF NOT EXISTS lineups (player_id INTEGER, game_id INTEGER, club_id INTEGER, number TEXT, type TEXT);
CREATE TABLE IF NOT EXISTS transfers (player_id INTEGER, transfer_date TEXT, transfer_season TEXT,
  from_club_name TEXT, to_club_name TEXT, transfer_fee REAL, market_value_in_eur REAL);
"""

_COLUNAS = {
    "players": ("players", ["player_id", "name", "date_of_birth", "position", "sub_position", "foot", "height_in_cm",
                            "country_of_birth", "country_of_citizenship", "last_season", "current_club_id",
                            "current_club_name", "highest_market_value_in_eur"]),
    "clubs": ("clubs", ["club_id", "name", "domestic_competition_id"]),
    "competitions": ("competitions", ["competition_id", "name", "type", "sub_type", "country_name"]),
    "games": ("games", ["game_id", "competition_id", "season", "date", "competition_type"]),
    "appearances": ("appearances", ["player_id", "game_id", "player_club_id", "date", "competition_id", "goals",
                                    "assists", "minutes_played"]),
    "game_lineups": ("lineups", ["player_id", "game_id", "club_id", "number", "type"]),
    "transfers": ("transfers", ["player_id", "transfer_date", "transfer_season", "from_club_name", "to_club_name",
                                "transfer_fee", "market_value_in_eur"]),
}


def descarregar(cliente) -> dict:
    """Descarrega os CSV.gz (≈178 MB) para .cache/tm/. Devolve {tabela: bytes}."""
    return {t: cliente.descarregar(config.TM_URL.format(tabela=t), config.TM / f"{t}.csv.gz") for t in config.TM_TABELAS}


def _valor(v: str):
    return None if v in ("", None) else v


def preparar() -> dict:
    """(Re)cria tm.sqlite a partir dos CSV.gz. Devolve {tabela: linhas}."""
    BD.unlink(missing_ok=True)
    ligacao = sqlite3.connect(BD)
    ligacao.executescript(_ESQUEMA)
    contagens = {}
    for ficheiro, (tabela, colunas) in _COLUNAS.items():
        caminho = config.TM / f"{ficheiro}.csv.gz"
        with gzip.open(caminho, "rt", encoding="utf-8", newline="") as f:
            leitor = csv.DictReader(f)
            sql = f"INSERT OR IGNORE INTO {tabela} ({', '.join(colunas)}) VALUES ({', '.join('?' * len(colunas))})"
            lote, n = [], 0
            for linha in leitor:
                lote.append([_valor(linha.get(c)) for c in colunas])
                if len(lote) >= 50_000:
                    ligacao.executemany(sql, lote)
                    n += len(lote)
                    lote = []
            ligacao.executemany(sql, lote)
            contagens[tabela] = n + len(lote)
    ligacao.executescript("""
        CREATE INDEX IF NOT EXISTS i_app ON appearances(player_id);
        CREATE INDEX IF NOT EXISTS i_lin ON lineups(player_id);
        CREATE INDEX IF NOT EXISTS i_tra ON transfers(player_id);
    """)
    ligacao.commit()
    ligacao.close()
    return contagens


def disponivel() -> bool:
    return BD.exists()


class Transfermarkt:
    def __init__(self):
        self.bd = sqlite3.connect(BD)
        self.bd.row_factory = sqlite3.Row

    def jogador(self, tm_id) -> dict | None:
        linha = self.bd.execute("SELECT * FROM players WHERE player_id = ?", (int(tm_id),)).fetchone()
        return dict(linha) if linha else None

    def epocas(self, tm_id) -> list[dict]:
        """Por (época, clube): jogos, golos, assistências (todas as competições cobertas), liga e números."""
        linhas = self.bd.execute("""
            SELECT g.season AS epoca, a.player_club_id AS clube_id, c.name AS clube,
                   COUNT(*) AS jogos, SUM(a.goals) AS golos, SUM(a.assists) AS assistencias,
                   GROUP_CONCAT(DISTINCT CASE WHEN g.competition_type = 'domestic_league' THEN g.competition_id END) AS ligas
            FROM appearances a JOIN games g ON g.game_id = a.game_id
            LEFT JOIN clubs c ON c.club_id = a.player_club_id
            WHERE a.player_id = ? AND g.competition_type != 'national_team_competition'
            GROUP BY g.season, a.player_club_id ORDER BY g.season""", (int(tm_id),)).fetchall()
        numeros = {}
        for n in self.bd.execute("""
            SELECT g.season AS epoca, l.club_id AS clube_id, l.number AS numero
            FROM lineups l JOIN games g ON g.game_id = l.game_id
            WHERE l.player_id = ? AND g.competition_type != 'national_team_competition'""", (int(tm_id),)):
            if n["numero"] and str(n["numero"]).isdigit() and 1 <= int(n["numero"]) <= 99:
                numeros.setdefault((n["epoca"], n["clube_id"]), set()).add(int(n["numero"]))
        res = []
        for l in linhas:
            d = dict(l)
            d["ligas"] = [x for x in (d["ligas"] or "").split(",") if x]
            d["numeros"] = sorted(numeros.get((d["epoca"], d["clube_id"]), set()))
            res.append(d)
        return res

    def numeros_selecao(self, tm_id) -> list[int]:
        res = set()
        for n in self.bd.execute("""SELECT l.number FROM lineups l JOIN games g ON g.game_id = l.game_id
                                    WHERE l.player_id = ? AND g.competition_type = 'national_team_competition'""",
                                 (int(tm_id),)):
            if n[0] and str(n[0]).isdigit() and 1 <= int(n[0]) <= 99:
                res.add(int(n[0]))
        return sorted(res)

    def liga(self, competition_id) -> dict | None:
        linha = self.bd.execute("SELECT * FROM competitions WHERE competition_id = ?", (competition_id,)).fetchone()
        return dict(linha) if linha else None

    def maior_transferencia(self, tm_id) -> dict | None:
        linha = self.bd.execute("""SELECT transfer_season, from_club_name, to_club_name, transfer_fee FROM transfers
                                   WHERE player_id = ? AND transfer_fee > 0 ORDER BY transfer_fee DESC LIMIT 1""",
                                (int(tm_id),)).fetchone()
        return dict(linha) if linha else None

    def primeira_epoca_coberta(self) -> int:
        return self.bd.execute("SELECT MIN(season) FROM games WHERE competition_type = 'domestic_league'").fetchone()[0]
