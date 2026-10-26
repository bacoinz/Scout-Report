// Arranque e controlo do cliente: ecrãs, ligação à sala, catálogo e nomes do D1, mensagens e o Desafio do Dia.
// (Esqueleto do Guess The Kit.)
import { $, $$, ler, guardar, novoId } from './util.js';
import { Ligacao } from './ligacao.js';
import { carregarDados as obterDados } from './dados.js';
import { renderLobby } from './lobby.js';
import * as jogo from './jogo.js';
import * as joker from './joker.js';
import * as dia from './dia.js';
import { sons, somLigado, alternarSom } from './sons.js';

const CHAVE_TOKEN = 'sr.token';
const CHAVE_NOME = 'sr.nome';

let token = ler(CHAVE_TOKEN);
if (!token) {
  token = novoId();
  guardar(CHAVE_TOKEN, token);
}

const estado = { codigo: null, ligacao: null, eu: null, sala: null, privado: null, versao: null, cat: null, indice: null, nomesPorId: new Map(), ultimoSeq: null, partida: null };
const enviar = (msg) => estado.ligacao?.enviar(msg);
jogo.configurar(enviar);

// ---------------------------------------------------------------------------
// Ecrãs e navegação
// ---------------------------------------------------------------------------

function mostrar(ecra) {
  for (const e of $$('.ecra')) e.hidden = e.id !== `ecra-${ecra}`;
  document.body.classList.toggle('vista-jogo', ecra === 'jogo' || ecra === 'dia');
}

function irPara(caminho) {
  if (location.pathname !== caminho) history.pushState(null, '', caminho);
}

function voltarAoInicio(erro = '') {
  estado.ligacao?.fechar();
  Object.assign(estado, { ligacao: null, sala: null, privado: null, eu: null });
  irPara('/');
  document.title = 'Scout Report';
  $('#erro-inicio').textContent = erro;
  $('#aviso-ligacao').hidden = true;
  for (const d of $$('dialog[open]')) d.close();
  mostrar('inicio');
  mostrarBotaoDia();
}

/** O número do relatório de hoje no botão do início (com ✓ se já estiver feito neste browser). */
async function mostrarBotaoDia() {
  const info = await dia.infoDeHoje();
  if (info) $('#btn-dia .nota').textContent = `#${info.numero}${dia.feitoHoje(info.data) ? ' ✓' : ''}`;
}

/** O Desafio do Dia: o relatório de hoje, ou o de um dia anterior (`data`, do endereço /dia/AAAA-MM-DD). */
function abrirDia(data = null) {
  estado.ligacao?.fechar();
  Object.assign(estado, { ligacao: null, sala: null, privado: null, eu: null });
  $('#aviso-ligacao').hidden = true;
  for (const d of $$('dialog[open]')) d.close();
  mostrar('dia');
  dia.abrir(data);
}

async function infoSala(codigo) {
  try {
    const r = await fetch(`/api/salas/${codigo}`);
    return await r.json();
  } catch {
    return { existe: false, falhou: true };
  }
}

async function abrirSala(codigo) {
  const info = await infoSala(codigo);
  if (info.falhou) return voltarAoInicio('Sem ligação ao servidor. Tenta outra vez.');
  if (!info.existe) return voltarAoInicio(`A sala ${codigo} não existe ou já expirou.`);
  irPara(`/sala/${codigo}`);
  if (!ler(CHAVE_NOME)) {
    $('#nome-codigo').textContent = codigo;
    $('#erro-nome').textContent = info.cheia ? 'A sala está cheia: vais entrar a ver.' : info.fase === 'jogo' ? 'A partida já começou: entras a ver e jogas a partir da ronda seguinte.' : '';
    mostrar('nome');
    $('#nome-link').focus();
    estado.codigo = codigo;
    return;
  }
  ligar(codigo);
}

