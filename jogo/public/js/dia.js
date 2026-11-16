// Desafio do Dia (/dia, "Relatório do Dia"): um jogador mistério por dia, o mesmo para toda a gente. Só perguntas
// da lista, com o menu e a ficha do jogo. O servidor responde (src/dia.js) e o progresso fica neste browser
// (localStorage `sr.dia.<data>`): um jogo por dia. O resultado é o número de perguntas, para copiar para o Discord.
// O calendário por baixo do relatório abre os dias anteriores (/dia/AAAA-MM-DD), desde o lançamento.
import * as P from './comum/perguntas.js';
import { procurar, sugerir } from './comum/nomes.js';
import { $, $$, el, ler, guardar, miniatura, creditoFoto, enterEnvia } from './util.js';
import { autocompletar } from './autocompletar.js';
import { fichaPublica, caixaPalpite } from './ficha.js';
import { menu, descreverEscolhida } from './menu.js';
import { carregarDados } from './dados.js';
import { sons } from './sons.js';
import { quadrados, textoResumo as resumoPt, textoPerguntas } from './resumo.js';
import { traduzir, LOCALE } from './idioma.js';

/** O resultado para copiar, no idioma do jogo (linha a linha; os quadrados ficam iguais). */
const textoResumo = (...a) => resumoPt(...a).split('\n').map(traduzir).join('\n');

const N = 1; // o número da ficha (só há uma)
const RESPOSTAS = { sim: 'Sim', nao: 'Não', sem_registo: 'Sem registo: escolhe outra pergunta' };
const chaveDia = (data) => `sr.dia.${data}`;

const est = {
  info: null, // o de hoje: { data, numero, faltaMs, versao, lancamento } de /api/dia
  data: null, // o dia aberto (hoje ou um anterior) e o número do relatório dele
  numero: null,
  mes: null, // o mês à vista no calendário: 'AAAA-MM'
  proximo: 0, // instante do relatório seguinte
  dados: null, // { cat, indice, nomesPorId }
  prog: null, // { passos: [{ chave, r } | { palpite, nome }], fim: null | { certo | desistiu, revelado }, completos }
  escolhida: null,
  abertas: new Set(),
  novas: new Set(),
  aEnviar: false,
  palpite: null, // { texto } com a caixa do palpite aberta
  fimEscondido: false,
  fimAnimado: false,
};
let toast = () => {};

// ---------------------------------------------------------------------------
// Progresso (no browser) e pedidos ao servidor
// ---------------------------------------------------------------------------

function lerProgresso(data) {
  try {
    const p = JSON.parse(ler(chaveDia(data)) ?? 'null');
    // Perguntas que deixaram de existir (as das ligas) saem do histórico, senão o servidor recusava-o.
    if (p && Array.isArray(p.passos)) return { passos: p.passos.filter((x) => !x.chave || P.ler(x.chave)), fim: p.fim ?? null, completos: p.completos ?? {} };
  } catch {
    // progresso estragado: recomeça
  }
  return { passos: [], fim: null, completos: {} };
}
const guardarProgresso = () => guardar(chaveDia(est.data), JSON.stringify(est.prog));

/** O relatório de hoje já acabou neste browser? (para o botão do início) */
export function feitoHoje(data) {
  return Boolean(lerProgresso(data).fim);
}

const historico = () => est.prog.passos.filter((p) => p.chave).map((p) => p.chave);

async function pedir(acao, corpo) {
  let r;
  try {
    r = await fetch(`/api/dia/${acao}`, { method: 'POST', body: JSON.stringify({ data: est.data, ...corpo }) });
  } catch {
    throw new Error('Sem ligação ao servidor. Tenta outra vez.');
  }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(json.erro ?? 'Algo correu mal. Tenta outra vez.'), { fechado: json.fechado });
  return json;
}

// ---------------------------------------------------------------------------
// A ficha (a partir do progresso)
// ---------------------------------------------------------------------------

