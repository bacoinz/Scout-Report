// Desafio do Dia ("Relatório do Dia"): um jogador mistério por dia (data de Lisboa), igual para toda a gente.
// Sem estado no servidor e sem contas: o browser guarda o progresso e manda o histórico das perguntas; o servidor
// volta a responder a esse histórico a partir do registo (assim os "sim" são verdadeiros), valida a hierarquia e só
// então responde à pergunta nova. O jogador mistério só sai do servidor no fim (palpite certo ou desistir).
import * as P from '../public/js/comum/perguntas.js';
import { revelavel } from './partida.js';

/** O dia do lançamento é o Relatório #1 (no deploy fica na variável DIA_LANCAMENTO do wrangler.jsonc). */
export const LANCAMENTO_POR_OMISSAO = '2026-10-25';
/** Dia zero da ordem de reserva (as datas sem linha na tabela `desafios`). */
const EPOCA = '2026-01-01';
export const HISTORICO_MAX = 300;

const MS_DIA = 86_400_000;
const formatoLisboa = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });

/** A data de Lisboa ("2026-10-25") de um instante. */
export const dataLisboa = (instante = Date.now()) => formatoLisboa.format(new Date(instante));

export function somarDias(data, n) {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d) + n * MS_DIA).toISOString().slice(0, 10);
}
export const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / MS_DIA);

/** O número do relatório: os dias desde o lançamento (o do lançamento é o #1). */
export const numero = (data, lancamento = LANCAMENTO_POR_OMISSAO) => diasEntre(lancamento, data) + 1;

/** Hoje e ontem (Lisboa), desde o lançamento: quem começou antes da meia-noite ainda acaba o de ontem. */
export function datasValidas(instante = Date.now(), lancamento = LANCAMENTO_POR_OMISSAO) {
  const hoje = dataLisboa(instante);
  return [hoje, somarDias(hoje, -1)].filter((d) => d >= lancamento);
}

/**
 * Milissegundos até à meia-noite seguinte em Lisboa. Lisboa está a UTC+0 ou UTC+1 e a hora muda à 01:00 UTC, por
 * isso a meia-noite é às 23:00 ou às 00:00 UTC: a primeira das duas em que já é o dia seguinte.
 */
export function faltaParaAmanha(instante = Date.now()) {
  const amanha = somarDias(dataLisboa(instante), 1);
  const meiaNoiteUtc = Date.parse(`${amanha}T00:00:00Z`);
  const t = [meiaNoiteUtc - 3_600_000, meiaNoiteUtc].find((x) => dataLisboa(x) === amanha);
  return t - instante;
}

async function sha1(texto) {
  const bytes = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A ordem dos jogadores do Desafio pelo sha1("scout-report:dia:<QID>"), a mesma que a exportação usa para preencher
 * o calendário (pipeline/scout/calendario.py).
 */
export async function ordemDoCalendario(ids) {
  const comChave = await Promise.all(ids.map(async (id) => [await sha1(`scout-report:dia:${id}`), id]));
  return comChave.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([, id]) => id);
}

/**
 * O jogador de uma data: o da tabela `desafios` (se ainda estiver na base). Sem linha (antes da primeira exportação
 * do calendário, ou além do fim dele), um da ordem do calendário, a rodar a partir de EPOCA.
 */
export async function jogadorDoDia(db, data) {
  const marcado = await db
    .prepare('SELECT j.dados FROM desafios d JOIN jogadores j ON j.id = d.jogador_id WHERE d.data = ? AND j.ativo = 1')
    .bind(data)
    .first();
  if (marcado) return JSON.parse(marcado.dados);
  const { results } = await db.prepare('SELECT id FROM jogadores WHERE ativo = 1 AND diario = 1').all();
  const ordem = await ordemDoCalendario((results ?? []).map((r) => r.id));
  if (!ordem.length) return null;
  const n = diasEntre(EPOCA, data);
  const id = ordem[((n % ordem.length) + ordem.length) % ordem.length];
  const linha = await db.prepare('SELECT dados FROM jogadores WHERE id = ?').bind(id).first();
  return linha ? JSON.parse(linha.dados) : null;
}

/**
 * Volta a fazer as perguntas do histórico, por ordem, com as regras do jogo (cada uma tem de estar aberta nesse
 * momento). Devolve { ficha } ou { erro }.
 */
export function refazer(reg, historico, cat) {
  if (!Array.isArray(historico) || historico.length > HISTORICO_MAX) return { erro: 'Histórico inválido.' };
  const ficha = { respostas: {}, livres: [], palpites: [], completos: {} };
  for (const chave of historico) {
    if (!P.disponivel(ficha, chave, cat)) return { erro: 'O histórico não bate certo com as regras.' };
    ficha.respostas[chave] = { r: P.responder(reg, chave) };
    ficha.completos = P.completos(reg, ficha);
  }
  return { ficha };
}

/**
 * A resposta a uma pergunta nova: { r, completos } ou { erro }. `completos` diz se já se encontraram todos os países
 * (ou clubes): o browser guarda-o e tira esse campo do menu, como no jogo.
 */
export function perguntar(reg, historico, chave, cat) {
  const { ficha, erro } = refazer(reg, historico, cat);
  if (erro) return { erro };
  if (!P.valida(chave, cat)) return { erro: 'Essa pergunta não existe.' };
  if (!P.disponivel(ficha, chave, cat)) return { erro: 'Essa pergunta não está aberta.' };
  const r = P.responder(reg, chave);
  ficha.respostas[chave] = { r };
  return { r, completos: P.completos(reg, ficha) };
}

/** Um palpite, só com o palpite final desbloqueado pelo histórico (os "sim" e o clube): { certo, revelado? } ou { erro }. */
export function palpitar(reg, historico, id, cat) {
  const { ficha, erro } = refazer(reg, historico, cat);
  if (erro) return { erro };
  if (!P.palpiteDesbloqueado(ficha)) return { erro: 'O palpite final ainda não está desbloqueado.' };
  if (typeof id !== 'string' || !/^Q\d{1,12}$/.test(id)) return { erro: 'Escolhe um jogador da lista.' };
  return id === reg.id ? { certo: true, revelado: revelavel(reg) } : { certo: false };
}

export const desistir = (reg) => ({ revelado: revelavel(reg) });