function ligar(codigo) {
  estado.ligacao?.fechar();
  Object.assign(estado, { codigo, eu: null, sala: null, privado: null, ultimoSeq: null, partida: null });
  jogo.reiniciar();
  document.title = `Scout Report · Sala ${codigo}`;
  estado.ligacao = new Ligacao({
    codigo,
    identidade: () => ({ token, nome: ler(CHAVE_NOME) ?? '' }),
    aoMensagem,
    aoEstado: (ligado) => {
      $('#aviso-ligacao').hidden = ligado;
    },
  });
  estado.ligacao.ligar();
}

async function criarSala() {
  const nome = $('#nome').value.trim();
  if (!nome) {
    $('#erro-inicio').textContent = 'Escolhe um nome primeiro.';
    $('#nome').focus();
    return;
  }
  guardar(CHAVE_NOME, nome);
  $('#erro-inicio').textContent = '';
  try {
    const r = await fetch('/api/salas', { method: 'POST', body: JSON.stringify({ token }) });
    const { codigo, erro } = await r.json();
    if (!codigo) throw new Error(erro);
    irPara(`/sala/${codigo}`);
    ligar(codigo);
  } catch (e) {
    $('#erro-inicio').textContent = e.message || 'Não foi possível criar a sala.';
  }
}

// ---------------------------------------------------------------------------
// Catálogo e nomes (em cache no browser enquanto a versão da base não mudar)
// ---------------------------------------------------------------------------

async function carregarDados(versao) {
  if (estado.versao === versao && estado.cat) return;
  estado.versao = versao;
  try {
    Object.assign(estado, await obterDados(versao));
    if (estado.sala) desenhar([]);
  } catch {
    estado.versao = null;
    jogo.toast('Não consegui carregar as perguntas. A tentar outra vez…');
    setTimeout(() => carregarDados(versao), 3000);
  }
}

// ---------------------------------------------------------------------------
// Mensagens do servidor
// ---------------------------------------------------------------------------

function aoMensagem(msg) {
  switch (msg.t) {
    case 'bemvindo':
      estado.eu = msg.eu;
      carregarDados(msg.versao);
      break;
    case 'estado':
      aoEstado(msg.sala, msg.eu);
      break;
    case 'erro':
      if (msg.fatal) voltarAoInicio(msg.msg);
      else {
        $('#erro-lobby').textContent = msg.msg;
        jogo.toast(msg.msg);
        sons.erro();
      }
      break;
    default:
  }
}

function aoEstado(sala, privado) {
  if (!estado.eu) return;
  const novos = estado.ultimoSeq == null ? [] : sala.feed.filter((ev) => ev.seq > estado.ultimoSeq);
  estado.ultimoSeq = sala.feed.at(-1)?.seq ?? 0;
  // Uma partida nova começa com a interface limpa.
  const partida = sala.partida ? sala.partida.inicio : null;
  if (partida !== estado.partida) {
    estado.partida = partida;
    jogo.reiniciar();
  }
  estado.sala = sala;
  estado.privado = privado;
  desenhar(novos);
}

function desenhar(novos) {
  const sala = estado.sala;
  if (sala.fase === 'lobby') {
    mostrar('lobby');
    $('#erro-lobby').textContent = '';
    renderLobby(sala, estado.eu, enviar);
    return;
  }
  mostrar('jogo');
  jogo.render({ eu: estado.eu, sala, privado: estado.privado, cat: estado.cat, indice: estado.indice, nomesPorId: estado.nomesPorId, desvio: estado.ligacao?.desvio ?? 0 }, novos);
}

// ---------------------------------------------------------------------------
// Botões
// ---------------------------------------------------------------------------

