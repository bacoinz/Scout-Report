// Ecrã de jogo: cabeçalho (ronda, relógio, Acontecimentos, Classificação, menu), mesa (perguntas, dossier e colunas
// de fichas em acordeão), palpite final, pergunta livre do dono, escolha das cartas e fim. Só lê o estado que o
// servidor manda; as ações saem por `enviar`.
import * as P from './comum/perguntas.js';
import { procurar, sugerir } from './comum/nomes.js';
import { $, $$, el, formatarTempo, plural, miniatura, creditoFoto, enterEnvia } from './util.js';
import { autocompletar } from './autocompletar.js';
import { fichaPublica, caixaPalpite, dossier, dossierVazio } from './ficha.js';
import { menu, descreverEscolhida } from './menu.js';
import { sons } from './sons.js';
import * as joker from './joker.js';

const LARGURA_COLUNA = 245;
const GAP = 14;
const MAX_COLUNAS = 3;

/** Estado da interface (o que não vem do servidor). */
const ui = {
  escolhida: null,
  abertas: new Set(), // as categorias começam todas fechadas
  recente: new Map(), // ficha → instante em que se abriu (a mais recente de cada coluna fica aberta)
  relogio: 0,
  palpite: null, // { n, texto }
  finalEscondido: false,
  ultimaVez: null,
  menuChave: null,
  cartoes: new Map(), // ficha → { chave, el }
  disposicao: null,
  novas: new Set(),
  livreRespondida: null,
};

let enviar = () => false;
let contexto = null; // { eu, sala, privado, cat, indice, nomesPorId }
export function configurar(fn) {
  enviar = fn;
}

const jogadorPorId = (sala, id) => sala.jogadores.find((j) => j.id === id);
const nome = (id) => jogadorPorId(contexto.sala, id)?.nome ?? '?';
const cor = (id) => jogadorPorId(contexto.sala, id)?.cor ?? '#a8a291';
const ponto = (id) => el('span', { class: 'ponto', style: { background: cor(id) } });
const quem = (id) => el('span', { class: 'forte', style: { color: cor(id) }, text: nome(id) });
const doDono = (sala, dono) => sala.partida?.fichas.find((f) => f.dono === dono) ?? null;
const fichaN = (sala, n) => sala.partida?.fichas.find((f) => f.n === n) ?? null;
const euIdentificado = () => Boolean(jogadorPorId(contexto.sala, contexto.eu)?.identificado);

export function toast(texto, ms = 2800) {
  const t = el('div', { class: 'toast', text: texto });
  const caixa = $('#toasts');
  while (caixa.children.length >= 3) caixa.firstElementChild.remove();
  caixa.append(t);
  setTimeout(() => t.remove(), ms);
}

// ---------------------------------------------------------------------------
// Acontecimentos e classificação
// ---------------------------------------------------------------------------

const RESPOSTAS = { sim: 'Sim', nao: 'Não', sem_registo: 'sem registo', nao_sei: 'Não sei' };
const maisPontos = (n) => (n ? ` (+${n})` : '');

function textoFeed(ev) {
  const sistema = (t) => t;
  const cat = contexto.cat;
  switch (ev.tipo) {
    case 'entrou':
      return [quem(ev.jogador), ev.espectador ? ' entrou a ver' : ' entrou'];
    case 'saiu_sala':
      return [`${ev.nome} saiu`];
    case 'anfitriao':
      return [quem(ev.jogador), ' é agora o anfitrião'];
    case 'comecou':
      return [sistema('A partida começou')];
    case 'escolha':
      return [sistema('Cada um escolhe o seu jogador secreto')];
    case 'escolheu':
      return [quem(ev.jogador), ' escolheu o jogador secreto'];
    case 'ronda': {
      const d = ev.desvio;
      return [sistema(`Ronda ${ev.numero}: cada um pergunta a quem está ${d === 1 ? 'a seguir' : `${d} lugares à frente`}`)];
    }
    case 'pergunta':
      return [quem(ev.jogador), ` perguntou «${cat ? P.texto(ev.chave, cat) : ev.chave}» à ficha de `, quem(ev.alvo), ` → ${RESPOSTAS[ev.r]}${maisPontos(ev.pontos)}`];
    case 'livre':
      return [quem(ev.jogador), ` fez a pergunta livre «${ev.texto}» à ficha de `, quem(ev.alvo)];
    case 'livre_resposta':
      return [quem(ev.alvo), ` respondeu a «${ev.texto}» → ${RESPOSTAS[ev.r]}${maisPontos(ev.pontos)}`];
    case 'livre_cancelada':
      return [sistema('A pergunta livre caiu sem resposta: '), quem(ev.jogador), ' recupera a vez'];
    case 'palpite':
      return [quem(ev.jogador), ` deu o palpite final «${ev.nome}» à ficha de `, quem(ev.alvo), ' → errado'];
    case 'identificado':
      return [quem(ev.jogador), ' identificou ', el('span', { class: 'forte', text: ev.nome }), ' na ficha de ', quem(ev.alvo),
        `${maisPontos(ev.pontos)}. `, quem(ev.alvo), ' continua a jogar a receber metade dos pontos.'];
    case 'tempo':
      return [sistema('Acabou o tempo de '), quem(ev.jogador)];
    case 'saltou':
      return [quem(ev.jogador), ' está desligado: a vez passou'];
    case 'saindo':
      return [quem(ev.jogador), ev.desligado ? ' está desligado há 5 minutos e sai da partida' : ' vai sair da partida no fim da ronda'];
    case 'saiu':
      return [quem(ev.jogador), ' saiu', ev.nome ? `: o jogador secreto era ${ev.nome}` : ''];
    case 'promovido':
      return [quem(ev.jogador), ' passou a jogar'];
    case 'joker':
      return [sistema('Ronda Joker sobre a ficha de '), quem(ev.alvo), `: «${joker.textoPergunta(ev.pergunta)}»`];
    case 'joker_valor': {
      const ganhos = Object.entries(ev.pontos).filter(([, n]) => n > 0);
      return [sistema(`Ronda Joker: «${joker.textoPergunta(ev.pergunta)}» → ${ev.valor}`),
        ...(ganhos.length ? ['. ', ...ganhos.flatMap(([id, n], i) => [i ? ', ' : '', quem(id), ` +${n}`])] : [])];
    }
    case 'final':
      return [sistema('Fim da partida')];
    default:
      return [ev.tipo];
  }
}

