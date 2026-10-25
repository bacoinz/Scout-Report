// O resultado do Desafio do Dia, para copiar para o Discord. Sem DOM (testado em test/resumo.test.js).
//   Scout Report — Relatório #42
//   🟩🟥🟩🟩🟥🟩🟩🟩🟪
//   9 perguntas

export const EMOJIS = { sim: '🟩', nao: '🟥', errado: '⬛', certo: '🟪' };
const POR_LINHA = 10;

/**
 * Um quadrado por pergunta e por palpite, pela ordem: sim, não, palpite errado e, no fim, o palpite certo. As
 * perguntas sem registo não contam (como no jogo, não gastam a vez). `passos`: [{ chave, r } | { palpite, nome }];
 * `fim`: null, { certo: true } ou { desistiu: true }.
 */
export function quadrados(passos, fim = null) {
  const q = passos.flatMap((p) => (p.palpite ? ['errado'] : p.r === 'sim' || p.r === 'nao' ? [p.r] : []));
  if (fim?.certo) q.push('certo');
  return q;
}

export const textoPerguntas = (n) => `${n} ${n === 1 ? 'pergunta' : 'perguntas'}`;

/** O texto para copiar: o título, os quadrados em linhas de 10 (🏳️ no fim de quem desistiu) e quantas perguntas. */
export function textoResumo(numero, passos, fim = null) {
  const q = quadrados(passos, fim).map((x) => EMOJIS[x]);
  if (fim?.desistiu) q.push('🏳️');
  const linhas = [];
  for (let i = 0; i < q.length; i += POR_LINHA) linhas.push(q.slice(i, i + POR_LINHA).join(''));
  const n = quadrados(passos, fim).length;
  return [`Scout Report — Relatório #${numero}`, ...linhas, fim?.desistiu ? `Desisti ao fim de ${textoPerguntas(n)}` : textoPerguntas(n)].join('\n');
}
