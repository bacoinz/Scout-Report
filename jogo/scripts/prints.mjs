// Tira as capturas do README (docs/screenshots) com o Chrome sem janela, em inglês, a partir do servidor local:
//   npm run dev   (noutro terminal)   e depois   node scripts/prints.mjs
// Cria uma sala, junta bots (scripts/e2e.mjs --bots), joga uns minutos e fotografa o início, o lobby, o jogo, o
// telemóvel e o Relatório do Dia.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const SAIDA = path.resolve(import.meta.dirname, '../../docs/screenshots');
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORTA = 9333;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(SAIDA, { recursive: true });

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'sr-prints-'))}`,
  '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let bots = null;
const fechar = () => {
  chrome.kill();
  bots?.kill();
};
process.on('exit', fechar);

let alvo;
for (let i = 0; i < 50 && !alvo; i++) {
  try {
    alvo = (await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json()).find((t) => t.type === 'page');
  } catch {
    await espera(200);
  }
}
if (!alvo) throw new Error('O Chrome não arrancou.');
const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pendentes = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pendentes.has(m.id)) {
    pendentes.get(m.id)(m);
    pendentes.delete(m.id);
  }
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id;
  pendentes.set(n, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
  ws.send(JSON.stringify({ id: n, method, params }));
});
const avaliar = async (expressao) => {
  const r = await cdp('Runtime.evaluate', { expression: expressao, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'erro no browser');
  return r.result.value;
};
const vista = (largura, altura, movel = false) =>
  cdp('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: movel ? 2 : 1, mobile: movel });
const ir = async (url) => {
  await cdp('Page.navigate', { url });
  await espera(1800);
};
async function foto(nome) {
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(r.data, 'base64'));
  console.log('✓', nome);
}

await cdp('Page.enable');
await vista(1440, 900);

// Início
await ir(`${BASE}/?lang=en`);
await foto('start');

// Sala com bots
await avaliar(`(async () => { document.querySelector('#nome').value = 'You'; document.querySelector('#nome').dispatchEvent(new Event('input')); document.querySelector('#btn-criar').click(); })()`);
await espera(2000);
const codigo = await avaliar(`document.querySelector('#lobby-codigo').textContent`);
bots = spawn('node', ['scripts/e2e.mjs', '--bots', codigo, '3'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, BASE }, stdio: 'ignore' });
await avaliar(`(async () => { for (let i = 0; i < 60 && document.querySelectorAll('#lobby-jogadores li').length < 4; i++) await new Promise((r) => setTimeout(r, 250)); })()`);
await foto('lobby');

// Joga (sem timer, para o jogo não correr por si) até as fichas terem dados.
await avaliar(`(async () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  [...document.querySelectorAll('#cfg-tempo button')].find((b) => /No timer|Sem timer/.test(b.textContent)).click();
  await espera(600);
  document.querySelector('#btn-comecar').click();
  for (let i = 0; i < 60 && document.querySelector('#ecra-jogo').hidden; i++) await espera(250);
  const form = document.querySelector('#acoes');
  const fim = Date.now() + 70000;
  while (Date.now() < fim) {
    const ops = [...document.querySelectorAll('#col-perguntas .opcao')].filter((b) => !b.disabled);
    const op = ops[Math.floor(Math.random() * ops.length)];
    const enviar = form.querySelector('button[type=submit]');
    if (/YOUR TURN/i.test(document.querySelector('#col-perguntas').textContent) && op && !enviar.disabled) { op.click(); await espera(150); form.requestSubmit(); await espera(500); }
    else await espera(250);
  }
  // Espera pela minha vez, abre uma categoria e escolhe uma pergunta para a captura.
  for (let i = 0; i < 80 && !/YOUR TURN/i.test(document.querySelector('#col-perguntas').textContent); i++) await espera(250);
  document.querySelector('#col-perguntas details[data-categoria=estatisticas]')?.setAttribute('open', '');
})()`);
await espera(600);
await foto('game');

// Menu do jogo e classificação
await avaliar(`document.querySelector('.btn-menu').click()`);
await espera(400);
await foto('menu');
await avaliar(`document.querySelector('.btn-menu').click()`);
await avaliar(`document.querySelector('[aria-controls=popup-placar]').click()`);
await espera(400);
await foto('standings');
await avaliar(`document.querySelector('[aria-controls=popup-placar]').click()`);

// Telemóvel
await vista(390, 844, true);
await espera(800);
await foto('game-phone');
await avaliar(`document.querySelector('#navegador button:nth-child(2)')?.click()`);
await espera(600);
await foto('card-phone');

// Relatório do Dia
await vista(1440, 900);
await ir(`${BASE}/dia?lang=en`);
await avaliar(`(async () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let n = 0; n < 9; n++) {
    for (const d of document.querySelectorAll('#dia-categorias details')) d.open = false;
    const ops = [...document.querySelectorAll('#dia-categorias .opcao')].filter((b) => !b.disabled);
    const op = ops[Math.floor(Math.random() * ops.length)];
    if (!op) break;
    op.click(); await espera(150);
    document.querySelector('#dia-enviar').click(); await espera(800);
  }
})()`);
await espera(500);
await foto('daily');

// "How to play"
await vista(1440, 900);
await ir(`${BASE}/?lang=en`);
await avaliar(`document.querySelector('[data-abrir=dialogo-como]').click()`);
await espera(500);
await foto('how-to-play');

fechar();
process.exit(0);
