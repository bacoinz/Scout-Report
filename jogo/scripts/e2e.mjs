// Teste ponta-a-ponta: clientes WebSocket jogam uma partida contra o servidor (como no Guess The Kit).
//   npm run dev   (noutro terminal)   e depois   npm run e2e
//   BASE=https://scout-report.bacoinz.workers.dev npm run e2e   (o publicado)
// O teste faz de oráculo: cada cliente sabe o jogador secreto dos outros pelos dossiers (que só o dono recebe), e
// pergunta o que dá "sim" até desbloquear o palpite final e identificar. Verifica pelo caminho que nenhum
// jogador secreto chega a quem não o deve ver, a pergunta livre, a reconexão e quem entra a meio.
//
// Bots para jogar no browser:   node scripts/e2e.mjs --bots ABCD 2   (2 bots entram na sala ABCD e jogam sozinhos)
import * as P from '../public/js/comum/perguntas.js';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) falhas++;
};

const cat = P.prepararCatalogo(await (await fetch(`${BASE}/api/catalogo`)).json());

class Cliente {
  constructor(nome, token = `e2e-${nome}-${Math.random().toString(36).slice(2, 10)}`) {
    this.nome = nome;
    this.token = token;
    this.estado = null;
    this.eu = null;
    this.privado = null;
    this.textos = [];
    this.esperas = [];
    this.agiu = new Set();
  }
  ligar(codigo) {
    this.codigo = codigo;
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/ws/${codigo}`);
      this.ws.addEventListener('open', () => this.enviar({ t: 'entrar', token: this.token, nome: this.nome }));
      this.ws.addEventListener('error', () => reject(new Error(`erro no WebSocket (${this.nome})`)));
      this.ws.addEventListener('message', (ev) => {
        const texto = String(ev.data);
        if (texto === 'pong') return;
        const msg = JSON.parse(texto);
        if (msg.t === 'bemvindo') {
          this.eu = msg.eu;
          resolve();
        }
        if (msg.t === 'estado') {
          this.estado = msg.sala;
          this.privado = msg.eu;
          this.textos.push(texto);
          this.aoEstado?.();
        }
        if (msg.t === 'erro') {
          this.erros = [...(this.erros ?? []), msg.msg];
          if (msg.fatal) reject(new Error(msg.msg));
        }
        this.esperas = this.esperas.filter((e) => !e(msg));
      });
    });
  }
  enviar(obj) {
    this.ws.send(JSON.stringify(obj));
  }
  esperar(teste, ms = 20_000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`tempo esgotado à espera de mensagem (${this.nome})`)), ms);
      this.esperas.push((msg) => {
        if (!teste(msg)) return false;
        clearTimeout(t);
        resolve(msg);
        return true;
      });
    });
  }
  async estadoQue(teste, ms) {
    if (this.estado && teste(this.estado)) return this.estado;
    return (await this.esperar((m) => m.t === 'estado' && teste(m.sala), ms)).sala;
  }
  fechar() {
    this.aoEstado = null;
    this.ws.close();
  }
}

const fichaDe = (sala, dono) => sala.partida?.fichas.find((f) => f.dono === dono);
const TIPOS_SIM = ['pais', 'liga', 'clube', 'conf', 'nac', 'setor', 'pos', 'decada', 'ano', 'premio', 'ativo', 'retirado', 'jogos', 'golos', 'faixa', 'pe', 'altura'];
/** A melhor pergunta para a ficha `f` sabendo o registo: primeiro o caminho até um clube, depois o que der "sim". */
function perguntaSim(f, reg) {
  for (const tipo of TIPOS_SIM) {
    for (const k of P.candidatas(f, tipo, cat)) {
      if (P.valida(k, cat) && P.disponivel(f, k, cat) && P.responder(reg, k) === 'sim') return k;
    }
  }
  return null;
}
/** Uma pergunta aberta qualquer (para os bots, que não sabem o segredo). */
function perguntaQualquer(f) {
  const abertas = Object.values(P.TIPOS_POR_CATEGORIA).flat().flatMap((t) => P.candidatas(f, t, cat))
    .filter((k) => P.valida(k, cat) && P.disponivel(f, k, cat));
  // Prefere subir na hierarquia (ligas e clubes dos países confirmados).
  const fundo = abertas.filter((k) => /^(liga|clube|pos|nac|ano):/.test(k));
  const lista = fundo.length && Math.random() < 0.6 ? fundo : abertas;
  return lista[Math.floor(Math.random() * lista.length)] ?? null;
}

// ---------------------------------------------------------------------------
// Bots para o browser
// ---------------------------------------------------------------------------

if (process.argv[2] === '--bots') {
  const codigo = process.argv[3].toUpperCase();
  const n = Number(process.argv[4] ?? 2);
  const bots = Array.from({ length: n }, (_, i) => new Cliente(['Rui', 'Ana', 'Marta', 'João', 'Sofia', 'Tiago', 'Inês'][i] ?? `Bot ${i + 1}`));
  for (const b of bots) {
    b.aoEstado = () => setTimeout(() => {
      const s = b.estado;
      const p = s?.partida;
      if (!p || s.fase !== 'jogo') return;
      if (p.fase === 'escolha' && b.privado?.cartas && !b.privado.cartas.escolhida && !b.agiu.has('carta')) {
        b.agiu.add('carta');
        b.enviar({ t: 'carta', jogador: b.privado.cartas.ids[0] });
      }
      if (p.fase === 'livre' && p.livre?.alvo === b.eu && !b.agiu.has(`livre${p.livre.prazo}`)) {
        b.agiu.add(`livre${p.livre.prazo}`);
        setTimeout(() => b.enviar({ t: 'responder_livre', resposta: ['sim', 'nao', 'nao_sei'][Math.floor(Math.random() * 3)] }), 2500);
      }
      if (p.fase === 'vez' && p.vez?.jogador === b.eu && !b.agiu.has(`vez${p.vez.seq}:${Object.keys(fichaDe(s, p.vez.alvo).respostas).length}`)) {
        b.agiu.add(`vez${p.vez.seq}:${Object.keys(fichaDe(s, p.vez.alvo).respostas).length}`);
        const f = s.partida.fichas.find((x) => x.n === p.vez.ficha);
        const k = perguntaQualquer(f);
        setTimeout(() => (k ? b.enviar({ t: 'pergunta', vez: p.vez.seq, chave: k }) : null), 1500 + Math.random() * 2000);
      }
    }, 50);
    await b.ligar(codigo);
    console.log(`${b.nome} entrou na sala ${codigo}`);
  }
  console.log('Os bots estão a jogar (Ctrl+C para sair).');
  await new Promise(() => {});
}

// ---------------------------------------------------------------------------
// Partida de teste
// ---------------------------------------------------------------------------

const [A, B, C] = [new Cliente('Ana'), new Cliente('Bruno'), new Cliente('Carla')];
const { codigo } = await (await fetch(`${BASE}/api/salas`, { method: 'POST', body: JSON.stringify({ token: A.token }) })).json();
ok(/^[A-Z]{4}$/.test(codigo), `sala criada: ${codigo}`);
for (const c of [A, B, C]) await c.ligar(codigo);
await A.estadoQue((s) => s.jogadores.length === 3);
ok(A.estado.anfitriao === A.eu, 'quem cria a sala é o anfitrião');

A.enviar({ t: 'config', modo: 'aleatorio', jogadores: 'conhecidos' });
await A.estadoQue((s) => s.config.modo === 'aleatorio' && s.disponiveis != null);
ok(A.estado.disponiveis > 400, `jogadores conhecidos na base: ${A.estado.disponiveis}`);
A.enviar({ t: 'comecar' });
for (const c of [A, B, C]) await c.estadoQue((s) => s.fase === 'jogo' && s.partida?.fase === 'vez');
ok([A, B, C].every((c) => c.privado?.dossier?.id), 'cada um recebeu o dossier do seu jogador');
const segredo = new Map([A, B, C].map((c) => [c.eu, c.privado.dossier]));
ok(new Set([...segredo.values()].map((r) => r.id)).size === 3, 'três jogadores secretos diferentes');

// Nenhum estado recebido por um cliente pode ter o id ou o nome do jogador secreto de outro (antes de revelado).
function semFugas(etiqueta) {
  let limpo = true;
  for (const c of [A, B, C, ...extras]) {
    for (const t of c.textos) {
      const msg = JSON.parse(t);
      const reveladas = new Set((msg.sala.partida?.fichas ?? []).filter((f) => f.revelada).map((f) => f.dono));
      const publico = JSON.stringify(msg.sala);
      for (const [dono, reg] of segredo) {
        if (reveladas.has(dono)) continue;
        if (publico.includes(`"${reg.id}"`) || publico.includes(`"${reg.nome}"`)) limpo = false;
        if (dono !== c.eu && JSON.stringify(msg.eu).includes(`"${reg.id}"`)) limpo = false;
      }
    }
  }
  ok(limpo, `sem fugas de jogadores secretos (${etiqueta})`);
}
const extras = [];

// 1.ª vez: pergunta livre da Ana ao alvo; o dono responde "sim".
let s = A.estado;
ok(s.partida.vez.jogador === A.eu && s.partida.vez.alvo === B.eu, 'a Ana começa, a perguntar ao Bruno');
A.enviar({ t: 'livre', vez: s.partida.vez.seq, texto: 'Jogou com o irmão na mesma equipa?' });
await B.estadoQue((x) => x.partida.fase === 'livre' && x.partida.livre?.alvo === B.eu);
ok(true, 'o Bruno vê a pergunta livre para responder');
B.enviar({ t: 'responder_livre', resposta: 'sim' });
s = await A.estadoQue((x) => x.partida.vez?.jogador === B.eu);
ok(fichaDe(s, B.eu).livres.length === 1 && s.jogadores.find((j) => j.id === A.eu).total === 3, 'a resposta ficou nas notas e deu 3 pontos à Ana');

// A partir daqui, cada um pergunta o que dá "sim" (sabendo o segredo pelo dossier) e dá o palpite quando puder.
const ordem = [A, B, C];
let reconectou = false;
let entrou = null;
let rondas = 0;
const porId = () => new Map([...ordem, ...extras].map((c) => [c.eu, c]));
for (let passo = 0; passo < 400; passo++) {
  s = A.estado;
  if (s.fase === 'final') break;
  const p = s.partida;
  if (p.ronda !== rondas) {
    rondas = p.ronda;
    // Na 2.ª ronda: a Carla desliga-se e volta com o mesmo token; entra alguém novo a meio.
    if (rondas === 2 && !reconectou) {
      reconectou = true;
      const idAntes = C.eu;
      const dossierAntes = C.privado.dossier.id;
      C.fechar();
      await espera(300);
      const C2 = new Cliente('Carla', C.token);
      await C2.ligar(codigo);
      await C2.estadoQue((x) => x.jogadores.find((j) => j.id === C2.eu)?.ligado);
      ok(C2.eu === idAntes && C2.privado.dossier.id === dossierAntes, 'a Carla voltou com o mesmo token: o mesmo jogador e o mesmo dossier');
      ordem[2] = C2;
      entrou = new Cliente('Duarte');
      await entrou.ligar(codigo);
      extras.push(entrou);
      const d = await A.estadoQue((x) => x.jogadores.some((j) => j.id === entrou.eu));
      ok(d.jogadores.find((j) => j.id === entrou.eu).espectador, 'quem entra a meio fica a ver');
    }
    if (entrou && rondas === 3) {
      await entrou.estadoQue((x) => x.partida?.ronda === 3);
      ok(!entrou.estado.jogadores.find((j) => j.id === entrou.eu).espectador && entrou.privado?.dossier, 'na ronda seguinte passa a jogar, com um jogador secreto');
      if (entrou.privado?.dossier) segredo.set(entrou.eu, entrou.privado.dossier);
    }
  }
  if (p.fase === 'identificado') {
    await A.estadoQue((x) => x.partida?.fase !== 'identificado' || x.fase === 'final', 10_000);
    continue;
  }
  if (p.fase !== 'vez' || !p.vez) {
    await espera(100);
    continue;
  }
  const quem = porId().get(p.vez.jogador);
  const seq = p.vez.seq;
  // Palpite final certo a qualquer ficha desbloqueada (menos a própria).
  const desbloqueada = p.fichas.find((f) => f.dono !== quem.eu && !f.identificada && !f.revelada && P.palpiteDesbloqueado(f));
  if (desbloqueada) {
    const reg = segredo.get(desbloqueada.dono);
    quem.enviar({ t: 'palpite', vez: seq, ficha: desbloqueada.n, jogador: reg.id, nome: reg.nome });
    s = await A.estadoQue((x) => x.fase === 'final' || x.partida.fichas.find((f) => f.n === desbloqueada.n)?.identificada);
    const f = s.partida.fichas.find((x) => x.n === desbloqueada.n);
    ok(f.identificada?.por === quem.eu && f.revelada?.nome === reg.nome, `${quem.nome} identificou ${reg.nome}`);
    continue;
  }
  const f = p.fichas.find((x) => x.n === p.vez.ficha);
  const k = perguntaSim(f, segredo.get(p.vez.alvo)) ?? perguntaQualquer(f);
  quem.enviar({ t: 'pergunta', vez: seq, chave: k });
  await A.estadoQue((x) => x.fase === 'final' || x.partida.vez?.seq !== seq || Object.keys(x.partida.fichas.find((y) => y.n === f.n).respostas).length > Object.keys(f.respostas).length, 10_000);
}

s = await A.estadoQue((x) => x.fase === 'final', 30_000);
ok(s.fase === 'final', `a partida acabou (ronda ${s.partida.ronda})`);
const identificadas = s.partida.fichas.filter((f) => f.identificada).length;
ok(identificadas === s.partida.fichas.length, `só acaba com todos identificados: ${identificadas} de ${s.partida.fichas.length}`);
ok(s.partida.fichas.every((f) => f.revelada?.nome), 'no fim revelam-se todos os jogadores secretos');
const metade = s.feed.filter((e) => e.tipo === 'identificado').some((e) => s.jogadores.find((j) => j.id === e.jogador) && e.pontos === 15);
console.log(`  pontos: ${s.jogadores.map((j) => `${j.nome} ${j.total}`).join(' · ')}${metade ? ' (houve um palpite a metade)' : ''}`);
semFugas('partida inteira');

A.enviar({ t: 'novo_jogo' });
await A.estadoQue((x) => x.fase === 'lobby');
ok(true, 'nova partida: de volta ao lobby');

for (const c of [...ordem, ...extras]) c.fechar();
console.log(falhas ? `\n${falhas} verificações falharam.` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