const SISTEMA = new Set(['comecou', 'escolha', 'ronda', 'livre_cancelada', 'tempo', 'final', 'joker', 'joker_valor']);
function renderFeed(sala) {
  $('#feed').replaceChildren(...[...sala.feed].reverse().map((ev) => el('li', { class: SISTEMA.has(ev.tipo) ? 'sistema' : null }, ...textoFeed(ev))));
}

export function ordenar(jogadores) {
  const lista = [...jogadores].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt'));
  let posicao = 0;
  let anterior = null;
  return lista.map((j, i) => {
    if (j.total !== anterior) posicao = i + 1;
    anterior = j.total;
    return { ...j, posicao };
  });
}

function renderPlacar(sala) {
  const jogam = sala.jogadores.filter((j) => !j.espectador && (!j.saiu || j.total));
  $('#placar').replaceChildren(...ordenar(jogam).map((j) =>
    el('tr', { class: [j.id === contexto.eu ? 'eu' : '', j.ligado ? '' : 'desligado'].filter(Boolean).join(' ') || null },
      el('td', { text: String(j.posicao) }),
      el('td', {}, el('span', { class: 'celula-jogador' }, ponto(j.id),
        el('span', { class: 'nome-jogador', text: `${j.nome}${j.id === contexto.eu ? ' (tu)' : ''}${j.id === sala.anfitriao ? ' 👑' : ''}` }),
        j.identificado ? el('span', { class: 'carimbo no-escuro', style: { '--rot': '-4deg' }, text: 'Identificado' }) : null,
        j.saiu ? el('small', { class: 'nota', text: ' saiu' }) : null)),
      el('td', { class: 'mais', text: j.ronda ? `+${j.ronda}` : '—' }),
      el('td', { class: 'total-celula', text: String(j.total) }))));
  const espectadores = sala.jogadores.filter((j) => j.espectador && !j.saiu).map((j) => j.nome);
  $('#placar-espectadores').textContent = espectadores.length ? `A ver: ${espectadores.join(', ')}.` : '';
}

// ---------------------------------------------------------------------------
// Popups do cabeçalho
// ---------------------------------------------------------------------------

function fecharPopups(excepto) {
  for (const p of $$('.popup')) {
    if (p === excepto || p.hidden || p.classList.contains('a-fechar')) continue;
    document.querySelector(`[aria-controls="${p.id}"]`)?.setAttribute('aria-expanded', 'false');
    p.classList.add('a-fechar');
    setTimeout(() => {
      p.hidden = true;
      p.classList.remove('a-fechar');
    }, 180);
  }
}
export function ligarPopups() {
  for (const b of $$('[data-popup]')) {
    b.addEventListener('click', () => {
      const p = document.getElementById(b.getAttribute('aria-controls'));
      const aberto = !p.hidden && !p.classList.contains('a-fechar');
      fecharPopups(p);
      if (aberto) return fecharPopups();
      // No telemóvel o popup ocupa a largura toda, logo abaixo do cabeçalho.
      p.style.top = innerWidth < 960 ? `${$('.barra-jogo').getBoundingClientRect().bottom + 8}px` : '';
      p.hidden = false;
      b.setAttribute('aria-expanded', 'true');
    });
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.ancora')) fecharPopups();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharPopups();
  });
  for (const b of $$('.popup [data-abrir]')) b.addEventListener('click', () => fecharPopups());
}

