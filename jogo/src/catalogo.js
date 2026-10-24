// Acesso ao D1: a versão da base, o catálogo (ligas e clubes) para o menu, os nomes para o palpite, e o sorteio
// dos jogadores secretos. Em jogo só se lê.
import { prepararCatalogo } from '../public/js/comum/perguntas.js';
import { PERGUNTAS } from '../public/js/comum/dados.gen.js';

const PESOS_NASCIMENTO = PERGUNTAS.sorteio_por_decada_de_nascimento;

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

const baralhar = (lista, aleatorio) => {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
};

/**
 * Quantos sortear de cada década de nascimento: cada lugar vai para uma década ao calhas, com os pesos de
 * partilhado/perguntas.json (anos 90 primeiro, depois 80 e 2000, 70, 60), sem passar do que há em cada uma.
 * `disponiveis`: Map(década → quantos há). Puro (testado em test/catalogo.test.js).
 */
export function repartir(disponiveis, quantos, aleatorio = Math.random) {
  const peso = (d) => PESOS_NASCIMENTO[String(d)] ?? 1;
  const porDecada = new Map();
  for (let i = 0; i < quantos; i++) {
    const opcoes = [...disponiveis].filter(([d, n]) => n > (porDecada.get(d) ?? 0));
    if (!opcoes.length) break;
    let r = aleatorio() * opcoes.reduce((s, [d]) => s + peso(d), 0);
    const [d] = opcoes.find(([x]) => (r -= peso(x)) < 0) ?? opcoes.at(-1);
    porDecada.set(d, (porDecada.get(d) ?? 0) + 1);
  }
  return porDecada;
}

/**
 * `quantos` registos ao calhas, sem os já usados na sala, repartidos pelas décadas de nascimento. Em vez de
 * ORDER BY RANDOM() (que lê a tabela toda), parte de um ponto ao acaso da coluna `aleatorio` (indexada) e dá a
 * volta se faltar. Devolve os registos.
 */
export async function sortear(db, config, excluir, quantos, aleatorio = Math.random) {
  const ex = JSON.stringify(excluir);
  const fora = 'id NOT IN (SELECT value FROM json_each(?))';
  const { results } = await db
    .prepare(`SELECT decada_nascimento AS d, COUNT(*) AS n FROM jogadores WHERE ${condicoes(config)} AND ${fora} GROUP BY decada_nascimento`)
    .bind(ex)
    .all();
  const porDecada = repartir(new Map((results ?? []).map((l) => [l.d, l.n])), quantos, aleatorio);
  const registos = [];
  for (const [decada, n] of porDecada) {
    const inicio = aleatorio();
    const daDecada = decada == null ? 'decada_nascimento IS NULL' : 'decada_nascimento = ?';
    const args = decada == null ? [] : [decada];
    const consulta = (comparacao, limite) =>
      db
        .prepare(`SELECT dados FROM jogadores WHERE ${condicoes(config)} AND ${daDecada} AND ${fora} AND aleatorio ${comparacao} ? ORDER BY aleatorio LIMIT ?`)
        .bind(...args, ex, inicio, limite)
        .all();
    // Pede-se o dobro e baralha-se: assim dois sorteios seguidos não dão jogadores vizinhos na coluna.
    const pedir = Math.min(n * 2, 100);
    const primeiros = (await consulta('>=', pedir)).results ?? [];
    const resto = primeiros.length < pedir ? (await consulta('<', pedir - primeiros.length)).results ?? [] : [];
    registos.push(...baralhar([...primeiros, ...resto], aleatorio).slice(0, n).map((l) => JSON.parse(l.dados)));
  }
  return baralhar(registos, aleatorio);
}
