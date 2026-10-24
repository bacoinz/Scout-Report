// Lógica de uma sala: jogadores, cores, anfitrião, opções do lobby, início e fim da partida, feed e prazos.
// (Estrutura do Guess The Kit.) Pura: o Durable Object (sala.js) trata dos sockets, da persistência, dos alarmes
// e do D1; os registos sorteados chegam já em `ctx.registos`. A partida em si está em partida.js.
import { REGRAS, PALETA } from './regras.js';
import * as partida from './partida.js';

const { noFeed, limparTexto } = partida;

export function novaSala({ codigo, anfitriaoToken = null, agora }) {
  return {
    codigo,
    criadaEm: agora,
    fase: 'lobby', // lobby | jogo | final
    anfitriao: null,
    anfitriaoToken,
    config: structuredClone(REGRAS.porOmissao),
    disponiveis: null, // jogadores da base com estas opções (o DO conta no D1)
    jogadores: [],
    usados: [], // registos que já saíram nesta sala (como secretos ou cartas): não se repetem
    partida: null,
    feed: [],
    seq: 0,
    proximoId: 1,
    vaziaDesde: agora,
  };
}

const jogador = (sala, id) => sala.jogadores.find((j) => j.id === id);
const erro = (msg) => ({ erro: msg });
const aJogar = (sala) => sala.jogadores.filter((j) => !j.espectador && !j.saiu);
export const limparNome = (nome) => limparTexto(nome, REGRAS.nomeMax);

// ---------------------------------------------------------------------------
// Jogadores
// ---------------------------------------------------------------------------

/** Entrada ou reconexão (mesmo token → mesmo jogador, com os mesmos pontos e o mesmo jogador secreto). */
export function entrar(sala, { token, nome }, ctx) {
  if (typeof token !== 'string' || token.length < 8 || token.length > 64) return erro('Identificação inválida.');
  const existente = sala.jogadores.find((j) => j.token === token);
  if (existente) {
    if (existente.saiu) return erro('Saíste desta partida. Entra noutra sala ou espera pela próxima partida.');
    existente.ligado = true;
    existente.desligadoEm = null;
    sala.vaziaDesde = null;
    if (token === sala.anfitriaoToken) sala.anfitriao = existente.id;
    partida.descongelar(sala, ctx);
    return { jogador: existente, novo: false };
  }
  const limpo = limparNome(nome);
  if (!limpo) return erro('Escolhe um nome.');
  const ativos = sala.jogadores.filter((j) => !j.saiu);
  if (ativos.length >= REGRAS.maxJogadores + REGRAS.maxEspectadores) return erro('A sala está cheia.');
  // Com a sala cheia ou uma partida a decorrer, fica a ver (joga a partir da ronda seguinte).
  const espectador = aJogar(sala).length >= REGRAS.maxJogadores || sala.fase === 'jogo';
  const usados = new Set(ativos.map((j) => j.nome.toLowerCase()));
  let final = limpo;
  for (let n = 2; usados.has(final.toLowerCase()); n++) final = `${limpo.slice(0, REGRAS.nomeMax - 4)} (${n})`;
  const cores = new Set(ativos.map((j) => j.cor));
  const novo = {
    id: `j${sala.proximoId++}`,
    token,
    nome: final,
    cor: PALETA.find((c) => !cores.has(c)) ?? PALETA[0],
    total: 0,
    ronda: 0,
    ligado: true,
    desligadoEm: null,
    espectador,
    identificado: false,
    saindo: false,
    saiu: false,
  };
  sala.jogadores.push(novo);
  sala.vaziaDesde = null;
  if (!sala.anfitriao || token === sala.anfitriaoToken) sala.anfitriao = novo.id;
  noFeed(sala, { tipo: 'entrou', jogador: novo.id, espectador });
  if (sala.fase === 'jogo' && sala.config.modo === 'escolha') partida.oferecerCartas(sala, novo.id, ctx);
  return { jogador: novo, novo: true };
}

