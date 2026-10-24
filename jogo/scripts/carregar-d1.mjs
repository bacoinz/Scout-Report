// Aplica no D1 o SQL da exportação do pipeline (../pipeline/saida/d1/*.sql), por ordem e um ficheiro de cada vez:
// o --file remoto não é uma transação, por isso pára no primeiro que falhar.
//   node scripts/carregar-d1.mjs            → D1 local (wrangler dev)
//   node scripts/carregar-d1.mjs --remote   → D1 da Cloudflare (passo 7)
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const destino = process.argv.includes('--remote') ? '--remote' : '--local';
const pasta = '../pipeline/saida/d1';
const ficheiros = readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort();
if (!ficheiros.length) {
  console.error(`Não há SQL em ${pasta}: corre primeiro \`python -m scout exportar\` no pipeline.`);
  process.exit(1);
}
for (const f of ficheiros) {
  console.log(`→ ${f}`);
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'scout-report', destino, '--yes', '--file', `${pasta}/${f}`], {
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: true,
  });
  if (r.status !== 0) {
    console.error(`Falhou em ${f}.`);
    process.exit(r.status ?? 1);
  }
}
console.log(`${ficheiros.length} ficheiros aplicados no D1 (${destino.slice(2)}).`);
