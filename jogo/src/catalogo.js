// Acesso ao D1: a versão da base, o catálogo (ligas e clubes) para o menu, os nomes para o palpite, e o sorteio
// dos jogadores secretos. Em jogo só se lê.
import { prepararCatalogo } from '../public/js/comum/perguntas.js';

export async function lerVersao(db) {
  const linha = await db.prepare("SELECT valor FROM resumo WHERE chave = 'versao'").first();
  return linha?.valor ?? '0';
}

/** { versao, ligas: {id: {nome, pais}}, clubes: {id: {nome, pais, ligas}} } — o que o /api/catalogo serve. */
export async function lerCatalogo(db) {
  const [versao, ligas, clubes] = await Promise.all([
    lerVersao(db),
    db.prepare('SELECT id, nome, pais FROM ligas').all(),
    db.prepare('SELECT id, nome, pais, ligas FROM clubes').all(),
  ]);
  return {
    versao,
    ligas: Object.fromEntries((ligas.results ?? []).map((l) => [l.id, { nome: l.nome, pais: l.pais }])),
    clubes: Object.fromEntries((clubes.results ?? []).map((c) => [c.id, { nome: c.nome, pais: c.pais, ligas: JSON.parse(c.ligas) }])),
  };
}

/** [{ id, nome, aliases, dica, conhecido }] — o autocompletar do palpite. */
export async function lerNomes(db) {
  const { results } = await db.prepare('SELECT id, nome, aliases, dica, conhecido FROM jogadores WHERE ativo = 1 ORDER BY nome').all();
  return (results ?? []).map((j) => ({ id: j.id, nome: j.nome, aliases: JSON.parse(j.aliases), dica: j.dica, conhecido: Boolean(j.conhecido) }));
}

/**
 * O catálogo preparado (com os índices), guardado na memória do isolate: os DO das salas usam-no para validar as
 * perguntas. Volta a ler-se do D1 quando muda a versão (verificada no máximo de 5 em 5 minutos).
 */
let emCache = null;
export async function catalogoPreparado(db, agora = Date.now()) {
  if (emCache && agora - emCache.lidoEm < 5 * 60_000) return emCache.catalogo;
  const versao = await lerVersao(db);
  if (emCache?.catalogo.versao !== versao) emCache = { catalogo: prepararCatalogo(await lerCatalogo(db)), lidoEm: agora };
  else emCache.lidoEm = agora;
  return emCache.catalogo;
}

const condicoes = (config) => (config.jogadores === 'todos' ? 'ativo = 1' : 'ativo = 1 AND conhecido = 1');

export async function contar(db, config, excluir = []) {
  const linha = await db
    .prepare(`SELECT COUNT(*) AS n FROM jogadores WHERE ${condicoes(config)} AND id NOT IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(excluir))
    .first();
  return linha?.n ?? 0;
}

/**
 * `quantos` registos ao calhas, sem os já usados na sala. Em vez de ORDER BY RANDOM() (que lê a tabela toda),
 * parte de um ponto ao acaso da coluna `aleatorio` (indexada) e dá a volta se faltar. Devolve os registos.
 */
export async function sortear(db, config, excluir, quantos, aleatorio = Math.random) {
  const inicio = aleatorio();
  const consulta = (comparacao, limite) =>
    db
      .prepare(`SELECT dados FROM jogadores WHERE ${condicoes(config)} AND id NOT IN (SELECT value FROM json_each(?)) AND aleatorio ${comparacao} ? ORDER BY aleatorio LIMIT ?`)
      .bind(JSON.stringify(excluir), inicio, limite)
      .all();
  // Pede-se o dobro e baralha-se: assim dois sorteios seguidos não dão jogadores vizinhos na coluna.
  const pedir = Math.min(quantos * 2, 100);
  const primeiros = (await consulta('>=', pedir)).results ?? [];
  const resto = primeiros.length < pedir ? (await consulta('<', pedir - primeiros.length)).results ?? [] : [];
  const registos = [...primeiros, ...resto].map((l) => JSON.parse(l.dados));
  for (let i = registos.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [registos[i], registos[j]] = [registos[j], registos[i]];
  }
  return registos.slice(0, quantos);
}
