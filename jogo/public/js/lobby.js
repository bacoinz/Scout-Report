// Lobby: código da sala, jogadores e opções do anfitrião (modo, jogadores da base, fim, tempo por vez).
import { $, el, plural } from './util.js';

const MODOS = [
  { id: 'aleatorio', nome: 'Aleatório', ajuda: 'um ao calhas' },
  { id: 'escolha', nome: 'Escolha', ajuda: '1 de 3 cartas' },
];
const GRUPOS = [
  { id: 'conhecidos', nome: 'Conhecidos' },
  { id: 'todos', nome: 'Todos' },
];
const FIM = { rondas: [4, 6, 8, 10], minutos: [15, 20, 30, 45] };
const VEZES = [30, 45, 60, 90];

export const chipJogador = (j, sala) =>
  el('li', { class: `chip-jogador${j.ligado ? '' : ' desligado'}` },
    el('span', { class: 'ponto', style: { background: j.cor } }),
    j.nome,
    j.id === sala.anfitriao ? el('span', { class: 'coroa', title: 'Anfitrião', text: '👑' }) : null);

function segmentos(alvo, opcoes, atual, anfitriao, aoEscolher) {
  alvo.replaceChildren(...opcoes.map((o) =>
    el('button', {
      class: 'segmento', type: 'button', role: 'radio', 'aria-checked': String(atual === o.id), disabled: !anfitriao,
      onclick: () => aoEscolher(o.id),
    }, o.nome, o.ajuda ? el('small', { text: o.ajuda }) : null)));
}

export function renderLobby(sala, eu, enviar) {
  const anfitriao = sala.anfitriao === eu;
  const c = sala.config;
  const jogam = sala.jogadores.filter((j) => !j.saiu);
  $('#lobby-codigo').textContent = sala.codigo;
  $('#lobby-contagem').textContent = `${jogam.length}/8`;
  $('#lobby-jogadores').replaceChildren(...jogam.map((j) => chipJogador(j, sala)));
  segmentos($('#cfg-modo'), MODOS, c.modo, anfitriao, (modo) => enviar({ t: 'config', modo }));
  segmentos($('#cfg-jogadores'), GRUPOS.map((g) => ({ ...g, ajuda: g.id === c.jogadores && sala.disponiveis != null ? plural(sala.disponiveis, 'jogador', 'jogadores') : null })),
    c.jogadores, anfitriao, (jogadores) => enviar({ t: 'config', jogadores }));
  segmentos($('#cfg-fim-tipo'), [{ id: 'rondas', nome: 'Por rondas' }, { id: 'minutos', nome: 'Por tempo' }], c.fim.tipo, anfitriao,
    (tipo) => enviar({ t: 'config', fim: { tipo, n: tipo === c.fim.tipo ? c.fim.n : tipo === 'rondas' ? 6 : 20 } }));
  segmentos($('#cfg-fim'), FIM[c.fim.tipo].map((n) => ({ id: n, nome: c.fim.tipo === 'rondas' ? `${n}` : `${n} min` })), c.fim.n, anfitriao,
    (n) => enviar({ t: 'config', fim: { tipo: c.fim.tipo, n } }));
  segmentos($('#cfg-vez'), VEZES.map((s) => ({ id: s, nome: `${s} s` })), c.vez, anfitriao, (vez) => enviar({ t: 'config', vez }));

  // Uma ronda: cada um tem uma vez; quem pergunta da lista costuma gastar um terço do tempo.
  const n = Math.max(2, jogam.length);
  const ronda = Math.round((n * c.vez * 0.6) / 60 * 2) / 2;
  const disponiveis = sala.disponiveis ?? 0;
  const precisos = c.modo === 'escolha' ? n * 3 : n;
  $('#cfg-resumo').textContent = disponiveis < precisos
    ? 'Não há jogadores suficientes na base com estas opções: repõe os já usados ou escolhe "Todos".'
    : `Com ${plural(n, 'jogador', 'jogadores')}, uma ronda dura em média ${String(ronda).replace('.', ',')} min (no máximo ${Math.ceil((n * c.vez) / 60)} min).`;
  const ligados = jogam.filter((j) => j.ligado).length;
  $('#btn-comecar').hidden = !anfitriao;
  $('#btn-comecar').disabled = ligados < 2 || disponiveis < precisos;
  $('#btn-comecar').textContent = ligados < 2 ? 'À espera de mais jogadores' : 'Começar';
  $('#btn-repor').hidden = !anfitriao || disponiveis >= precisos;
  $('#lobby-espera').hidden = anfitriao;
}
