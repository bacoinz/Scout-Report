// Sons (sintetizados com Web Audio, sem ficheiros) e vibração no telemóvel. (Do Guess The Kit.)
// O browser só deixa tocar depois de um gesto do utilizador: o contexto abre-se no primeiro clique ou tecla.
import { ler, guardar } from './util.js';

const CHAVE = 'sr.som';
let ligado = ler(CHAVE) !== 'nao';
let contexto = null;

function abrir() {
  if (!contexto) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    contexto = new Ctx();
  }
  if (contexto.state === 'suspended') contexto.resume();
  return contexto;
}
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, abrir, { once: false, passive: true });

/** Uma sequência de notas: [frequência Hz, duração s, tipo de onda?]. */
function tocar(notas, volume = 0.12) {
  if (!ligado) return;
  const ctx = abrir();
  if (!ctx || ctx.state !== 'running') return;
  let t = ctx.currentTime;
  for (const [freq, dur, onda = 'sine'] of notas) {
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.type = onda;
    osc.frequency.value = freq;
    ganho.gain.setValueAtTime(0.0001, t);
    ganho.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    t += dur * 0.85;
  }
}

/** O baque de um carimbo: ruído curto e grave. */
function baque(volume = 0.25) {
  if (!ligado) return;
  const ctx = abrir();
  if (!ctx || ctx.state !== 'running') return;
  const dur = 0.12;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const dados = buffer.getChannelData(0);
  for (let i = 0; i < dados.length; i++) dados[i] = (Math.random() * 2 - 1) * (1 - i / dados.length) ** 3;
  const fonte = ctx.createBufferSource();
  fonte.buffer = buffer;
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.value = 420;
  const ganho = ctx.createGain();
  ganho.gain.value = volume;
  fonte.connect(filtro).connect(ganho).connect(ctx.destination);
  fonte.start();
}

function vibrar(padrao) {
  // Sem um toque prévio na página o browser recusa (e queixa-se na consola).
  if (ligado && navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(padrao);
}

export const sons = {
  /** Um carimbo na ficha (CONFIRMADO, DESCARTADO, SEM REGISTO). */
  carimbo() {
    baque();
    vibrar(25);
  },
  /** É a tua vez. */
  vez() {
    tocar([[660, 0.1], [990, 0.16]], 0.09);
    vibrar([40, 40, 40]);
  },
  /** Pediram-te uma resposta (pergunta livre ao teu jogador). */
  livre() {
    tocar([[880, 0.1, 'triangle'], [880, 0.1, 'triangle'], [1175, 0.18, 'triangle']], 0.08);
    vibrar([60, 40, 60]);
  },
  erro() {
    tocar([[200, 0.18, 'square']], 0.06);
    vibrar([60, 40, 60]);
  },
  /** Últimos 10 segundos da tua vez: um tique por segundo, mais agudo nos últimos 3. */
  tique(segundo = 10) {
    const fim = segundo <= 3;
    tocar([[fim ? 1568 : 1046, fim ? 0.09 : 0.07, 'square']], fim ? 0.07 : 0.05);
    if (fim) vibrar(15);
  },
  /** O anúncio da Ronda Joker: um arpejo a subir. */
  joker() {
    tocar([[392, 0.1], [523, 0.1], [659, 0.1], [784, 0.12], [1047, 0.3]], 0.09);
    vibrar([50, 30, 50, 30, 120]);
  },
  identificado() {
    baque(0.35);
    setTimeout(() => tocar([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.35]], 0.1), 180);
    vibrar([60, 40, 60, 40, 160]);
  },
  /** Apito do árbitro. */
  fim() {
    tocar([[2093, 0.18, 'triangle'], [2093, 0.18, 'triangle'], [2093, 0.45, 'triangle']], 0.08);
    vibrar([100, 60, 100, 60, 250]);
  },
};

export const somLigado = () => ligado;

export function alternarSom() {
  ligado = !ligado;
  guardar(CHAVE, ligado ? 'sim' : 'nao');
  if (ligado) sons.vez();
  return ligado;
}