// ---------------------------------------------------------------------------
// Painel das perguntas
// ---------------------------------------------------------------------------

/** A ficha a que o painel pergunta: a da vez (se for a minha) ou a do meu alvo nesta ronda (pré-visualização). */
function fichaDoPainel(sala) {
  const p = sala.partida;
  if (!p) return { ficha: null, ativo: false };
  if (p.vez?.jogador === contexto.eu && p.fase === 'vez') return { ficha: fichaN(sala, p.vez.ficha), ativo: true, alvo: p.vez.alvo };
  const alvo = p.alvos?.[contexto.eu];
  return { ficha: alvo ? doDono(sala, alvo) : null, ativo: false, alvo };
}

function renderPainel(sala) {
  const p = sala.partida;
  const eu = jogadorPorId(sala, contexto.eu);
  const { ficha, ativo, alvo } = fichaDoPainel(sala);
  const titulo = $('#acoes-titulo');
  const aviso = $('#acoes-aviso');
  let textoAviso = '';
  if (sala.fase === 'final') {
    titulo.replaceChildren('Fim da partida');
  } else if (!p || p.fase === 'escolha') {
    titulo.replaceChildren('A escolher os jogadores');
    textoAviso = 'Cada um escolhe o seu jogador secreto. A partida começa quando toda a gente escolher.';
  } else if (eu?.espectador) {
    titulo.replaceChildren('Estás a ver');
    textoAviso = 'Entraste a meio: jogas a partir da próxima ronda, com um jogador secreto.';
  } else if (ativo) {
    titulo.replaceChildren('A tua vez ', el('span', { class: 'seta', text: '→' }), ' ', el('span', { class: 'quem' }, ponto(alvo), nome(alvo)));
  } else if (p.vez || p.livre) {
    const v = p.livre ? { jogador: p.livre.autor, alvo: p.livre.alvo } : p.vez;
    titulo.replaceChildren(el('span', { class: 'quem' }, ponto(v.jogador), nome(v.jogador)), ' ', el('span', { class: 'seta', text: '→' }), ' ',
      el('span', { class: 'quem' }, ponto(v.alvo), nome(v.alvo)));
    if (p.livre) textoAviso = p.livre.alvo === contexto.eu ? `Pergunta livre ao teu jogador: «${p.livre.texto}». Responde na janela.`
      : `Pergunta livre: «${p.livre.texto}». À espera da resposta de ${nome(p.livre.alvo)}.`;
    else if (alvo) textoAviso = `O teu próximo palpite é para a ficha de ${nome(alvo)}.`;
  } else if (p.fase === 'identificado') {
    titulo.replaceChildren('Identificado!');
  } else {
    titulo.replaceChildren('À espera…');
  }
  aviso.textContent = textoAviso;
  aviso.hidden = !textoAviso;

  // O menu só se volta a desenhar quando muda a ficha, as respostas dela ou a vez.
  const chave = JSON.stringify([ficha?.n, ficha ? Object.keys(ficha.respostas) : null, ficha?.livres.length, ativo, euIdentificado(), contexto.cat?.versao, p?.vez?.seq]);
  if (chave !== ui.menuChave) {
    ui.menuChave = chave;
    if (ui.escolhida && (!ficha || !ativo || !P.disponivel(ficha, ui.escolhida, contexto.cat))) ui.escolhida = null;
    const categorias = $('#categorias');
    const deslocamento = categorias.scrollTop;
    if (!contexto.cat) categorias.replaceChildren(el('p', { class: 'nota', text: 'A carregar as perguntas…' }));
    else if (!ficha || sala.fase === 'final') categorias.replaceChildren();
    else {
      categorias.replaceChildren(...menu(ficha, {
        cat: contexto.cat, ativo, identificado: euIdentificado(), escolhida: ui.escolhida, abertas: ui.abertas, aoEscolher: escolher,
      }));
    }
    categorias.scrollTop = deslocamento;
  }
  $('#livre').disabled = !ativo;
  $('#btn-enviar').disabled = !ativo;
  const dono = alvo ? jogadorPorId(sala, alvo) : null;
  $('#livre').placeholder = ativo && dono && !dono.ligado ? `${dono.nome} está desligado: só perguntas da lista` : 'Ex.: Jogou com o irmão na mesma equipa?';
  mostrarEscolhida();
}

function escolher(chave) {
  ui.escolhida = chave;
  $('#erro-envio').textContent = '';
  // Volta a desenhar o menu: a escolhida fica marcada no sítio dela (botão, campo ou lista) e só lá.
  ui.menuChave = null;
  if (contexto?.sala) renderPainel(contexto.sala);
  else mostrarEscolhida();
}

