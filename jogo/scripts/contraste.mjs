// Verifica os contrastes WCAG dos tokens do tema (lidos de tema.css e relatorio.css).
// Texto normal pede 4,5:1; texto grande (≥ 24 px, ou ≥ 18,7 px a negrito) e elementos de interface pedem 3:1.
// Sai com código 1 se algum par ficar abaixo do mínimo: corre-se depois de mudar uma cor (npm run contraste).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'css');
const texto = ['tema.css', 'relatorio.css'].map((f) => readFileSync(join(css, f), 'utf8')).join('\n');
const tokens = Object.fromEntries([...texto.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2]]));

const cor = (nome) => (nome.startsWith('#') ? nome : tokens[nome]) ?? (() => { throw new Error(`token em falta: --${nome}`); })();
const linear = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminancia = (hex) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return 0.2126 * linear(n >> 16) + 0.7152 * linear((n >> 8) & 255) + 0.0722 * linear(n & 255);
};
const contraste = (a, b) => {
  const [x, y] = [luminancia(cor(a)), luminancia(cor(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const PAINEL = '#0c2016'; // --panel sem a transparência, sobre o fundo
const BRANCO = '#ffffff';
const pares = [
  // [frente, fundo, mínimo, uso]
  ['text', 'bg', 4.5, 'texto normal'],
  ['muted', 'bg', 4.5, 'texto secundário'],
  ['muted', PAINEL, 4.5, 'texto secundário nos painéis'],
  ['destaque', 'bg', 3, 'títulos, números grandes, bordas e anéis'],
  ['destaque-2', 'bg', 4.5, 'texto pequeno em destaque'],
  ['destaque-2', PAINEL, 4.5, 'texto pequeno em destaque nos painéis'],
  [BRANCO, 'destaque', 3, 'botão principal (topo do gradiente, texto a 800)'],
  [BRANCO, 'destaque-escuro', 4.5, 'botão principal (fundo do gradiente)'],
  ['tinta', 'papel', 7, 'dados à máquina nas fichas'],
  ['tinta-suave', 'papel', 4.5, 'rótulos e deduções nas fichas'],
  ['caneta', 'papel', 4.5, 'notas à mão'],
  ['carimbo-verde', 'papel', 4.5, 'CONFIRMADO'],
  ['carimbo-vermelho', 'papel', 4.5, 'DESCARTADO'],
  ['carimbo-roxo', 'papel', 4.5, 'IDENTIFICADO, Joker, palpite'],
  ['carimbo-cinza', 'papel', 4.5, 'SEM REGISTO'],
  ['tinta', 'cartolina', 4.5, 'texto na pasta do dossier'],
  ['carimbo-vermelho-escuro', 'cartolina', 4.5, 'SÓ PARA OS TEUS OLHOS'],
];

let falhas = 0;
console.log('Par'.padEnd(46), 'Contraste', ' Mínimo', ' Uso');
for (const [frente, fundo, minimo, uso] of pares) {
  const r = contraste(frente, fundo);
  const ok = r >= minimo;
  if (!ok) falhas++;
  console.log(`${ok ? '✓' : '✗'} ${frente} sobre ${fundo}`.padEnd(46), `${r.toFixed(2)}:1`.padStart(9), `${minimo}:1`.padStart(7), '', uso);
}
console.log(falhas ? `\n${falhas} par(es) abaixo do mínimo.` : '\nTodos os pares passam.');
process.exit(falhas ? 1 : 0);