export function desligar(sala, jogadorId, ctx) {
  const j = jogador(sala, jogadorId);
  if (!j || !j.ligado) return false;
  j.ligado = false;
  j.desligadoEm = ctx.agora;
  if (!sala.jogadores.some((x) => x.ligado)) sala.vaziaDesde = ctx.agora;
  avancar(sala, ctx); // a vez de quem saiu fica com 10 s; uma pergunta livre ao dono cai
  partida.congelarSeVazia(sala, ctx.agora);
  return true;
}

/** "Sair da sala": no lobby sai já; a meio de uma partida, no fim da ronda (a ficha é revelada). */
export function sair(sala, jogadorId, ctx) {
  const j = jogador(sala, jogadorId);
  if (!j) return false;
  if (sala.fase === 'jogo') {
    const mudou = partida.sairDaPartida(sala, jogadorId, ctx);
    avancar(sala, ctx);
    return mudou;
  }
  sala.jogadores = sala.jogadores.filter((x) => x.id !== jogadorId);
  noFeed(sala, { tipo: 'saiu_sala', nome: j.nome });
  if (sala.anfitriao === jogadorId) {
    const novo = sala.jogadores.find((x) => x.ligado) ?? sala.jogadores[0] ?? null;
    sala.anfitriao = novo?.id ?? null;
    if (novo) noFeed(sala, { tipo: 'anfitriao', jogador: novo.id });
  }
  if (!sala.jogadores.some((x) => x.ligado)) sala.vaziaDesde = ctx.agora;
  return true;
}

/** Se o anfitrião está fora há mais de 20 s, passa o papel ao jogador ligado mais antigo. */
function verificarAnfitriao(sala, agora) {
  const atual = jogador(sala, sala.anfitriao);
  if (atual?.ligado && !atual.saiu) return false;
  if (atual && !atual.saiu && agora - (atual.desligadoEm ?? 0) < REGRAS.anfitriaoAusenteMs) return false;
  const novo = sala.jogadores.find((j) => j.ligado && !j.espectador && !j.saiu) ?? sala.jogadores.find((j) => j.ligado && !j.saiu);
  if (!novo || novo.id === sala.anfitriao) return false;
  sala.anfitriao = novo.id;
  noFeed(sala, { tipo: 'anfitriao', jogador: novo.id });
  return true;
}

const soAnfitriao = (sala, id) => (id === sala.anfitriao ? null : erro('Só o anfitrião pode fazer isso.'));

// ---------------------------------------------------------------------------
// Lobby e partida
// ---------------------------------------------------------------------------

/** Opções do anfitrião, só no lobby. Valores desconhecidos são ignorados. */
export function configurar(sala, jogadorId, cfg) {
  const recusa = soAnfitriao(sala, jogadorId);
  if (recusa) return recusa;
  if (sala.fase !== 'lobby') return erro('A partida já começou.');
  const c = structuredClone(sala.config);
  if (REGRAS.modos.includes(cfg?.modo)) c.modo = cfg.modo;
  if (REGRAS.grupos.includes(cfg?.jogadores)) c.jogadores = cfg.jogadores;
  if (cfg?.fim?.tipo === 'rondas' && REGRAS.rondas.includes(cfg.fim.n)) c.fim = { tipo: 'rondas', n: cfg.fim.n };
  if (cfg?.fim?.tipo === 'minutos' && REGRAS.minutos.includes(cfg.fim.n)) c.fim = { tipo: 'minutos', n: cfg.fim.n };
  if (REGRAS.vezes.includes(cfg?.vez)) c.vez = cfg.vez;
  sala.config = c;
  return { ok: true };
}

/** Quantos registos sortear para começar: um por jogador (Aleatório) ou três (Escolha), mais a folga. */
export function quantosSortear(sala) {
  const n = aJogar(sala).length;
  return (sala.config.modo === 'escolha' ? n * 3 : n) + REGRAS.folgaReserva;
}