function mostrarEscolhida() {
  const barra = $('#escolhida');
  const vazia = !ui.escolhida || !contexto.cat;
  barra.classList.toggle('vazia', vazia);
  if (vazia) {
    barra.querySelector('.texto').textContent = 'Escolhe uma pergunta da lista';
    barra.querySelector('.pts').textContent = '';
    return;
  }
  const d = descreverEscolhida(ui.escolhida, contexto.cat, euIdentificado());
  barra.querySelector('.texto').textContent = d.texto;
  barra.querySelector('.pts').textContent = d.pontos;
}

export function ligarPainel() {
  $('#escolhida .limpar').addEventListener('click', () => escolher(null));
  enterEnvia({ ecra: '#ecra-jogo', form: '#acoes', menu: '#categorias', escolhida: () => Boolean(ui.escolhida) });
  $('#livre').addEventListener('input', () => {
    $('#erro-envio').textContent = '';
  });
  $('#acoes').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = contexto?.sala?.partida;
    if (!p?.vez || p.vez.jogador !== contexto.eu) return;
    const livre = $('#livre').value.trim();
    const erro = $('#erro-envio');
    if (ui.escolhida && livre) {
      erro.textContent = 'Escolhe só uma: a pergunta da lista ou a pergunta livre.';
      return;
    }
    if (!ui.escolhida && !livre) {
      erro.textContent = 'Escolhe uma pergunta da lista ou escreve uma pergunta livre.';
      return;
    }
    if (livre) {
      const dono = jogadorPorId(contexto.sala, p.vez.alvo);
      if (!dono?.ligado) {
        erro.textContent = `${dono?.nome ?? 'O dono'} está desligado: escolhe uma pergunta da lista.`;
        return;
      }
      if (enviar({ t: 'livre', vez: p.vez.seq, texto: livre })) $('#livre').value = '';
    } else if (enviar({ t: 'pergunta', vez: p.vez.seq, chave: ui.escolhida })) {
      escolher(null);
    }
  });
}

// ---------------------------------------------------------------------------
// Fichas: o meu dossier e as colunas dos adversários
// ---------------------------------------------------------------------------

function porqueSemPalpite(sala, f) {
  const p = sala.partida;
  if (f.dono === contexto.eu) return 'Não podes dar palpites à tua própria ficha';
  const falta = P.faltaParaPalpite(f);
  const partes = [];
  if (falta.sim) partes.push(`${plural(falta.sim, '«sim»', '«sim»')}`);
  if (falta.clube) partes.push('um clube confirmado');
  if (partes.length) return `Falta ${partes.join(' e ')}`;
  if (p?.vez?.jogador !== contexto.eu || p.fase !== 'vez') return 'Só na tua vez';
  return '';
}

/** As fichas dos adversários pela ordem da mesa, a começar no seguinte a mim. */
function adversarias(sala) {
  const ids = sala.jogadores.map((j) => j.id);
  const meu = Math.max(0, ids.indexOf(contexto.eu));
  const distancia = (id) => (ids.indexOf(id) - meu + ids.length) % ids.length;
  return (sala.partida?.fichas ?? []).filter((f) => f.dono !== contexto.eu).sort((a, b) => distancia(a.dono) - distancia(b.dono) || a.n - b.n);
}

function colunasPossiveis() {
  const util = $('#mesa').clientWidth - 32 - $('#col-perguntas').offsetWidth - GAP;
  return Math.max(1, Math.floor((util + GAP) / (LARGURA_COLUNA + GAP)) - 1); // -1: o meu dossier
}

function cartao(sala, f, recolhida) {
  const p = sala.partida;
  const porqueNao = porqueSemPalpite(sala, f);
  const opcoes = {
    cat: contexto.cat,
    dono: jogadorPorId(sala, f.dono),
    alvo: p?.vez?.ficha === f.n && p.fase !== 'final',
    recolhida,
    podePalpitar: !porqueNao && P.palpiteDesbloqueado(f) && !f.identificada && !f.revelada,
    porqueNao,
    pontosPalpite: P.comFator(P.PONTOS.palpite, euIdentificado()),
    identificadoAgora: p?.fase === 'identificado' && p.identificado?.ficha === f.n,
    novas: new Set([...ui.novas].filter((k) => k.startsWith(`${f.n}:`))),
    nome,
    cor,
  };
  const chave = JSON.stringify([f, { ...opcoes, cat: null, dono: opcoes.dono?.nome, novas: [...opcoes.novas], nome: null, cor: cor(f.dono) }]);
  const guardado = ui.cartoes.get(f.n);
  if (guardado?.chave === chave) return guardado.el;
  const novo = fichaPublica(f, opcoes);
  if (ui.palpite?.n === f.n) abrirCaixa(novo, f, opcoes);
  ui.cartoes.set(f.n, { chave, el: novo });
  return novo;
}