function fichaDoDia() {
  const { passos, fim } = est.prog;
  return {
    n: N,
    dono: 'dia',
    respostas: Object.fromEntries(passos.filter((p) => p.chave).map((p) => [p.chave, { r: p.r, autor: 'tu' }])),
    livres: [],
    palpites: passos.filter((p) => p.palpite).map((p) => ({ nome: p.nome, autor: 'tu' })),
    valores: {},
    revelada: fim?.revelado ?? null,
    identificada: fim?.certo ? { por: 'tu' } : null,
    completos: est.prog.completos ?? {},
  };
}

function porqueSemPalpite(f) {
  const falta = P.faltaParaPalpite(f);
  const partes = [];
  if (falta.sim) partes.push(`${falta.sim} «sim»`);
  if (falta.clube) partes.push('um clube confirmado');
  return partes.length ? `Falta ${partes.join(' e ')}` : '';
}

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

const meioDia = (data) => new Date(`${data}T12:00:00Z`);
const dataPorExtenso = (data) =>
  new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(meioDia(data));
const nomeMes = (mes) => new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(meioDia(`${mes}-01`));
/** O número do relatório de uma data (o do lançamento é o #1). */
const numeroDe = (data) => Math.round((Date.parse(data) - Date.parse(est.info.lancamento)) / 86_400_000) + 1;
/** Pode abrir-se este dia? Desde o lançamento até hoje. */
const jogavel = (data) => /^\d{4}-\d{2}-\d{2}$/.test(data ?? '') && data >= est.info.lancamento && data <= est.info.data;
/** 'AAAA-MM' de mais (ou menos) n meses. */
function somarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function renderPainel(f) {
  const cat = est.dados.cat;
  const fim = est.prog.fim;
  const ativo = !fim && !est.aEnviar;
  if (est.escolhida && (!ativo || !P.disponivel(f, est.escolhida, cat))) est.escolhida = null;
  const categorias = $('#dia-categorias');
  const deslocamento = categorias.scrollTop;
  categorias.replaceChildren(...menu(f, { cat, ativo, identificado: false, escolhida: est.escolhida, abertas: est.abertas, aoEscolher: escolher }));
  categorias.scrollTop = deslocamento;
  const aviso = $('#dia-aviso');
  aviso.textContent = !fim ? '' : est.data === est.info.data ? 'O relatório de hoje está fechado. Volta amanhã para outro jogador, ou joga um dia anterior no calendário.'
    : 'Este relatório está fechado. Escolhe outro dia no calendário.';
  aviso.hidden = !fim;
  $('#dia-enviar').disabled = !ativo;
  $('#dia-enviar').textContent = est.aEnviar ? 'A enviar…' : 'Enviar pergunta';
  const barra = $('#dia-escolhida');
  barra.classList.toggle('vazia', !est.escolhida);
  barra.querySelector('.texto').textContent = est.escolhida ? descreverEscolhida(est.escolhida, cat, false).texto : 'Escolhe uma pergunta da lista';
}

function renderFicha(f) {
  const fim = est.prog.fim;
  const podePalpitar = !fim && !est.aEnviar && P.palpiteDesbloqueado(f);
  const opcoes = {
    cat: est.dados.cat,
    dono: { nome: `N.º ${est.numero}` },
    alvo: false,
    recolhida: false,
    podePalpitar,
    porqueNao: porqueSemPalpite(f),
    identificadoAgora: false,
    novas: est.novas,
    nome: () => '',
    cor: () => 'var(--destaque)',
    vistos: false, // só há um jogador: não é preciso dizer quem acertou
  };
  const art = fichaPublica(f, opcoes);
  art.id = 'dia-ficha'; // o #f-1 pode existir no ecrã do jogo
  art.querySelector('.folha-min')?.remove();
  $('#dia-fichas').replaceChildren(art);
  if (est.palpite && podePalpitar) abrirCaixa(art, f);
  else est.palpite = null;
}

