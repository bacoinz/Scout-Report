-- Década de nascimento (1990 = nascido entre 1990 e 1999): o sorteio dá mais peso aos anos 90, depois aos 80 e
-- 2000, depois aos 70 e por fim aos 60 (partilhado/perguntas.json → sorteio_por_decada_de_nascimento).
ALTER TABLE jogadores ADD COLUMN decada_nascimento INTEGER;
CREATE INDEX jogadores_decada ON jogadores (ativo, decada_nascimento, aleatorio);
CREATE INDEX jogadores_decada_conhecidos ON jogadores (ativo, conhecido, decada_nascimento, aleatorio);