function renderFichas(sala) {
  const p = sala.partida;
  const contentor = $('#fichas');
  const minha = doDono(sala, contexto.eu);
  const reg = contexto.privado?.dossier;
  const chaveDossier = JSON.stringify([reg?.id, minha ? [P.contarSim(minha), Boolean(minha.identificada)] : null, contexto.cat?.versao, p?.fase === 'escolha']);
  let meu = $('#f-meu');
  if (!meu || meu.dataset.chave !== chaveDossier) {
    const novo = reg && contexto.cat ? dossier(reg, minha, { cat: contexto.cat })
      : dossierVazio(p?.fase === 'escolha' ? 'Escolhe o teu jogador secreto.' : 'Ainda não tens jogador secreto: jogas a partir da próxima ronda.');
    novo.dataset.chave = chaveDossier;
    if (meu) meu.replaceWith(novo);
    else contentor.prepend(novo);
    meu = novo;
  }

  const fichas = adversarias(sala);
  // A ficha da vez (o alvo) e a de quem está a jogar abrem-se na sua coluna.
  if (p?.vez && p.vez.seq !== ui.ultimaVez) {
    ui.ultimaVez = p.vez.seq;
    const doJogador = doDono(sala, p.vez.jogador);
    if (doJogador) ui.recente.set(doJogador.n, ++ui.relogio);
    ui.recente.set(p.vez.ficha, ++ui.relogio);
  }
  const largo = innerWidth >= 960;
  const n = largo ? Math.min(fichas.length, colunasPossiveis(), MAX_COLUNAS) : 0;
  const colunas = Array.from({ length: n }, () => []);
  fichas.forEach((f, i) => colunas[i % n]?.push(f));
  const abertas = new Set(colunas.map((c) => {
    const melhor = c.reduce((m, f) => ((ui.recente.get(f.n) ?? 0) > (ui.recente.get(m.n) ?? 0) ? f : m), c[0]);
    return melhor?.n;
  }));
  const elementos = fichas.map((f) => cartao(sala, f, largo && !abertas.has(f.n)));
  const disposicao = JSON.stringify([largo, colunas.map((c) => c.map((f) => f.n)), [...abertas]]);
  if (disposicao !== ui.disposicao || elementos.some((e) => !e.isConnected)) {
    ui.disposicao = disposicao;
    for (const c of $$('.coluna-fichas', contentor)) c.remove();
    for (const e of $$('.folha.ficha', contentor)) e.remove();
    if (!largo) contentor.append(...elementos);
    else {
      const porN = new Map(fichas.map((f, i) => [f.n, elementos[i]]));
      for (const c of colunas) contentor.append(el('div', { class: 'coluna-fichas' }, ...c.map((f) => porN.get(f.n))));
    }
  }
  // Fichas que já não existem.
  const vivas = new Set(fichas.map((f) => f.n));
  for (const k of ui.cartoes.keys()) if (!vivas.has(k)) ui.cartoes.delete(k);
  renderNavegador(sala, fichas);
}

function renderNavegador(sala, fichas) {
  const nav = $('#navegador');
  const chave = JSON.stringify(fichas.map((f) => [f.n, f.dono]));
  if (nav.dataset.chave === chave) return;
  nav.dataset.chave = chave;
  nav.replaceChildren(
    el('button', { type: 'button', dataset: { ir: 'col-perguntas' }, 'aria-current': 'true', text: 'Perguntar' }),
    el('button', { type: 'button', dataset: { ir: 'f-meu' } }, ponto(contexto.eu), 'O meu'),
    ...fichas.map((f) => el('button', { type: 'button', dataset: { ir: `f-${f.n}` } }, ponto(f.dono), nome(f.dono))));
}

function abrirCaixa(art, f, opcoes) {
  art.querySelector('.caixa-palpite')?.remove();
  const caixa = caixaPalpite(f, opcoes);
  art.append(caixa);
  const input = caixa.querySelector('input');
  input.value = ui.palpite?.texto ?? '';
  const erro = caixa.querySelector('.erro');
  let escolhido = null;
  const conhecidos = contexto.sala.config.jogadores === 'conhecidos';
  const descartados = new Set(f.palpites.map((x) => x.nome));
  const doJogo = (j) => (!conhecidos || j.conhecido) && !descartados.has(j.nome);
  autocompletar(input, {
    sugerir: (texto) => sugerir(contexto.indice, texto, 12).filter(doJogo).slice(0, 8).map((j) => ({ valor: j.id, nome: j.nome, extra: j.dica })),
    aoEscolher: (op) => {
      escolhido = op;
      input.value = op.nome;
      ui.palpite.texto = op.nome;
      erro.textContent = '';
    },
  });
  input.addEventListener('input', () => {
    escolhido = null;
    ui.palpite.texto = input.value;
    erro.textContent = '';
  });
  caixa.querySelector('[data-cancelar]').addEventListener('click', () => {
    ui.palpite = null;
    caixa.remove();
  });
  caixa.addEventListener('submit', (e) => {
    e.preventDefault();
    const p = contexto.sala.partida;
    if (!p?.vez || p.vez.jogador !== contexto.eu) {
      erro.textContent = 'Só na tua vez.';
      return;
    }
    let alvo = escolhido;
    if (!alvo) {
      const r = procurar(contexto.indice, input.value);
      if (r.tipo === 'unico') alvo = { valor: r.id, nome: contexto.nomesPorId.get(r.id)?.nome ?? input.value };
      else if (r.tipo === 'ambiguo') {
        erro.textContent = `Há vários com esse nome: ${r.ids.slice(0, 4).map((id) => `${contexto.nomesPorId.get(id)?.nome} (${contexto.nomesPorId.get(id)?.dica})`).join(', ')}. Escolhe da lista.`;
        input.dispatchEvent(new Event('input'));
        return;
      } else {
        erro.textContent = 'Não encontro esse jogador na base. Escolhe um nome da lista.';
        return;
      }
    }
    if (f.palpites.some((x) => x.nome === alvo.nome)) {
      erro.textContent = 'Esse jogador já foi descartado nesta ficha.';
      return;
    }
    if (enviar({ t: 'palpite', vez: p.vez.seq, ficha: f.n, jogador: alvo.valor, nome: alvo.nome })) {
      ui.palpite = null;
      caixa.remove();
    }
  });
  if (document.activeElement === document.body || !document.activeElement) input.focus();
}

