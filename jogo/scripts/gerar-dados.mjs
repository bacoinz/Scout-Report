// Gera public/js/comum/dados.gen.js a partir de ../partilhado/ (perguntas.json e paises.json), para o Worker e o
// browser usarem as mesmas regras e os mesmos nomes. Corre antes de cada `wrangler dev` / `deploy`
// (wrangler.jsonc → build) e dos testes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (nome) => JSON.parse(readFileSync(join(raiz, '..', 'partilhado', nome), 'utf8'));

const perguntas = ler('perguntas.json');
// Dos países só interessa o nome em português e a confederação.
const paises = Object.fromEntries(
  Object.entries(ler('paises.json').paises)
    .map(([codigo, p]) => [codigo, { nome: p.nome, confederacao: p.confederacao ?? null }])
    .sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt')),
);

writeFileSync(
  join(raiz, 'public', 'js', 'comum', 'dados.gen.js'),
  `// Gerado por scripts/gerar-dados.mjs a partir de partilhado/ — não editar à mão.
export const PERGUNTAS = ${JSON.stringify(perguntas)};
export const PAISES = ${JSON.stringify(paises)};
`,
);
console.log(`perguntas.json + ${Object.keys(paises).length} países → public/js/comum/dados.gen.js`);
