// Copia as fontes (SIL OFL) de node_modules para public/fontes.
// Corre uma vez depois de `npm install` (npm run assets); o resultado fica no repositório.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(raiz, 'node_modules');

const destino = join(raiz, 'public', 'fontes');
mkdirSync(destino, { recursive: true });
const fontes = [
  ['@fontsource/anton/files/anton-latin-400-normal.woff2', 'anton-latin.woff2'],
  ['@fontsource/anton/files/anton-latin-ext-400-normal.woff2', 'anton-latin-ext.woff2'],
  ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter-latin.woff2'],
  ['@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2', 'inter-latin-ext.woff2'],
  ['@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff2', 'courier-prime-latin-400.woff2'],
  ['@fontsource/courier-prime/files/courier-prime-latin-ext-400-normal.woff2', 'courier-prime-latin-ext-400.woff2'],
  ['@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff2', 'courier-prime-latin-700.woff2'],
  ['@fontsource/courier-prime/files/courier-prime-latin-ext-700-normal.woff2', 'courier-prime-latin-ext-700.woff2'],
  ['@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2', 'caveat-latin.woff2'],
  ['@fontsource-variable/caveat/files/caveat-latin-ext-wght-normal.woff2', 'caveat-latin-ext.woff2'],
];
for (const [origem, nome] of fontes) copyFileSync(join(nm, origem), join(destino, nome));

writeFileSync(
  join(raiz, 'public', 'LICENCAS.txt'),
  [
    '# Licenças de terceiros incluídas no Scout Report',
    '',
    '## Fontes — SIL Open Font License 1.1, distribuídas através do Fontsource (https://fontsource.org)',
    '- Anton (Vernon Adams)',
    '- Inter (Rasmus Andersson)',
    '- Courier Prime (Alan Dague-Greene)',
    '- Caveat (Impallari Type)',
    '',
    '## Dados dos jogadores',
    'Wikipédia e Wikidata (CC BY-SA 4.0 / CC0), zerozero.pt e transfermarkt-datasets (CC0).',
    'As fotos vêm do Wikimedia Commons, com o autor e a licença de cada uma no dossier.',
    '',
  ].join('\n'),
);
console.log(`Copiadas ${fontes.length} fontes para public/fontes.`);