export function ligarFichas() {
  const contentor = $('#fichas');
  contentor.addEventListener('click', (e) => {
    const palpite = e.target.closest('[data-palpite]');
    if (palpite && !palpite.disabled) {
      const n = Number(palpite.dataset.palpite);
      const f = fichaN(contexto.sala, n);
      const art = palpite.closest('.folha');
      ui.palpite = { n, texto: '' };
      abrirCaixa(art, f, { dono: jogadorPorId(contexto.sala, f.dono), pontosPalpite: P.comFator(P.PONTOS.palpite, euIdentificado()) });
      art.querySelector('.caixa-palpite input').focus();
      return;
    }
    const botao = e.target.closest('[data-recolher]');
    const topo = e.target.closest('.folha.recolhida .folha-topo');
    if (!botao && !topo) return;
    const art = (botao || topo).closest('.folha');
    const n = Number(art.dataset.ficha);
    if (botao && !art.classList.contains('recolhida')) ui.recente.set(n, 0);
    else ui.recente.set(n, ++ui.relogio);
    renderFichas(contexto.sala);
  });
  // Telemóvel: o navegador em baixo salta para cada coluna e acompanha o deslocamento.
  $('#navegador').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ir]');
    if (b) document.getElementById(b.dataset.ir)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  });
  $('#mesa').addEventListener('scroll', () => {
    const x = $('#mesa').getBoundingClientRect().left + 20;
    const botoes = $$('#navegador [data-ir]');
    let melhor = null;
    for (const b of botoes) {
      const alvo = document.getElementById(b.dataset.ir);
      if (alvo && (!melhor || Math.abs(alvo.getBoundingClientRect().left - x) < Math.abs(melhor.d))) melhor = { b, d: alvo.getBoundingClientRect().left - x };
    }
    for (const b of botoes) b.setAttribute('aria-current', String(b === melhor?.b));
  }, { passive: true });
  addEventListener('resize', () => contexto?.sala && renderFichas(contexto.sala));
}

// ---------------------------------------------------------------------------
// Sobreposições: cartas, pergunta livre do dono, fim
// ---------------------------------------------------------------------------

function renderEscolha(sala) {
  const cartas = contexto.privado?.cartas;
  const p = sala.partida;
  const caixa = $('#escolha');
  const mostrar = Boolean(cartas && !cartas.escolhida && sala.fase === 'jogo');
  const esperar = p?.fase === 'escolha' && !mostrar;
  caixa.hidden = !mostrar && !esperar;
  if (caixa.hidden) return;
  const jogam = sala.jogadores.filter((j) => !j.espectador && !j.saiu);
  $('#escolha-espera').hidden = !esperar;
  $('#escolha-espera').textContent = `À espera dos outros (${jogam.filter((j) => j.escolheu).length}/${jogam.length})…`;
  $('#escolha-nota').textContent = p?.fase === 'escolha'
    ? 'Os outros vão tentar descobri-lo. Quem não escolher a tempo fica com uma das cartas ao calhas.'
    : 'Jogas a partir da próxima ronda com o jogador que escolheres.';
  const chave = JSON.stringify([cartas?.ids, esperar]);
  if ($('#escolha-cartas').dataset.chave === chave) return;
  $('#escolha-cartas').dataset.chave = chave;
  $('#escolha-cartas').replaceChildren(...(mostrar ? cartas.resumos : []).map((c) =>
    el('li', { class: 'carta papel' },
      el('div', { class: 'moldura' }, c.foto?.url ? el('img', { src: miniatura(c.foto.url), alt: c.nome, title: creditoFoto(c.foto), referrerpolicy: 'no-referrer' }) : null),
      el('h3', { class: 'folha-nome', text: c.nome }),
      el('p', { class: 'texto-maquina', text: c.dica }),
      el('p', { class: 'nota', text: [c.posicao.especificas.join(', '), c.clubes.join(' · ')].filter(Boolean).join(' · ') }),
      el('button', { class: 'btn btn-principal', type: 'button', onclick: () => enviar({ t: 'carta', jogador: c.id }) }, 'Escolher'))));
}

