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

  // Uma ronda: cada um tem uma vez de 1 minuto. A partida acaba quando todos forem identificados.
  const n = Math.max(2, jogam.length);
  const disponiveis = sala.disponiveis ?? 0;
  const precisos = c.modo === 'escolha' ? n * 3 : n;
  $('#cfg-resumo').textContent = disponiveis < precisos
    ? 'Não há jogadores suficientes na base com estas opções: repõe os já usados ou escolhe "Todos".'
    : `1 minuto por vez: com ${plural(n, 'jogador', 'jogadores')}, cada ronda dura no máximo ${n} min. A partida acaba quando todos os jogadores secretos forem identificados.`;
  const ligados = jogam.filter((j) => j.ligado).length;
  $('#btn-comecar').hidden = !anfitriao;
  $('#btn-comecar').disabled = ligados < 2 || disponiveis < precisos;
  $('#btn-comecar').textContent = ligados < 2 ? 'À espera de mais jogadores' : 'Começar';
  $('#btn-repor').hidden = !anfitriao || disponiveis >= precisos;
  $('#lobby-espera').hidden = anfitriao;
}
