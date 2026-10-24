-- Base de jogadores (escrita pelo pipeline: python -m scout exportar). Em jogo só se lê.

CREATE TABLE jogadores (
  id            TEXT PRIMARY KEY,               -- QID da Wikidata (Q11571 = Cristiano Ronaldo)
  nome          TEXT NOT NULL,
  aliases       TEXT NOT NULL,                  -- JSON: outros nomes aceites no palpite
  dica          TEXT NOT NULL,                  -- "1972 · França": distingue homónimos no autocompletar
  conhecido     INTEGER NOT NULL DEFAULT 0,     -- entra no lobby "Conhecidos"
  diario        INTEGER NOT NULL DEFAULT 0,     -- pode sair no Desafio do Dia
  dados         TEXT NOT NULL,                  -- JSON: o registo validado (pipeline/dados/jogadores/<QID>.json)
  aleatorio     REAL NOT NULL,                  -- posição no sorteio (evita ORDER BY RANDOM, que lê a tabela toda)
  hash          TEXT NOT NULL,                  -- do `dados`: a exportação seguinte só reescreve o que mudou
  ativo         INTEGER NOT NULL DEFAULT 1,     -- 0 = saiu da base
  atualizado_em TEXT NOT NULL
);
CREATE INDEX jogadores_sorteio ON jogadores (ativo, aleatorio);
CREATE INDEX jogadores_conhecidos ON jogadores (ativo, conhecido, aleatorio);

-- Catálogo para o menu das perguntas: só as ligas e os clubes que aparecem nas carreiras.
CREATE TABLE ligas (
  id   TEXT PRIMARY KEY,                        -- QID, ou "outra-PT" ("Outra liga de Portugal")
  nome TEXT NOT NULL,
  pais TEXT                                     -- código: PT, ES, GB-ENG…
);
CREATE TABLE clubes (
  id    TEXT PRIMARY KEY,                       -- QID, ou "x-…" para clubes sem artigo
  nome  TEXT NOT NULL,
  pais  TEXT,
  ligas TEXT NOT NULL                           -- JSON: as ligas das passagens dos jogadores por este clube
);

-- Desafio do Dia (passo 6): um jogador por data de Lisboa.
CREATE TABLE desafios (
  data       TEXT PRIMARY KEY,                  -- AAAA-MM-DD
  jogador_id TEXT NOT NULL
);

-- 'versao': muda a cada exportação; o catálogo e os nomes servem-se em cache com ela.
CREATE TABLE resumo (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