function renderLado() {
  const { passos, fim } = est.prog;
  const q = quadrados(passos, fim);
  $('#dia-n').textContent = String(q.length);
  $('#dia-n-texto').textContent = q.length === 1 ? 'pergunta' : 'perguntas';
  $('#dia-trilho').replaceChildren(...q.map((x) => el('li', { class: `q ${x}` })), ...(fim?.desistiu ? [el('li', { class: 'q bandeira', text: '🏳️' })] : []));
  $('#dia-trilho').hidden = !q.length && !fim;
  $('#dia-desistir').hidden = Boolean(fim);
  $('#dia-desistir').disabled = est.aEnviar;
  $('#dia-copiar').hidden = !fim;
  $('#dia-ver-fim').hidden = !fim;
  renderProximo();
  renderCalendario();
}

/** Como está um dia neste browser: { classe, texto } (identificado, desististe, a meio ou por jogar). */
function estadoDoDia(data) {
  const p = data === est.data ? est.prog : lerProgresso(data);
  const n = textoPerguntas(quadrados(p.passos, p.fim).length);
  if (p.fim?.certo) return { classe: 'certo', texto: `identificado em ${n}` };
  if (p.fim?.desistiu) return { classe: 'desistiu', texto: `desististe ao fim de ${n}` };
  if (p.passos.length) return { classe: 'a-meio', texto: `a meio (${n})` };
  return { classe: '', texto: 'por jogar' };
}

/** O calendário: o mês à vista, com os dias desde o lançamento até hoje (o aberto em destaque). */
function renderCalendario() {
  const { lancamento, data: hoje } = est.info;
  const [a, m] = est.mes.split('-').map(Number);
  const desvio = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7; // a semana começa à segunda
  const diasNoMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const celulas = Array.from({ length: desvio }, () => el('li', { 'aria-hidden': 'true' }));
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const d = `${est.mes}-${String(dia).padStart(2, '0')}`;
    const pode = jogavel(d);
    const e = pode ? estadoDoDia(d) : null;
    celulas.push(el('li', {}, el('button', {
      type: 'button', class: ['cal-dia', e?.classe, d === hoje ? 'hoje' : '', d === est.data ? 'atual' : ''].filter(Boolean).join(' '),
      disabled: !pode, 'aria-current': d === est.data ? 'date' : null, dataset: { data: d },
      title: pode ? `Relatório #${numeroDe(d)}${d === hoje ? ' (hoje)' : ''} · ${e.texto}` : null,
    }, String(dia))));
  }
  $('#dia-cal-mes').textContent = nomeMes(est.mes);
  $('#dia-cal-dias').replaceChildren(...celulas);
  $('#dia-cal-antes').disabled = est.mes <= lancamento.slice(0, 7);
  $('#dia-cal-depois').disabled = est.mes >= hoje.slice(0, 7);
}

function renderFim() {
  const fim = est.prog.fim;
  const caixa = $('#dia-fim');
  caixa.hidden = !fim || est.fimEscondido;
  if (caixa.hidden) return;
  const r = fim.revelado;
  const n = quadrados(est.prog.passos, fim).length;
  $('#dia-fim-titulo').replaceChildren(...(fim.certo ? [el('span', { text: 'Jogador' }), ' ', el('span', { class: 'destaque', text: 'identificado' })]
    : [el('span', { text: 'Relatório' }), ' ', el('span', { class: 'destaque', text: 'fechado' })]));
  $('#dia-fim-carimbo').textContent = fim.certo ? 'Identificado' : 'Revelado';
  $('#dia-fim-retrato').classList.toggle('desistiu', !fim.certo);
  // Quem volta a abrir um relatório acabado não vê o carimbo e a foto a cair outra vez.
  $('#dia-fim-retrato').classList.toggle('parado', est.fimAnimado);
  const semFoto = el('span', { class: 'sem-foto' });
  semFoto.innerHTML = '<svg viewBox="0 0 56 70" width="64" height="80"><use href="#i-silhueta"/></svg>';
  $('#dia-fim-foto').replaceChildren(r.perfil?.foto?.url
    ? el('img', { src: miniatura(r.perfil.foto.url), alt: r.nome, title: creditoFoto(r.perfil.foto), referrerpolicy: 'no-referrer' })
    : semFoto);
  $('#dia-fim-nome').textContent = r.nome;
  $('#dia-fim-nota').textContent = fim.certo ? `Em ${textoPerguntas(n)}.` : `Desististe ao fim de ${textoPerguntas(n)}.`;
  $('#dia-resumo').textContent = textoResumo(est.numero, est.prog.passos, fim);
  est.fimAnimado = true;
  renderProximo();
}

