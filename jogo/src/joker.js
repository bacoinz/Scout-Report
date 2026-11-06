// Ronda Joker: uma vez por partida, no fim de uma ronda ao calhas entre a 14.ª e a 17.ª. Pergunta-se um número sobre
// o jogador secreto com menos "sim" e todos menos o dono dão um palpite em 15 s. Puro: só as escolhas e as contas;
// as fases ficam em partida.js.
import * as P from '../public/js/comum/perguntas.js';

/** Ronda mais cedo e mais tarde em que a Joker pode calhar. */
export const RONDA_JOKER = { de: 14, ate: 17 };

/**
 * As perguntas da Joker: números com os dados completos no registo. As de treinador só quando a ficha já tem
 * "é ou foi treinador" ✓ (senão a pergunta revelava-o).
 */
export const PERGUNTAS_JOKER = {
  jogos: { texto: 'Quantos jogos fez na carreira (clubes e seleção)?', curto: 'Jogos', valor: (reg) => reg.totais.jogos },
  golos: { texto: 'Quantos golos marcou na carreira (clubes e seleção)?', curto: 'Golos', valor: (reg) => reg.totais.golos },
  inter: { texto: 'Quantas internacionalizações tem?', curto: 'Seleção', valor: (reg) => reg.totais.internacionalizacoes },
  golos_selecao: { texto: 'Quantos golos marcou pela seleção?', curto: 'Golos sel.', valor: (reg) => reg.totais.golos_selecao },
  estreia: { texto: 'Em que ano se estreou como sénior?', curto: 'Estreia', valor: (reg) => reg.estreia },
  clubes: { texto: 'Por quantos clubes passou como sénior (contam os empréstimos)?', curto: 'Clubes', valor: (reg) => reg.totais.clubes },
  t_titulos: {
    texto: 'Quantos títulos ganhou como treinador?', curto: 'Títulos (treinador)', treinador: true,
    valor: (reg) => (reg.treinador ? reg.treinador.n_titulos ?? 0 : null),
  },
  t_equipas: {
    texto: 'Quantas equipas treinou (clubes e seleções)?', curto: 'Equipas treinadas', treinador: true,
    valor: (reg) => (reg.treinador ? new Set(reg.treinador.equipas.map((e) => e.equipa ?? `sel:${e.pais}`)).size : null),
  },
};

/** A ficha da Joker: a que tem menos "sim" (empates ao calhas). `fichas`: as que ainda estão por identificar. */
export function ordenarFichas(fichas, aleatorio = Math.random) {
  return fichas
    .map((f) => ({ f, sim: P.contarSim(f), sorte: aleatorio() }))
    .sort((a, b) => a.sim - b.sim || a.sorte - b.sorte)
    .map((x) => x.f);
}

/** Uma pergunta ao calhas que ainda não foi revelada nesta ficha e que o registo sabe responder. */
export function escolherPergunta(ficha, reg, aleatorio = Math.random) {
  const valores = ficha.valores ?? {};
  const treinador = P.valor(ficha, 'treinador') === 'sim';
  const possiveis = Object.entries(PERGUNTAS_JOKER)
    .filter(([id, q]) => !(id in valores) && (!q.treinador || treinador) && Number.isInteger(q.valor(reg)))
    .map(([id]) => id);
  return possiveis.length ? possiveis[Math.floor(aleatorio() * possiveis.length)] : null;
}

/**
 * Os pontos (antes da metade de quem já foi identificado): exato 15; sem nenhum exato, o(s) mais perto sem passar 9;
 * passou ou não respondeu 0. O dono: 0 se alguém acertou, 3 se alguém ficou perto, 9 se toda a gente passou (ou
 * ninguém respondeu). `lances`: {jogador: número}.
 */
export function pontuar(valor, lances) {
  const J = P.PONTOS.joker;
  const pontos = {};
  const entradas = Object.entries(lances);
  const exatos = entradas.filter(([, n]) => n === valor).map(([id]) => id);
  const abaixo = entradas.filter(([, n]) => n <= valor);
  const melhor = abaixo.length ? Math.max(...abaixo.map(([, n]) => n)) : null;
  for (const [id, n] of entradas) {
    if (exatos.length) pontos[id] = n === valor ? J.exato : J.passou;
    else pontos[id] = melhor != null && n === melhor ? J.perto : J.passou;
  }
  const dono = exatos.length ? J.dono_exato : abaixo.length ? J.dono_perto : J.dono_todos_passam;
  return { pontos, dono, exatos, perto: exatos.length ? [] : abaixo.filter(([, n]) => n === melhor).map(([id]) => id) };
}