/** Começa a partida com os registos que o DO sorteou (`ids`; os registos estão em ctx.registos). */
export function comecar(sala, jogadorId, ctx, ids) {
  const recusa = soAnfitriao(sala, jogadorId);
  if (recusa) return recusa;
  if (sala.fase !== 'lobby') return erro('A partida já começou.');
  const jogam = aJogar(sala);
  if (jogam.filter((j) => j.ligado).length < 2) return erro('São precisos pelo menos 2 jogadores.');
  const novos = (ids ?? []).filter((id) => !sala.usados.includes(id) && ctx.registos.has(id));
  const precisos = sala.config.modo === 'escolha' ? jogam.length * 3 : jogam.length;
  if (novos.length < precisos) return erro('Não há jogadores suficientes na base com estas opções.');
  for (const j of sala.jogadores) {
    Object.assign(j, { total: 0, ronda: 0, identificado: false, saindo: false });
  }
  sala.usados.push(...novos);
  sala.fase = 'jogo';
  noFeed(sala, { tipo: 'comecou' });
  partida.iniciarPartida(sala, ctx, novos);
  return { ok: true };
}

/** Registos novos para a reserva (o DO sorteou-os porque `partida.faltamNaReserva` > 0). */
export function acrescentarReserva(sala, ids, ctx) {
  const p = sala.partida;
  if (sala.fase !== 'jogo' || !p) return false;
  const novos = ids.filter((id) => !sala.usados.includes(id) && ctx.registos.has(id));
  if (!novos.length) return false;
  sala.usados.push(...novos);
  p.reserva.push(...novos);
  if (sala.config.modo === 'escolha') {
    for (const j of sala.jogadores) if (j.espectador && !j.saiu) partida.oferecerCartas(sala, j.id, ctx);
  }
  return true;
}

/** Depois do fim: volta ao lobby com os mesmos jogadores (quem saiu desaparece). */
export function novoJogo(sala, jogadorId) {
  const recusa = soAnfitriao(sala, jogadorId);
  if (recusa) return recusa;
  if (sala.fase !== 'final') return erro('A partida ainda não acabou.');
  sala.jogadores = sala.jogadores.filter((j) => !j.saiu);
  for (const j of sala.jogadores) Object.assign(j, { espectador: false, identificado: false, saindo: false });
  sala.fase = 'lobby';
  sala.partida = null;
  if (!jogador(sala, sala.anfitriao)) sala.anfitriao = sala.jogadores.find((j) => j.ligado)?.id ?? sala.jogadores[0]?.id ?? null;
  return { ok: true };
}

/** Volta a permitir os jogadores que já saíram nesta sala. */
export function reporUsados(sala, jogadorId) {
  const recusa = soAnfitriao(sala, jogadorId);
  if (recusa) return recusa;
  if (sala.fase !== 'lobby') return erro('Só no lobby.');
  sala.usados = [];
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tempo
// ---------------------------------------------------------------------------

/** Avança a sala até `ctx.agora` (anfitrião, partida). Devolve true se algo mudou. */
export function avancar(sala, ctx) {
  let mudou = verificarAnfitriao(sala, ctx.agora);
  if (sala.fase === 'jogo') mudou = partida.avancar(sala, ctx) || mudou;
  return mudou;
}

/** Próximo instante em que a sala precisa de acordar (partida, troca de anfitrião, limpeza). */
export function proximoPrazo(sala) {
  const prazos = [partida.proximoPrazo(sala)];
  const anf = jogador(sala, sala.anfitriao);
  if (anf && !anf.ligado && sala.jogadores.some((j) => j.ligado)) prazos.push((anf.desligadoEm ?? 0) + REGRAS.anfitriaoAusenteMs);
  if (sala.vaziaDesde != null) prazos.push(sala.vaziaDesde + REGRAS.limpezaSalaVaziaMs);
  const validos = prazos.filter((t) => typeof t === 'number');
  return validos.length ? Math.min(...validos) : null;
}

export const deveLimpar = (sala, agora) => sala.vaziaDesde != null && agora >= sala.vaziaDesde + REGRAS.limpezaSalaVaziaMs;

/** Os registos de que a sala ainda precisa (secretos, cartas, reserva): o DO apaga os outros. */
export function registosEmUso(sala) {
  const p = sala.partida;
  if (!p) return new Set();
  return new Set([
    ...Object.values(p.segredos).map((s) => s.registo),
    ...Object.values(p.cartas).flatMap((c) => c.ids),
    ...p.reserva,
  ]);
}

export const faseVisivel = (sala) => sala.fase;