function renderProximo() {
  if (!est.info) return;
  const falta = est.proximo - Date.now();
  const h = Math.floor(falta / 3_600_000);
  const m = Math.ceil((falta % 3_600_000) / 60_000);
  const texto = falta <= 0 ? 'Já há um relatório novo: recarrega a página.'
    : `Próximo relatório daqui a ${h ? `${h} h ` : ''}${m === 60 ? '60' : m} min (meia-noite de Lisboa).`;
  for (const e of $$('.dia-proximo')) e.textContent = texto;
}

function render() {
  if (!est.info || !est.dados) return;
  $('#dia-numero').textContent = `Relatório do Dia #${est.numero}`;
  $('#dia-data').textContent = `${dataPorExtenso(est.data)}${est.data === est.info.data ? '' : ' · dia anterior'}`;
  const f = fichaDoDia();
  renderPainel(f);
  renderFicha(f);
  renderLado();
  renderFim();
  est.novas = new Set();
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

function escolher(chave) {
  est.escolhida = chave;
  $('#dia-erro').textContent = '';
  render();
}

function mostrarErro(e) {
  $('#dia-erro').textContent = e.message;
  sons.erro();
  if (e.fechado) {
    toast('Esse relatório não existe: a abrir o de hoje…', 3000);
    setTimeout(() => location.assign('/dia'), 2500);
  }
}

async function enviarPergunta() {
  const chave = est.escolhida;
  if (!chave) {
    $('#dia-erro').textContent = 'Escolhe uma pergunta da lista.';
    return;
  }
  est.aEnviar = true;
  render();
  try {
    const { r, completos } = await pedir('pergunta', { historico: historico(), chave });
    est.prog.passos.push({ chave, r });
    est.prog.completos = completos ?? {};
    guardarProgresso();
    est.novas = new Set([`${N}:${chave}`, ...(r === 'sem_registo' ? [`${N}:${P.ler(chave).tipo}`] : [])]);
    est.escolhida = null;
    sons.carimbo();
    toast(`${P.texto(chave, est.dados.cat)} → ${RESPOSTAS[r]}`);
  } catch (e) {
    mostrarErro(e);
  } finally {
    est.aEnviar = false;
    render();
  }
}

function abrirCaixa(art, f) {
  const caixa = caixaPalpite(f, {});
  art.append(caixa);
  const input = caixa.querySelector('input');
  input.value = est.palpite.texto;
  const erro = caixa.querySelector('.erro');
  let escolhido = null;
  const descartados = new Set(f.palpites.map((x) => x.nome));
  autocompletar(input, {
    sugerir: (texto) => sugerir(est.dados.indice, texto, 12).filter((j) => !descartados.has(j.nome)).slice(0, 8).map((j) => ({ valor: j.id, nome: j.nome, extra: j.dica })),
    aoEscolher: (op) => {
      escolhido = op;
      input.value = op.nome;
      est.palpite.texto = op.nome;
      erro.textContent = '';
    },
  });
  input.addEventListener('input', () => {
    escolhido = null;
    est.palpite.texto = input.value;
    erro.textContent = '';
  });
  caixa.querySelector('[data-cancelar]').addEventListener('click', () => {
    est.palpite = null;
    caixa.remove();
  });
  caixa.addEventListener('submit', async (e) => {
    e.preventDefault();
    let alvo = escolhido;
    if (!alvo) {
      const r = procurar(est.dados.indice, input.value);
      const nomeDe = (id) => est.dados.nomesPorId.get(id);
      if (r.tipo === 'unico') alvo = { valor: r.id, nome: nomeDe(r.id)?.nome ?? input.value };
      else if (r.tipo === 'ambiguo') {
        erro.textContent = `Há vários com esse nome: ${r.ids.slice(0, 4).map((id) => `${nomeDe(id)?.nome} (${nomeDe(id)?.dica})`).join(', ')}. Escolhe da lista.`;
        input.dispatchEvent(new Event('input'));
        return;
      } else {
        erro.textContent = 'Não encontro esse jogador na base. Escolhe um nome da lista.';
        return;
      }
    }
    if (descartados.has(alvo.nome)) {
      erro.textContent = 'Esse jogador já foi descartado.';
      return;
    }
    est.aEnviar = true;
    caixa.querySelector('[type=submit]').disabled = true;
    try {
      const r = await pedir('palpite', { historico: historico(), jogador: alvo.valor });
      est.palpite = null;
      if (r.certo) {
        est.prog.fim = { certo: true, revelado: r.revelado };
        est.fimEscondido = false;
        sons.identificado();
      } else {
        est.prog.passos.push({ palpite: alvo.valor, nome: alvo.nome });
        sons.erro();
        toast(`«${alvo.nome}» não é: palpite errado.`);
      }
      guardarProgresso();
    } catch (err) {
      erro.textContent = err.message;
      sons.erro();
    } finally {
      est.aEnviar = false;
      render();
    }
  });
  if (document.activeElement === document.body || !document.activeElement) input.focus();
}

async function desistir() {
  if (!confirm(traduzir('Desistir? O jogador é revelado e este relatório fica fechado.'))) return;
  est.aEnviar = true;
  render();
  try {
    const { revelado } = await pedir('desistir', {});
    est.prog.fim = { desistiu: true, revelado };
    est.fimEscondido = false;
    guardarProgresso();
    sons.fim();
  } catch (e) {
    mostrarErro(e);
  } finally {
    est.aEnviar = false;
    render();
  }
}

async function copiarResultado() {
  const texto = textoResumo(est.numero, est.prog.passos, est.prog.fim);
  try {
    await navigator.clipboard.writeText(texto);
    toast('Resultado copiado! Cola-o no Discord.');
  } catch {
    toast(texto, 8000);
  }
}

// ---------------------------------------------------------------------------
// Ligar e abrir
// ---------------------------------------------------------------------------

/** Liga os botões do ecrã (uma vez). `o.toast(texto, ms)`. */
export function ligar(o) {
  toast = o.toast;
  $('#dia-acoes').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!est.aEnviar && !est.prog?.fim) enviarPergunta();
  });
  $('#dia-escolhida .limpar').addEventListener('click', () => escolher(null));
  enterEnvia({ ecra: '#ecra-dia', form: '#dia-acoes', menu: '#dia-categorias', escolhida: () => Boolean(est.escolhida) });
  $('#dia-fichas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-palpite]');
    if (!b || b.disabled || est.palpite) return;
    est.palpite = { texto: '' };
    abrirCaixa(b.closest('.folha'), fichaDoDia());
    b.closest('.folha').querySelector('.caixa-palpite input').focus();
  });
  $('#dia-desistir').addEventListener('click', desistir);
  for (const b of $$('.dia-copiar')) b.addEventListener('click', copiarResultado);
  $('#dia-fim-ver').addEventListener('click', () => {
    est.fimEscondido = true;
    renderFim();
  });
  $('#dia-ver-fim').addEventListener('click', () => {
    est.fimEscondido = false;
    renderFim();
  });
  // Telemóvel: o navegador em baixo salta entre as colunas e acompanha o deslocamento.
  $('#dia-navegador').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ir]');
    if (b) document.getElementById(b.dataset.ir)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  });
  $('#dia-mesa').addEventListener('scroll', () => {
    const x = $('#dia-mesa').getBoundingClientRect().left + 20;
    let melhor = null;
    for (const b of $$('#dia-navegador [data-ir]')) {
      const d = (document.getElementById(b.dataset.ir)?.getBoundingClientRect().left ?? Infinity) - x;
      if (!melhor || Math.abs(d) < Math.abs(melhor.d)) melhor = { b, d };
    }
    for (const b of $$('#dia-navegador [data-ir]')) b.setAttribute('aria-current', String(b === melhor?.b));
  }, { passive: true });
  setInterval(() => !$('#ecra-dia').hidden && renderProximo(), 30_000);
  // Calendário: os meses e os dias (um dia anterior abre-se no endereço /dia/AAAA-MM-DD; o de hoje em /dia).
  $('#dia-cal-antes').addEventListener('click', () => {
    est.mes = somarMeses(est.mes, -1);
    renderCalendario();
  });
  $('#dia-cal-depois').addEventListener('click', () => {
    est.mes = somarMeses(est.mes, 1);
    renderCalendario();
  });
  $('#dia-cal-dias').addEventListener('click', (e) => {
    const b = e.target.closest('[data-data]');
    if (!b || b.disabled || b.dataset.data === est.data) return;
    const d = b.dataset.data;
    history.pushState(null, '', d === est.info.data ? '/dia' : `/dia/${d}`);
    mostrarDia(d);
    // No telemóvel, volta-se à coluna das perguntas.
    if (innerWidth < 960) $('#dia-col-perguntas').scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  });
}