function renderLivre(sala) {
  const d = $('#dialogo-livre');
  const l = sala.partida?.livre;
  const minha = sala.fase === 'jogo' && sala.partida?.fase === 'livre' && l?.alvo === contexto.eu;
  if (minha && !d.open && ui.livreRespondida !== `${l.autor}:${l.prazo}`) {
    $('#livre-quem').textContent = `${nome(l.autor)} pergunta sobre o teu jogador:`;
    $('#livre-texto').textContent = `«${l.texto}»`;
    d.dataset.livre = `${l.autor}:${l.prazo}`;
    d.show();
  }
  if (!minha && d.open) d.close();
}

export function ligarLivre() {
  for (const b of $$('#dialogo-livre [data-resposta]')) {
    b.addEventListener('click', () => {
      ui.livreRespondida = $('#dialogo-livre').dataset.livre;
      enviar({ t: 'responder_livre', resposta: b.dataset.resposta });
      $('#dialogo-livre').close();
    });
  }
  // Fechar com Esc não responde: a janela volta a abrir enquanto a pergunta estiver por responder.
  $('#dialogo-livre').addEventListener('cancel', (e) => e.preventDefault());
}

export function mostrarFinal(mostrar) {
  ui.finalEscondido = !mostrar;
  if (contexto?.sala) renderFinal(contexto.sala);
}

function renderFinal(sala) {
  const fim = sala.fase === 'final';
  if (!fim) ui.finalEscondido = false;
  $('#final').hidden = !fim || ui.finalEscondido;
  $('#btn-ver-final').hidden = !fim || !ui.finalEscondido;
  if (!fim) return;
  const lista = ordenar(sala.jogadores.filter((j) => !j.espectador && (!j.saiu || j.total)));
  const ordemPodio = [lista[1], lista[0], lista[2]];
  $('#podio').replaceChildren(...ordemPodio.map((j, i) => {
    if (!j) return el('li');
    const lugar = [2, 1, 3][i];
    return el('li', { class: `degrau p${lugar}` },
      el('span', { class: 'quem' }, ponto(j.id), j.nome),
      el('span', { class: 'pts', text: plural(j.total, 'ponto', 'pontos') }),
      el('span', { class: 'bloco', text: String(j.posicao) }));
  }));
  $('#final-tabela').replaceChildren(...lista.map((j) => {
    const f = doDono(sala, j.id);
    return el('tr', {},
      el('td', { text: String(j.posicao) }),
      el('td', {}, el('span', { class: 'celula-jogador' }, ponto(j.id), `${j.nome}${j.id === contexto.eu ? ' (tu)' : ''}`)),
      el('td', {}, f?.revelada?.nome ?? '—', f?.identificada ? el('small', { class: 'nota', text: ` · por ${nome(f.identificada.por)}` }) : null),
      el('td', { text: String(j.total) }));
  }));
  const anfitriao = sala.anfitriao === contexto.eu;
  $('#btn-novo').hidden = !anfitriao;
  $('#final-espera').hidden = anfitriao;
}

// ---------------------------------------------------------------------------
// Cabeçalho e relógio
// ---------------------------------------------------------------------------

function renderCabecalho(sala) {
  const p = sala.partida;
  $('#menu-codigo').textContent = sala.codigo;
  if (!p) return;
  $('#jogo-ronda').dataset.base = p.fase === 'escolha' ? 'Escolha' : `Ronda ${p.ronda}`;
}

/** O relógio da vez (ou da pergunta livre, ou da escolha) e a linha do tempo. */
export function tick(agora) {
  if (contexto?.sala) joker.tick({ sala: contexto.sala, agora });
  const sala = contexto?.sala;
  const p = sala?.partida;
  if (!p || sala.fase !== 'jogo') {
    $('#relogio').textContent = '';
    $('#barra-tempo').style.width = '0%';
    if (p) $('#jogo-ronda').textContent = $('#jogo-ronda').dataset.base ?? '';
    return null;
  }
  let prazo = null;
  let duracao = 1;
  if (p.congelada) prazo = null;
  else if (p.fase === 'livre' && p.livre) [prazo, duracao] = [p.livre.prazo, 30_000];
  else if (p.fase === 'escolha' && p.escolha) [prazo, duracao] = [p.escolha.prazo, 30_000];
  else if ((p.fase === 'joker' || p.fase === 'revelacao') && p.joker) [prazo, duracao] = [p.joker.prazo, p.joker.prazo - p.joker.abre];
  else if (p.vez) [prazo, duracao] = [p.vez.prazo, p.vez.duracao];
  const falta = prazo ? Math.max(0, prazo - agora) : 0;
  $('#relogio').textContent = p.congelada ? '⏸' : prazo ? formatarTempo(falta) : '';
  $('#barra-tempo').style.width = prazo ? `${Math.min(100, (falta / duracao) * 100)}%` : '0%';
  $('#jogo-ronda').textContent = $('#jogo-ronda').dataset.base ?? '';
  return p.vez?.jogador === contexto.eu && p.fase === 'vez' ? falta : null;
}