$('#nome').value = ler(CHAVE_NOME) ?? '';
$('#nome-link').value = ler(CHAVE_NOME) ?? '';
$('#btn-criar').addEventListener('click', criarSala);
$('#codigo').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
});
$('#form-entrar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const codigo = $('#codigo').value.trim().toUpperCase();
  const nome = $('#nome').value.trim();
  if (codigo.length !== 4) {
    $('#erro-inicio').textContent = 'O código tem 4 letras.';
    return;
  }
  if (!nome) {
    $('#erro-inicio').textContent = 'Escolhe um nome primeiro.';
    $('#nome').focus();
    return;
  }
  guardar(CHAVE_NOME, nome);
  const info = await infoSala(codigo);
  if (!info.existe) {
    $('#erro-inicio').textContent = info.falhou ? 'Sem ligação ao servidor.' : `A sala ${codigo} não existe.`;
    return;
  }
  irPara(`/sala/${codigo}`);
  ligar(codigo);
});
$('#form-nome').addEventListener('submit', (e) => {
  e.preventDefault();
  const nome = $('#nome-link').value.trim();
  if (!nome) return;
  guardar(CHAVE_NOME, nome);
  $('#nome').value = nome;
  ligar(estado.codigo);
});

async function copiarLink() {
  const link = `${location.origin}/sala/${estado.codigo}`;
  try {
    await navigator.clipboard.writeText(link);
    jogo.toast('Link copiado! Cola-o no Discord.');
  } catch {
    jogo.toast(link, 6000);
  }
}
$('#btn-copiar').addEventListener('click', copiarLink);
$('#btn-copiar-jogo').addEventListener('click', copiarLink);
$('#btn-comecar').addEventListener('click', () => enviar({ t: 'comecar' }));
$('#btn-repor').addEventListener('click', () => enviar({ t: 'repor' }));
$('#btn-novo').addEventListener('click', () => enviar({ t: 'novo_jogo' }));
$('#btn-ver-mesa').addEventListener('click', () => jogo.mostrarFinal(false));
$('#btn-ver-final').addEventListener('click', () => jogo.mostrarFinal(true));
for (const b of $$('.btn-sair')) {
  b.addEventListener('click', () => {
    enviar({ t: 'sair' });
    voltarAoInicio();
  });
}
$('#btn-sair-jogo').addEventListener('click', () => {
  const emJogo = estado.sala?.fase === 'jogo';
  if (emJogo && !confirm('Sair da partida? A tua ficha é revelada no fim da ronda e não podes voltar a esta partida.')) return;
  enviar({ t: 'sair' });
  voltarAoInicio();
});
for (const b of $$('[data-abrir]')) b.addEventListener('click', () => document.getElementById(b.dataset.abrir).showModal());

// Som e vibração
function mostrarSom() {
  const b = $('#btn-som');
  b.setAttribute('aria-pressed', String(somLigado()));
  b.querySelector('.estado').textContent = somLigado() ? 'Ligado' : 'Desligado';
}
$('#btn-som').addEventListener('click', () => {
  alternarSom();
  mostrarSom();
});
mostrarSom();

jogo.ligarPopups();
jogo.ligarPainel();
jogo.ligarFichas();
jogo.ligarLivre();
joker.ligar(enviar);
dia.ligar({ toast: jogo.toast });

// Ligações internas (início ↔ Desafio do Dia) sem recarregar a página.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-rota]');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  irPara(new URL(a.href).pathname);
  rota();
});

// Relógio (e tique nos últimos 10 segundos da minha vez)
let ultimoSegundo = null;
setInterval(() => {
  if (!estado.sala || !estado.ligacao) return;
  const falta = jogo.tick(estado.ligacao.agora());
  const segundo = falta == null ? null : Math.ceil(falta / 1000);
  if (segundo !== ultimoSegundo && segundo > 0 && segundo <= 10) sons.tique(segundo);
  ultimoSegundo = segundo;
}, 200);

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

function rota() {
  const m = location.pathname.match(/^\/sala\/([A-Za-z]{4})\/?$/);
  const d = location.pathname.match(/^\/dia(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/);
  if (m) abrirSala(m[1].toUpperCase());
  else if (d) abrirDia(d[1] ?? null);
  else voltarAoInicio();
}
window.addEventListener('popstate', rota);
rota();