/** Mostra o relatório de uma data (hoje ou um dia anterior): o progresso dela, o menu limpo e o mês dela no calendário. */
function mostrarDia(data) {
  Object.assign(est, { data, numero: numeroDe(data), prog: lerProgresso(data), mes: data.slice(0, 7) });
  Object.assign(est, { escolhida: null, palpite: null, aEnviar: false, fimEscondido: false, novas: new Set() });
  est.fimAnimado = Boolean(est.prog.fim); // quem volta a abrir um relatório acabado não vê o carimbo a cair outra vez
  $('#dia-erro').textContent = '';
  document.title = traduzir(`Scout Report · Relatório do Dia #${est.numero}`);
  render();
}

/** O relatório de hoje: { data, numero, faltaMs, versao }, ou null sem ligação. */
export async function infoDeHoje() {
  try {
    const r = await fetch('/api/dia');
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** Abre o ecrã do Desafio do Dia (o app.js já o mostrou): o relatório de hoje, ou o da `data` do endereço. */
export async function abrir(data = null) {
  const aviso = $('#dia-aviso');
  if (!est.info) {
    $('#dia-categorias').replaceChildren(el('p', { class: 'nota', text: 'A abrir o relatório de hoje…' }));
    const info = await infoDeHoje();
    if (!info) {
      aviso.textContent = 'Sem ligação ao servidor. Recarrega a página para tentares outra vez.';
      aviso.hidden = false;
      return;
    }
    // Um servidor de antes do calendário não manda o dia do lançamento: tira-se do número de hoje.
    info.lancamento ??= new Date(Date.parse(info.data) - (info.numero - 1) * 86_400_000).toISOString().slice(0, 10);
    est.info = info;
    est.proximo = Date.now() + info.faltaMs;
  }
  try {
    est.dados = await carregarDados(est.info.versao);
  } catch {
    aviso.textContent = 'Não consegui carregar as perguntas. Recarrega a página para tentares outra vez.';
    aviso.hidden = false;
    return;
  }
  // Uma data que não se pode jogar (futura, antes do lançamento, inválida) abre o de hoje, em /dia.
  if (data && !jogavel(data)) history.replaceState(null, '', '/dia');
  mostrarDia(jogavel(data) ? data : est.info.data);
}
