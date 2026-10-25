// Partida: escolha dos jogadores secretos, rondas, rotação dos alvos, vezes, perguntas (da lista e livres),
// palpites, identificação, desligados e fim. Pura: `ctx` traz { agora, aleatorio, registos, catalogo } e o
// Durable Object (sala.js) trata dos sockets, da persistência, dos alarmes e do D1.
import * as P from '../public/js/comum/perguntas.js';
import { REGRAS } from './regras.js';
import * as joker from './joker.js';

const jogador = (sala, id) => sala.jogadores.find((j) => j.id === id);
const erro = (msg, extra = {}) => ({ erro: msg, ...extra });

export function noFeed(sala, evento) {
  sala.seq += 1;
  sala.feed.push({ seq: sala.seq, ...evento });
  if (sala.feed.length > REGRAS.feedMax) sala.feed.splice(0, sala.feed.length - REGRAS.feedMax);
}

export function limparTexto(texto, max) {
  return String(texto ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

// ---------------------------------------------------------------------------
// Quem joga, quem é alvo
// ---------------------------------------------------------------------------

/** A ficha do jogador secreto de alguém. */
export function fichaDe(sala, id) {
  const s = sala.partida?.segredos[id];
  return s ? sala.partida.fichas[s.ficha] : null;
}
/** Quem está na partida (tem ou teve um jogador secreto e não saiu), pela ordem da mesa. */
export const emJogo = (sala) => sala.jogadores.filter((j) => !j.espectador && !j.saiu && sala.partida?.segredos[j.id]);
/** Quem ainda é alvo: o jogador secreto está por identificar. */
export const alvos = (sala) => emJogo(sala).filter((j) => !fichaDe(sala, j.id).identificada);
/** Pode fazer perguntas: não está de saída e tem a quem perguntar (o dono do último secreto já não tem). */
const podeJogar = (sala, j) => !j.saindo && alvos(sala).some((t) => t.id !== j.id);
/** Há alguém ligado que possa jogar (sem ninguém, a partida congela em vez de passar rondas vazias). */
const algumLigado = (sala) => emJogo(sala).some((j) => j.ligado && podeJogar(sala, j));

/** Distância na mesa de `de` até `para` (1 = o seguinte). */
function distanciaNaMesa(sala, de, para) {
  const ids = sala.jogadores.map((j) => j.id);
  return (ids.indexOf(para) - ids.indexOf(de) + ids.length) % ids.length;
}

/**
 * Os alvos desta ronda: na v-ésima ronda do ciclo, cada um pergunta ao v-ésimo alvo a seguir a si na mesa (sem
 * contar consigo). Com N alvos, quem também é alvo passa por todos os outros em N − 1 rondas; d = ((v − 1) mod
 * (N − 1)) + 1. Quem já foi identificado continua a perguntar e passa pelos N.
 */
export function calcularAlvos(sala) {
  const p = sala.partida;
  const v = p.ronda - p.cicloInicio + 1;
  const ids = alvos(sala).map((j) => j.id);
  const res = {};
  for (const a of emJogo(sala)) {
    const lista = ids.filter((t) => t !== a.id).sort((x, y) => distanciaNaMesa(sala, a.id, x) - distanciaNaMesa(sala, a.id, y));
    if (lista.length) res[a.id] = lista[(v - 1) % lista.length];
  }
  return res;
}

/** O alvo de `id` deixou de o ser a meio da ronda (identificado, saiu): o alvo seguinte a ele na mesa. */
function substituto(sala, id, original) {
  const ids = alvos(sala).map((j) => j.id).filter((t) => t !== id);
  if (!ids.length) return null;
  if (!original) return ids[0];
  return ids.sort((x, y) => distanciaNaMesa(sala, original, x) - distanciaNaMesa(sala, original, y))[0];
}
const alvoValido = (sala, alvo, id) => alvo && alvo !== id && alvos(sala).some((j) => j.id === alvo);

// ---------------------------------------------------------------------------
// Jogadores secretos
// ---------------------------------------------------------------------------

/** Tira da reserva até `n` registos ao calhas. */
function tirarDaReserva(sala, n, ctx) {
  const r = sala.partida.reserva;
  const tirados = [];
  while (tirados.length < n && r.length) tirados.push(r.splice(Math.floor(ctx.aleatorio() * r.length), 1)[0]);
  return tirados;
}

function atribuir(sala, id, registo) {
  const p = sala.partida;
  const n = p.proximaFicha++;
  p.fichas[n] = { n, dono: id, respostas: {}, livres: [], palpites: [], identificada: null, revelada: null };
  p.segredos[id] = { ficha: n, registo };
  delete p.cartas[id];
}

/** Modo Escolha: três cartas para escolher. Quem entra a meio recebe-as logo, se a reserva chegar. */
export function oferecerCartas(sala, id, ctx, prazo = null) {
  const p = sala.partida;
  if (p.cartas[id] || p.segredos[id]) return false;
  if (p.reserva.length < REGRAS.cartas) return false;
  p.cartas[id] = { ids: tirarDaReserva(sala, REGRAS.cartas, ctx), escolhida: null, prazo };
  return true;
}

/** Os resumos das cartas (só para quem as recebeu). */
export function resumoCarta(reg) {
  const clubes = [...reg.carreira].sort((a, b) => (b.jogos ?? 0) - (a.jogos ?? 0)).slice(0, 3).map((c) => c.nome);
  return { id: reg.id, nome: reg.nome, dica: reg.dica, foto: reg.perfil?.foto ?? null, posicao: reg.posicao, nacionalidades: reg.nacionalidades, clubes };
}

/** Escolha de uma carta (no início, ou por quem entrou a meio e está a ver). */
export function escolherCarta(sala, id, regId, ctx) {
  const p = sala.partida;
  const c = p?.cartas[id];
  if (sala.fase !== 'jogo' || !c) return erro('Não tens cartas para escolher.');
  if (!c.ids.includes(regId)) return erro('Essa carta não é tua.');
  c.escolhida = regId;
  if (p.fase === 'escolha') {
    atribuir(sala, id, regId);
    noFeed(sala, { tipo: 'escolheu', jogador: id });
    avancar(sala, ctx); // quando toda a gente escolher, começa logo
  }
  return { ok: true };
}

/** Quem entrou a meio e está a ver passa a jogar no início da ronda, com o jogador que escolheu ou um ao calhas. */
function promover(sala, ctx) {
  const p = sala.partida;
  for (const j of sala.jogadores) {
    if (!j.espectador || j.saiu || emJogo(sala).length >= REGRAS.maxJogadores) continue;
    const c = p.cartas[j.id];
    const registo = c ? c.escolhida ?? c.ids[Math.floor(ctx.aleatorio() * c.ids.length)] : tirarDaReserva(sala, 1, ctx)[0];
    if (!registo) continue; // reserva vazia: fica a ver até o DO a repor
    j.espectador = false;
    atribuir(sala, j.id, registo);
    noFeed(sala, { tipo: 'promovido', jogador: j.id });
  }
}

/** Revela o jogador secreto de uma ficha (identificado, quem saiu, ou no fim). */
function revelar(sala, id, ctx) {
  const f = fichaDe(sala, id);
  if (!f || f.revelada) return;
  const reg = ctx.registos.get(sala.partida.segredos[id].registo);
  if (reg) f.revelada = revelavel(reg);
}
/** O que se mostra de um jogador revelado: o registo sem o que só serve ao pipeline. */
export function revelavel(reg) {
  const { fama, fontes, factos, aliases, ...resto } = reg;
  return { ...resto, wikipedia: fontes?.wikipedia ?? null };
}

// ---------------------------------------------------------------------------
// Início, rondas e vezes
// ---------------------------------------------------------------------------

/**
 * Começa a partida com os registos sorteados (`reserva`: ids; os registos estão em ctx.registos). No modo
 * Aleatório cada um recebe logo o seu; no Escolha toda a gente escolhe ao mesmo tempo.
 */
export function iniciarPartida(sala, ctx, reserva) {
  const { agora } = ctx;
  const cfg = sala.config;
  sala.partida = {
    inicio: agora,
    ronda: 1,
    cicloInicio: 1,
    conjunto: null,
    fase: 'escolha',
    alvos: {},
    fila: [],
    seqVez: 0,
    vez: null,
    livre: null,
    identificado: null,
    escolha: null,
    congelada: null,
    fichas: {},
    proximaFicha: 1,
    segredos: {},
    cartas: {},
    reserva: [...reserva],
    joker: { ronda: joker.RONDA_JOKER.de + Math.floor(ctx.aleatorio() * (joker.RONDA_JOKER.ate - joker.RONDA_JOKER.de + 1)), feita: false },
  };
  const p = sala.partida;
  const jogam = sala.jogadores.filter((j) => !j.espectador);
  if (cfg.modo === 'escolha') {
    p.escolha = { prazo: agora + REGRAS.escolhaMs };
    for (const j of jogam) oferecerCartas(sala, j.id, ctx, p.escolha.prazo);
    noFeed(sala, { tipo: 'escolha' });
  } else {
    for (const j of jogam) {
      const [registo] = tirarDaReserva(sala, 1, ctx);
      if (registo) atribuir(sala, j.id, registo);
    }
    iniciarRonda(sala, ctx);
  }
}

function iniciarRonda(sala, ctx) {
  const p = sala.partida;
  // Quem saiu: a ficha fica até ao fim da ronda, depois é revelada e sai da rotação.
  for (const j of sala.jogadores) {
    if (j.saindo && !j.saiu) {
      j.saiu = true;
      if (p.segredos[j.id]) {
        revelar(sala, j.id, ctx);
        noFeed(sala, { tipo: 'saiu', jogador: j.id, ficha: p.segredos[j.id].ficha, nome: fichaDe(sala, j.id).revelada?.nome ?? null });
      }
    }
  }
  promover(sala, ctx);
  if (deveAcabar(sala)) return terminar(sala, ctx);
  for (const j of sala.jogadores) j.ronda = 0;
  // Quando muda quem é alvo, o ciclo recomeça: cada um volta a passar por todos.
  const conjunto = alvos(sala).map((j) => j.id).join(',');
  if (conjunto !== p.conjunto) {
    p.cicloInicio = p.ronda;
    p.conjunto = conjunto;
  }
  p.alvos = calcularAlvos(sala);
  p.fila = emJogo(sala).map((j) => j.id);
  p.fase = 'vez';
  p.vez = null;
  const n = alvos(sala).length;
  noFeed(sala, { tipo: 'ronda', numero: p.ronda, desvio: ((p.ronda - p.cicloInicio) % Math.max(1, n - 1)) + 1 });
  return iniciarVez(sala, ctx);
}

/** A vez seguinte desta ronda (salta quem está desligado há 10 s ou saiu); sem mais ninguém, fim da ronda. */
function iniciarVez(sala, ctx) {
  const p = sala.partida;
  p.vez = null;
  p.fase = 'vez';
  while (p.fila.length) {
    if (!algumLigado(sala)) {
      p.congelada = ctx.agora;
      return;
    }
    const id = p.fila[0];
    const j = jogador(sala, id);
    if (!j || j.saiu || j.saindo || !p.segredos[id]) {
      p.fila.shift();
      continue;
    }
    if (!j.ligado && ctx.agora - (j.desligadoEm ?? ctx.agora) >= REGRAS.desligadoSaltaMs) {
      p.fila.shift();
      noFeed(sala, { tipo: 'saltou', jogador: id });
      continue;
    }
    const alvo = alvoValido(sala, p.alvos[id], id) ? p.alvos[id] : substituto(sala, id, p.alvos[id]);
    p.fila.shift();
    if (!alvo) continue;
    p.seqVez += 1;
    const duracao = REGRAS.vezMs;
    p.vez = { seq: p.seqVez, jogador: id, alvo, ficha: p.segredos[alvo].ficha, inicio: ctx.agora, prazo: ctx.agora + duracao, duracao };
    if (!j.ligado) p.vez.prazo = Math.min(p.vez.prazo, j.desligadoEm + REGRAS.desligadoSaltaMs);
    return;
  }
  fimRonda(sala, ctx);
}

function fimRonda(sala, ctx) {
  const p = sala.partida;
  p.vez = null;
  if (deveAcabar(sala)) return terminar(sala, ctx);
  if (iniciarJoker(sala, ctx)) return undefined;
  return proximaRonda(sala, ctx);
}

function proximaRonda(sala, ctx) {
  const p = sala.partida;
  p.ronda += 1;
  return iniciarRonda(sala, ctx);
}

// ---------------------------------------------------------------------------
// Ronda Joker
// ---------------------------------------------------------------------------

/** Quem responde à Joker: os da partida, menos o dono da ficha. */
const respondentes = (sala, dono) => emJogo(sala).filter((j) => j.id !== dono && !j.saindo);

/**
 * No fim da ronda sorteada (ou da seguinte, se ninguém puder responder), começa a Joker: a ficha com menos "sim" e
 * uma pergunta numérica que ela ainda não tenha. Devolve true se começou.
 */
function iniciarJoker(sala, ctx) {
  const p = sala.partida;
  const j = p.joker;
  if (!j || j.feita || p.ronda < j.ronda) return false;
  for (const f of joker.ordenarFichas(alvos(sala).map((x) => fichaDe(sala, x.id)), ctx.aleatorio)) {
    const reg = ctx.registos.get(p.segredos[f.dono].registo);
    const pergunta = reg && joker.escolherPergunta(f, reg, ctx.aleatorio);
    if (!pergunta) continue;
    // Sem ninguém ligado para responder, fica para o fim da ronda seguinte.
    if (!respondentes(sala, f.dono).some((x) => x.ligado)) return false;
    const abre = ctx.agora + REGRAS.jokerAnuncioMs;
    Object.assign(j, { fase: 'joker', ficha: f.n, dono: f.dono, pergunta, valor: joker.PERGUNTAS_JOKER[pergunta].valor(reg), abre, prazo: abre + REGRAS.jokerMs, lances: {} });
    p.fase = 'joker';
    noFeed(sala, { tipo: 'joker', ficha: f.n, alvo: f.dono, pergunta });
    return true;
  }
  j.feita = true; // nenhuma ficha tem pergunta por revelar
  return false;
}

/** O palpite de um jogador na Joker: um número inteiro, definitivo e escondido até à revelação. */
export function lance(sala, id, { valor }, ctx) {
  const p = sala.partida;
  const j = p?.joker;
  if (sala.fase !== 'jogo' || p.fase !== 'joker') return erro('Não há Ronda Joker a decorrer.');
  if (!respondentes(sala, j.dono).some((x) => x.id === id)) return erro(id === j.dono ? 'É a tua ficha: não respondes a esta.' : 'Não respondes a esta Joker.');
  if (id in j.lances) return erro('Já deste o teu palpite.');
  if (!Number.isInteger(valor) || valor < 0 || valor > 9999) return erro('Escreve um número inteiro.');
  j.lances[id] = valor;
  avancar(sala, ctx); // se toda a gente já respondeu, revela-se já
  return { ok: true };
}

function revelarJoker(sala, ctx) {
  const p = sala.partida;
  const j = p.joker;
  const r = joker.pontuar(j.valor, j.lances);
  const pontos = {};
  for (const [id, n] of Object.entries(r.pontos)) pontos[id] = n ? dar(sala, id, n) : 0;
  pontos[j.dono] = r.dono ? dar(sala, j.dono, r.dono) : 0;
  const f = p.fichas[j.ficha];
  f.valores = { ...(f.valores ?? {}), [j.pergunta]: j.valor };
  Object.assign(j, { fase: 'revelacao', pontos, exatos: r.exatos, perto: r.perto, prazo: ctx.agora + REGRAS.jokerRevelacaoMs });
  p.fase = 'revelacao';
  noFeed(sala, { tipo: 'joker_valor', ficha: j.ficha, alvo: j.dono, pergunta: j.pergunta, valor: j.valor, pontos });
}


/** Acaba quando todos os jogadores secretos forem identificados (ou já não houver quem jogue). Não há limite de rondas. */
function deveAcabar(sala) {
  return alvos(sala).length === 0 || emJogo(sala).length < 2;
}

function terminar(sala, ctx) {
  const p = sala.partida;
  for (const id of Object.keys(p.segredos)) revelar(sala, id, ctx);
  for (const c of Object.values(p.cartas)) c.prazo = null;
  p.fase = 'final';
  p.vez = null;
  p.livre = null;
  p.identificado = null;
  sala.fase = 'final';
  noFeed(sala, { tipo: 'final' });
}

function terminarVez(sala, ctx) {
  sala.partida.vez = null;
  iniciarVez(sala, ctx);
}

// ---------------------------------------------------------------------------
// Ações da vez
// ---------------------------------------------------------------------------

function validarVez(sala, id, seq) {
  const p = sala.partida;
  if (sala.fase !== 'jogo' || !p) return erro('Não há partida a decorrer.');
  if (p.fase !== 'vez' || !p.vez) return erro('Agora não é altura de perguntar.', { antiga: true });
  if (p.vez.jogador !== id) return erro('Não é a tua vez.', { antiga: true });
  if (seq !== p.vez.seq) return erro('Essa vez já passou.', { antiga: true });
  return { vez: p.vez, ficha: p.fichas[p.vez.ficha] };
}

function dar(sala, id, pontos) {
  const j = jogador(sala, id);
  const n = P.comFator(pontos, Boolean(j.identificado));
  j.total += n;
  j.ronda = (j.ronda ?? 0) + n;
  return n;
}

/** Pergunta da lista: o jogo responde já. SEM REGISTO não gasta a vez. */
export function perguntar(sala, id, { vez, chave }, ctx) {
  const v = validarVez(sala, id, vez);
  if (v.erro) return v;
  if (!P.valida(chave, ctx.catalogo)) return erro('Essa pergunta não existe.');
  const estado = P.avaliar(v.ficha, chave, ctx.catalogo);
  if (estado.estado !== 'aberta') {
    return erro(estado.estado === 'bloqueada' ? 'Essa pergunta ainda não está aberta nesta ficha.' : 'Essa pergunta já está decidida nesta ficha.');
  }
  const reg = ctx.registos.get(sala.partida.segredos[v.vez.alvo].registo);
  if (!reg) return erro('O jogador desta ficha ainda não chegou. Tenta daqui a um segundo.');
  const r = P.responder(reg, chave);
  v.ficha.respostas[chave] = { r, autor: id, ronda: sala.partida.ronda };
  // Com todos os países (ou clubes) encontrados, os que faltam ficam "não" e o campo sai do menu.
  v.ficha.completos = P.completos(reg, v.ficha);
  if (r === 'sem_registo') {
    v.vez.prazo = Math.max(v.vez.prazo, ctx.agora + REGRAS.vezMinimaMs);
    noFeed(sala, { tipo: 'pergunta', jogador: id, ficha: v.ficha.n, alvo: v.vez.alvo, chave, r, pontos: 0 });
    return { ok: true, r };
  }
  const pontos = r === 'sim' ? dar(sala, id, P.pontos(chave)) : 0;
  noFeed(sala, { tipo: 'pergunta', jogador: id, ficha: v.ficha.n, alvo: v.vez.alvo, chave, r, pontos });
  terminarVez(sala, ctx);
  return { ok: true, r };
}

/** Pergunta livre: o relógio da vez para e o dono do alvo responde Sim / Não / Não sei em 30 s. */
export function perguntaLivre(sala, id, { vez, texto }, ctx) {
  const v = validarVez(sala, id, vez);
  if (v.erro) return v;
  const t = limparTexto(texto, REGRAS.livreMax);
  if (!t) return erro('Escreve a pergunta livre.');
  const dono = jogador(sala, v.vez.alvo);
  if (!dono?.ligado) return erro(`${dono?.nome ?? 'O dono da ficha'} não está ligado: escolhe uma pergunta da lista.`);
  const p = sala.partida;
  p.livre = { autor: id, alvo: v.vez.alvo, ficha: v.ficha.n, texto: t, prazo: ctx.agora + REGRAS.livreMs, restante: Math.max(0, v.vez.prazo - ctx.agora) };
  p.fase = 'livre';
  noFeed(sala, { tipo: 'livre', jogador: id, alvo: v.vez.alvo, ficha: v.ficha.n, texto: t });
  return { ok: true };
}

export function responderLivre(sala, id, { resposta }, ctx) {
  const p = sala.partida;
  if (sala.fase !== 'jogo' || p?.fase !== 'livre' || !p.livre) return erro('Não há pergunta livre por responder.');
  if (p.livre.alvo !== id) return erro('Só o dono da ficha responde.');
  if (!['sim', 'nao', 'nao_sei'].includes(resposta)) return erro('Resposta inválida.');
  const l = p.livre;
  p.fichas[l.ficha].livres.push({ texto: l.texto, r: resposta, autor: l.autor, ronda: p.ronda });
  const pontos = resposta === 'sim' ? dar(sala, l.autor, P.PONTOS.livre) : 0;
  noFeed(sala, { tipo: 'livre_resposta', jogador: l.autor, alvo: id, ficha: l.ficha, texto: l.texto, r: resposta, pontos });
  p.livre = null;
  terminarVez(sala, ctx);
  return { ok: true };
}

/** O dono não respondeu a tempo (ou desligou-se): a pergunta cai e quem perguntou recupera a vez. */
function cancelarLivre(sala, ctx) {
  const p = sala.partida;
  const l = p.livre;
  p.livre = null;
  p.fase = 'vez';
  if (p.vez) p.vez.prazo = ctx.agora + Math.max(l.restante, REGRAS.vezMinimaMs);
  noFeed(sala, { tipo: 'livre_cancelada', jogador: l.autor, alvo: l.alvo, ficha: l.ficha });
}

/**
 * Palpite final a uma ficha (qualquer uma com o palpite desbloqueado, menos a própria). Certo: 30 pontos e a
 * ficha fica identificada. Errado: o nome fica nas informações descartadas e a vez passa.
 */
export function palpitar(sala, id, { vez, ficha: n, jogador: regId, nome }, ctx) {
  const v = validarVez(sala, id, vez);
  if (v.erro) return v;
  const p = sala.partida;
  const f = p.fichas[n];
  if (!f || f.identificada || f.revelada) return erro('Essa ficha já não está em jogo.');
  if (f.dono === id) return erro('Não podes dar palpites à tua própria ficha.');
  if (!alvos(sala).some((j) => j.id === f.dono)) return erro('Essa ficha já não está em jogo.');
  if (!P.palpiteDesbloqueado(f)) return erro('Esta ficha ainda não tem o palpite final desbloqueado.');
  if (typeof regId !== 'string' || !/^Q\d{1,12}$/.test(regId)) return erro('Escolhe um jogador da lista.');
  if (f.palpites.some((x) => x.id === regId)) return erro('Esse jogador já foi descartado nesta ficha.');
  const certo = p.segredos[f.dono].registo === regId;
  const mostrar = limparTexto(nome, REGRAS.palpiteNomeMax) || regId;
  if (!certo) {
    f.palpites.push({ id: regId, nome: mostrar, autor: id, ronda: p.ronda });
    noFeed(sala, { tipo: 'palpite', jogador: id, ficha: n, alvo: f.dono, nome: mostrar, certo: false, pontos: 0 });
    terminarVez(sala, ctx);
    return { ok: true, certo: false };
  }
  const pontos = dar(sala, id, P.PONTOS.palpite);
  f.identificada = { por: id, ronda: p.ronda };
  revelar(sala, f.dono, ctx);
  jogador(sala, f.dono).identificado = true;
  noFeed(sala, { tipo: 'identificado', jogador: id, ficha: n, alvo: f.dono, nome: f.revelada?.nome ?? mostrar, pontos });
  p.vez = null;
  p.fase = 'identificado';
  p.identificado = { ficha: n, por: id, prazo: ctx.agora + REGRAS.identificadoMs };
  return { ok: true, certo: true };
}

/** Sair da sala a meio: a vez dele acaba já; a ficha fica até ao fim da ronda e depois é revelada. */
export function sairDaPartida(sala, id, ctx) {
  const p = sala.partida;
  const j = jogador(sala, id);
  if (!p || !j || j.saiu) return false;
  if (j.espectador) {
    j.saiu = true;
    delete p.cartas[id];
    return true;
  }
  if (j.saindo) return false;
  j.saindo = true;
  noFeed(sala, { tipo: 'saindo', jogador: id });
  return true;
}

// ---------------------------------------------------------------------------
// Tempo: prazos, desligados, congelar
// ---------------------------------------------------------------------------

/** Sem ninguém da partida ligado, os prazos param; quando alguém volta, continuam de onde estavam. */
export function congelarSeVazia(sala, agora) {
  const p = sala.partida;
  if (sala.fase !== 'jogo' || !p || p.congelada || algumLigado(sala)) return false;
  p.congelada = agora;
  return true;
}

export function descongelar(sala, ctx) {
  const p = sala.partida;
  if (sala.fase !== 'jogo' || !p?.congelada || !algumLigado(sala)) return false;
  const d = ctx.agora - p.congelada;
  p.congelada = null;
  for (const o of [p.vez, p.livre, p.identificado, p.escolha, p.joker]) if (o?.prazo != null) o.prazo += d;
  if (p.joker?.abre != null) p.joker.abre += d;
  for (const c of Object.values(p.cartas)) if (c.prazo != null) c.prazo += d;
  // O tempo da pausa não conta para quem continua desligado (nem para saltar a vez, nem para sair de vez).
  for (const j of sala.jogadores) if (!j.ligado && j.desligadoEm != null) j.desligadoEm += d;
  avancar(sala, ctx);
  return true;
}

/** Um passo do relógio. Devolve true se mudou alguma coisa. */
function passo(sala, ctx) {
  const p = sala.partida;
  const { agora } = ctx;
  for (const j of emJogo(sala)) {
    if (!j.ligado && !j.saindo && agora - (j.desligadoEm ?? agora) >= REGRAS.saidaDefinitivaMs) {
      j.saindo = true;
      noFeed(sala, { tipo: 'saindo', jogador: j.id, desligado: true });
      return true;
    }
  }
  switch (p.fase) {
    case 'escolha': {
      const jogam = sala.jogadores.filter((j) => !j.espectador && !j.saiu);
      if (agora < p.escolha.prazo && !jogam.every((j) => p.segredos[j.id])) return false;
      for (const j of jogam) {
        if (p.segredos[j.id]) continue;
        const c = p.cartas[j.id];
        const registo = c?.ids[Math.floor(ctx.aleatorio() * c.ids.length)] ?? tirarDaReserva(sala, 1, ctx)[0];
        if (registo) atribuir(sala, j.id, registo);
      }
      p.escolha = null;
      iniciarRonda(sala, ctx);
      return true;
    }
    case 'vez': {
      if (!p.vez) {
        iniciarVez(sala, ctx);
        return true;
      }
      const j = jogador(sala, p.vez.jogador);
      if (!j || j.saindo || j.saiu) {
        terminarVez(sala, ctx);
        return true;
      }
      if (!j.ligado && j.desligadoEm + REGRAS.desligadoSaltaMs < p.vez.prazo) p.vez.prazo = j.desligadoEm + REGRAS.desligadoSaltaMs;
      if (agora >= p.vez.prazo) {
        noFeed(sala, { tipo: 'tempo', jogador: p.vez.jogador, alvo: p.vez.alvo, ficha: p.vez.ficha });
        terminarVez(sala, ctx);
        return true;
      }
      return false;
    }
    case 'livre': {
      const dono = jogador(sala, p.livre.alvo);
      if (agora >= p.livre.prazo || !dono?.ligado || dono.saindo || dono.saiu) {
        cancelarLivre(sala, ctx);
        return true;
      }
      return false;
    }
    case 'joker': {
      const j = p.joker;
      const ligados = respondentes(sala, j.dono).filter((x) => x.ligado);
      if (agora < j.prazo && !ligados.every((x) => x.id in j.lances)) return false;
      revelarJoker(sala, ctx);
      return true;
    }
    case 'revelacao':
      if (agora < p.joker.prazo) return false;
      Object.assign(p.joker, { fase: null, feita: true });
      if (deveAcabar(sala)) terminar(sala, ctx);
      else proximaRonda(sala, ctx);
      return true;
    case 'identificado':
      if (agora < p.identificado.prazo) return false;
      p.identificado = null;
      if (deveAcabar(sala)) terminar(sala, ctx);
      else terminarVez(sala, ctx);
      return true;
    default:
      return false;
  }
}

/** Avança a partida até `ctx.agora`. Um prazo que acaba pode tornar o seguinte devido logo; daí o ciclo. */
export function avancar(sala, ctx) {
  const p = sala.partida;
  if (sala.fase !== 'jogo' || !p || p.congelada) return false;
  let mudou = false;
  for (let i = 0; i < 4 * REGRAS.maxJogadores + 10 && sala.fase === 'jogo' && !p.congelada; i++) {
    if (!passo(sala, ctx)) break;
    mudou = true;
  }
  return mudou;
}

/** O próximo instante em que a partida precisa de acordar. */
export function proximoPrazo(sala) {
  const p = sala.partida;
  if (sala.fase !== 'jogo' || !p || p.congelada) return null;
  const prazos = [];
  if (p.fase === 'escolha') prazos.push(p.escolha?.prazo);
  if (p.fase === 'vez') {
    if (p.vez) {
      prazos.push(p.vez.prazo);
      const j = jogador(sala, p.vez.jogador);
      if (j && !j.ligado) prazos.push(j.desligadoEm + REGRAS.desligadoSaltaMs);
    } else {
      prazos.push(0);
    }
  }
  if (p.fase === 'livre') prazos.push(p.livre?.prazo);
  if (p.fase === 'identificado') prazos.push(p.identificado?.prazo);
  if (p.fase === 'joker' || p.fase === 'revelacao') prazos.push(p.joker?.prazo);
  for (const j of emJogo(sala)) if (!j.ligado && !j.saindo && j.desligadoEm != null) prazos.push(j.desligadoEm + REGRAS.saidaDefinitivaMs);
  const validos = prazos.filter((t) => typeof t === 'number');
  return validos.length ? Math.min(...validos) : null;
}

/** Quantos registos faltam na reserva (para quem está a ver e vai entrar na ronda seguinte). */
export function faltamNaReserva(sala) {
  const p = sala.partida;
  if (sala.fase !== 'jogo' || !p) return 0;
  const porJogador = sala.config.modo === 'escolha' ? REGRAS.cartas : 1;
  const espera = sala.jogadores.filter((j) => j.espectador && !j.saiu && !p.cartas[j.id]).length;
  return Math.max(0, espera * porJogador + REGRAS.folgaReserva - p.reserva.length);
}