// ---------------------------------------------------------------------------
// Acontecimentos novos: carimbos, toasts e sons
// ---------------------------------------------------------------------------

function anunciar(sala, novos) {
  ui.novas = new Set();
  const cat = contexto.cat;
  for (const ev of novos) {
    const comigo = ev.alvo === contexto.eu || ev.jogador === contexto.eu;
    if (ev.tipo === 'pergunta') {
      const tipo = P.ler(ev.chave)?.tipo;
      ui.novas.add(`${ev.ficha}:${ev.chave}`);
      if (ev.r === 'sem_registo') ui.novas.add(`${ev.ficha}:${tipo}`);
      sons.carimbo();
      if (ev.jogador === contexto.eu) toast(`${cat ? P.texto(ev.chave, cat) : ''} → ${RESPOSTAS[ev.r]}${ev.r === 'sem_registo' ? ': escolhe outra pergunta' : maisPontos(ev.pontos)}`);
    } else if (ev.tipo === 'livre_resposta') {
      sons.carimbo();
      if (comigo) toast(`«${ev.texto}» → ${RESPOSTAS[ev.r]}${maisPontos(ev.pontos)}`);
    } else if (ev.tipo === 'livre') {
      if (ev.alvo === contexto.eu) sons.livre();
    } else if (ev.tipo === 'livre_cancelada' && comigo) {
      toast(ev.jogador === contexto.eu ? 'Ficou sem resposta: recuperas a vez.' : 'A pergunta livre caiu sem resposta.');
    } else if (ev.tipo === 'palpite' && comigo) {
      sons.erro();
      toast(ev.jogador === contexto.eu ? `«${ev.nome}» não é: palpite errado.` : `${nome(ev.jogador)} achou que o teu jogador era ${ev.nome}.`);
    } else if (ev.tipo === 'identificado') {
      sons.identificado();
      ui.recente.set(ev.ficha, ++ui.relogio);
      toast(ev.alvo === contexto.eu ? `${nome(ev.jogador)} identificou o teu jogador! Continuas a jogar a receber metade dos pontos.`
        : `${nome(ev.jogador)} identificou ${ev.nome}!`, 4000);
    } else if (ev.tipo === 'tempo' && ev.jogador === contexto.eu) {
      toast('Acabou o teu tempo.');
    } else if (ev.tipo === 'promovido' && ev.jogador === contexto.eu) {
      toast('Agora estás a jogar!');
    } else if (ev.tipo === 'anfitriao' && ev.jogador === contexto.eu) {
      toast('Agora és tu o anfitrião.');
    } else if (ev.tipo === 'final') {
      sons.fim();
    }
  }
  const p = sala.partida;
  if (p?.vez?.jogador === contexto.eu && p.fase === 'vez' && ui.avisada !== p.vez.seq) {
    ui.avisada = p.vez.seq;
    sons.vez();
    if (!novos.some((ev) => ev.tipo === 'pergunta' && ev.jogador === contexto.eu)) toast(`É a tua vez → ficha de ${nome(p.vez.alvo)}`);
  }
}

// ---------------------------------------------------------------------------
// Tudo
// ---------------------------------------------------------------------------

/** Desenha o ecrã de jogo com o estado novo. `ctx`: { eu, sala, privado, cat, indice, nomesPorId }; `novos`: eventos. */
export function render(ctx, novos) {
  contexto = ctx;
  const { sala } = ctx;
  if (sala.partida?.fase === 'escolha' || !sala.partida) ui.palpite = null;
  anunciar(sala, novos);
  renderCabecalho(sala);
  renderFeed(sala);
  renderPlacar(sala);
  renderPainel(sala);
  renderFichas(sala);
  renderEscolha(sala);
  renderLivre(sala);
  renderFinal(sala);
  joker.render({ sala, eu: ctx.eu, privado: ctx.privado, cat: ctx.cat, nome, cor, agora: Date.now() + (ctx.desvio ?? 0) });
}

/** Uma partida nova (ou outra sala): esquece o estado da interface. */
export function reiniciar() {
  ui.abertas.clear();
  Object.assign(ui, { escolhida: null, palpite: null, finalEscondido: false, ultimaVez: null, menuChave: null, disposicao: null, livreRespondida: null, avisada: null });
  ui.recente.clear();
  ui.cartoes.clear();
  ui.novas = new Set();
  $('#livre').value = '';
  for (const e of $$('#fichas > *')) e.remove();
}
