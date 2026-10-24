// O que cada socket recebe: o estado público da sala (igual para todos) e a parte privada de cada jogador (o
// dossier do seu jogador secreto e as cartas para escolher). Nenhum id ou nome de jogador secreto por identificar
// sai daqui fora do `eu` do próprio dono (test/vista.test.js verifica-o).
import { resumoCarta } from './partida.js';

const publicoJogador = (j, sala) => ({
  id: j.id,
  nome: j.nome,
  cor: j.cor,
  total: j.total,
  ronda: j.ronda ?? 0,
  ligado: j.ligado,
  espectador: Boolean(j.espectador),
  identificado: Boolean(j.identificado),
  saindo: Boolean(j.saindo),
  saiu: Boolean(j.saiu),
  ficha: sala.partida?.segredos[j.id]?.ficha ?? null,
  escolheu: sala.partida?.fase === 'escolha' ? Boolean(sala.partida.segredos[j.id]) : undefined,
});

/** Uma ficha como os outros a veem: as respostas, as notas e os palpites; o jogador só depois de revelado. */
const publicoFicha = (f) => ({
  n: f.n,
  dono: f.dono,
  respostas: f.respostas,
  livres: f.livres,
  palpites: f.palpites.map(({ nome, autor, ronda }) => ({ nome, autor, ronda })),
  identificada: f.identificada,
  revelada: f.revelada,
});

function publicoPartida(sala) {
  const p = sala.partida;
  if (!p) return null;
  return {
    ronda: p.ronda,
    totalRondas: p.totalRondas,
    inicio: p.inicio,
    fimEm: p.fimEm,
    fase: p.fase,
    congelada: p.congelada,
    alvos: p.alvos,
    fila: p.fila,
    vez: p.vez ? { seq: p.vez.seq, jogador: p.vez.jogador, alvo: p.vez.alvo, ficha: p.vez.ficha, prazo: p.vez.prazo, duracao: p.vez.duracao } : null,
    livre: p.livre ? { autor: p.livre.autor, alvo: p.livre.alvo, ficha: p.livre.ficha, texto: p.livre.texto, prazo: p.livre.prazo } : null,
    identificado: p.identificado,
    escolha: p.escolha,
    fichas: Object.values(p.fichas).map(publicoFicha),
  };
}

export function estadoPublico(sala, agora) {
  return {
    codigo: sala.codigo,
    fase: sala.fase,
    anfitriao: sala.anfitriao,
    config: sala.config,
    disponiveis: sala.disponiveis,
    jogadores: sala.jogadores.map((j) => publicoJogador(j, sala)),
    partida: publicoPartida(sala),
    feed: sala.feed,
    agora,
  };
}

/** A parte de cada um: o dossier do seu jogador secreto e as cartas (modo Escolha). */
export function privado(sala, jogadorId, registos) {
  const p = sala.partida;
  if (!p) return { id: jogadorId, dossier: null, cartas: null };
  const s = p.segredos[jogadorId];
  const c = p.cartas[jogadorId];
  return {
    id: jogadorId,
    dossier: s ? registos.get(s.registo) ?? null : null,
    cartas: c ? { ids: c.ids, escolhida: c.escolhida, prazo: c.prazo, resumos: c.ids.map((id) => registos.get(id)).filter(Boolean).map(resumoCarta) } : null,
  };
}
