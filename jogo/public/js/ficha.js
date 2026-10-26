// Fichas de olheiro: a ficha pública de cada jogador secreto (o que já se sabe, a partir das respostas), a ficha
// revelada (identificado, quem saiu, fim) e o dossier do meu jogador (o registo todo). Só desenha.
import * as P from './comum/perguntas.js';
import { el, rotacao, epocas, data, miniatura, creditoFoto, plural } from './util.js';

const INCOGNITA = '????';
const incognita = () => el('span', { class: 'incognita', text: INCOGNITA });
const juntar = (partes, sep = ' · ') => partes.flatMap((p, i) => (i ? [sep, p] : [p]));
const linhaDados = (rotulo, ...conteudo) => el('div', {}, el('dt', { text: rotulo }), el('dd', {}, ...conteudo));
const PES = { direito: 'destro', esquerdo: 'canhoto', ambos: 'ambidestro' };
const semArtigo = (t) => t.replace(/^(o|a|os|as|um|uma) /, '');
/** "o Mundial de Clubes (ou a Taça Intercontinental)" → "Mundial de Clubes"; "o prémio de Melhor…" → "Melhor…". */
export const nomePremio = (id) => semArtigo(P.PREMIOS[id]?.nome ?? id).replace(/ \(ou [^)]*\)$/, '').replace(/^prémio de /, '')
  .replace(/^./, (c) => c.toUpperCase());

/** Carimbo pequeno ("Confirmado", "Sem registo"), com rotação fixa; "novo" anima-o. */
const carimbo = (classe, texto, chave, novo) =>
  el('span', { class: `carimbo mini ${classe}${novo ? ' novo' : ''}`, style: { '--rot': rotacao(chave) }, text: texto });

// ---------------------------------------------------------------------------
// O que já se sabe de uma ficha
// ---------------------------------------------------------------------------

/** Os valores de um tipo com ✓ (dados ou deduzidos), pela ordem em que foram respondidos. */
function confirmados(f, tipo) {
  const prefixo = `${tipo}:`;
  const vistos = new Set();
  for (const k of Object.keys(f.respostas)) {
    if (k.startsWith(prefixo) && P.valor(f, k) === 'sim') vistos.add(k.slice(prefixo.length));
  }
  return [...vistos];
}
const temSemRegisto = (f, tipo) => Object.entries(f.respostas).some(([k, v]) => k.startsWith(`${tipo}:`) && v.r === 'sem_registo');

/** "mais de N" já conhecido: { min (o maior ✓), max (o menor ✗) }. */
function intervalo(f, tipo) {
  let min = null;
  let max = null;
  for (const n of P.limiaresDe(tipo)) {
    const v = P.valor(f, `${tipo}:${n}`);
    if (v === 'sim') min = Math.max(min ?? -Infinity, n);
    if (v === 'nao') max = Math.min(max ?? Infinity, n);
  }
  return { min, max };
}
function textoIntervalo({ min, max }, formatar = String) {
  if (min != null && max != null) return `${formatar(min)}–${formatar(max)}`;
  if (min != null) return `+${formatar(min)}`;
  if (max != null) return `≤${formatar(max)}`;
  return null;
}
const metros = (cm) => `${(cm / 100).toFixed(2).replace('.', ',')} m`;

/** Valor de um dado: o texto, ou SEM REGISTO, ou ????. */
function dado(texto, f, tipos, ctx) {
  if (texto) return [texto];
  const sr = tipos.find((t) => temSemRegisto(f, t));
  if (sr) return [carimbo('sem-registo', 'Sem registo', `${f.n}:${sr}`, ctx.novas.has(`${f.n}:${sr}`))];
  return [incognita()];
}

/** Um valor revelado na Ronda Joker, com a etiqueta. */
const daJoker = (f, campo) => (Number.isInteger(f.valores?.[campo]) ? [String(f.valores[campo]), ' ', el('span', { class: 'tag-joker', text: 'Joker' })] : null);

function dadosPublicos(f, ctx) {
  const decadas = confirmados(f, 'decada');
  const anos = confirmados(f, 'ano');
  const estreia = anos.length ? anos[0] : decadas.length ? `anos ${decadas[0] < 2000 ? String(decadas[0]).slice(2) : decadas[0]}` : null;
  const confs = confirmados(f, 'conf').map((c) => P.CONFEDERACOES[c].nome);
  const nacs = confirmados(f, 'nac').map(P.nomePais);
  const setores = confirmados(f, 'setor').map((s) => P.SETORES[s]);
  const posicoes = confirmados(f, 'pos').map((p) => P.POSICOES[p].nome);
  const baixo = P.valor(f, 'baixo:175') === 'sim' ? `-${metros(175)}` : null;
  const altura = baixo ?? textoIntervalo(intervalo(f, 'altura'), metros);
  const pe = confirmados(f, 'pe').map((p) => PES[p]);
  const estado = P.valor(f, 'ativo') === 'sim' ? 'No ativo' : P.valor(f, 'retirado') === 'sim' ? 'Retirado'
    : P.valor(f, 'treinador') === 'sim' ? (P.valor(f, 't_atual') === 'sim' ? 'Treinador (treina atualmente)' : 'Treinador') : null;
  const comFalta = (partes, completo) => (partes.length ? juntar([...partes, ...(completo ? [] : [incognita()])]) : [incognita()]);
  return el('dl', { class: 'folha-dados' },
    linhaDados('Estreia', ...(daJoker(f, 'estreia') ?? (estreia ? (anos.length ? [estreia] : juntar([estreia, incognita()])) : [incognita()]))),
    linhaDados('Nação', ...comFalta([...confs, ...nacs], nacs.length > 0)),
    linhaDados('Posição', ...comFalta([...setores, ...posicoes], posicoes.length > 0)),
    linhaDados('Físico', ...(altura || pe.length ? juntar([altura, ...pe].filter(Boolean)) : dado(null, f, ['altura', 'baixo', 'pe'], ctx))),
    linhaDados('Estado', ...(estado ? [estado] : [incognita()])));
}

/**
 * Carreira: os clubes e os países confirmados, e uma linha ???? enquanto não estiverem todos encontrados (o servidor
 * marca-o em `completos`).
 */
function carreiraPublica(f, ctx) {
  const cat = ctx.cat;
  const clubes = confirmados(f, 'clube');
  const paises = confirmados(f, 'pais');
  const novo = (k) => ctx.novas.has(`${f.n}:${k}`);
  const novoPais = (p) => (novo(`pais:${p}`) ? carimbo('confirmado', 'Confirmado', `pais:${p}`, true) : null);
  const linhas = [];
  const paisesUsados = new Set();
  for (const c of clubes) {
    const pais = cat.clubes[c]?.pais;
    if (pais) paisesUsados.add(pais);
    linhas.push(el('tr', {},
      el('td', {}, P.nomeClube(cat, c), novo(`clube:${c}`) ? carimbo('confirmado', 'Confirmado', `clube:${c}`, true) : null),
      el('td', { class: 'esq' }, pais ? P.nomePais(pais) : incognita(), pais ? novoPais(pais) : null)));
  }
  for (const p of paises) {
    if (paisesUsados.has(p)) continue;
    linhas.push(el('tr', {},
      el('td', {}, incognita()),
      el('td', { class: 'esq' }, P.nomePais(p), novoPais(p))));
  }
  const todos = f.completos ?? {};
  if (!todos.clube || !todos.pais) {
    linhas.push(el('tr', {}, el('td', {}, todos.clube ? '' : incognita()), el('td', { class: 'esq' }, todos.pais ? '' : incognita())));
  }
  return el('section', {},
    el('h4', { text: 'Carreira' }),
    el('table', { class: 'tabela-carreira' },
      el('thead', {}, el('tr', {}, el('th', { text: 'Clube' }), el('th', { class: 'esq', text: 'País' }))),
      el('tbody', {}, ...linhas)),
);
}

function estatisticasPublicas(f, ctx) {
  const numeros = confirmados(f, 'num');
  const faixas = confirmados(f, 'faixa').map((i) => {
    const [a, b] = P.FAIXAS_NUMEROS[Number(i)];
    return b >= 99 ? `${a}+` : `${a}-${b}`;
  });
  const camisola = numeros.length ? `n.º ${numeros.join(', ')}` : faixas.length ? faixas.join(' · ') : null;
  return el('section', {},
    el('h4', { text: 'Estatísticas' }),
    el('dl', { class: 'estatisticas' },
      linhaDados('Jogos', ...(daJoker(f, 'jogos') ?? dado(textoIntervalo(intervalo(f, 'jogos')), f, [], ctx))),
      linhaDados('Golos', ...(daJoker(f, 'golos') ?? dado(textoIntervalo(intervalo(f, 'golos')), f, [], ctx))),
      linhaDados('Assist.', ...dado(textoIntervalo(intervalo(f, 'assist')), f, ['assist'], ctx)),
      linhaDados('Seleção', ...(daJoker(f, 'inter') ?? dado(textoIntervalo(intervalo(f, 'inter')), f, [], ctx))),
      daJoker(f, 'golos_selecao') ? linhaDados('Golos sel.', ...daJoker(f, 'golos_selecao')) : null,
      daJoker(f, 'clubes') ? linhaDados('Clubes', ...daJoker(f, 'clubes')) : null,
      linhaDados('Camisola', ...dado(camisola, f, ['num', 'faixa'], ctx))));
}

function premiosPublicos(f) {
  const ganhos = confirmados(f, 'premio').map(nomePremio);
  return el('section', {},
    el('h4', { text: 'Prémios' }),
    ganhos.length ? el('ul', { class: 'lista-folha' }, el('li', { text: [...ganhos, INCOGNITA].join(' · ') }))
      : el('p', { class: 'texto-maquina incognita', text: INCOGNITA }));
}

function treinadorPublico(f, ctx) {
  if (P.valor(f, 'treinador') !== 'sim') return null;
  const cat = ctx.cat;
  const treinou = [
    ...confirmados(f, 't_pais').map(P.nomePais),
    ...confirmados(f, 't_clube').map((c) => P.nomeClube(cat, c)),
    ...confirmados(f, 't_sel').map((p) => `seleção ${P.dePais(p)}`),
  ];
  const titulos = textoIntervalo(intervalo(f, 't_titulos'));
  const premios = confirmados(f, 't_premio').map(nomePremio);
  const tit = [titulos && titulos !== '+0' ? `${titulos} títulos` : titulos === '+0' ? 'tem títulos' : null, ...premios].filter(Boolean);
  return el('section', {},
    el('h4', { text: 'Treinador' }),
    el('dl', { class: 'estatisticas', style: { gridTemplateColumns: '1fr' } },
      linhaDados('Treinou', ...(treinou.length ? juntar([...treinou, incognita()]) : [incognita()])),
      daJoker(f, 't_equipas') ? linhaDados('Equipas', ...daJoker(f, 't_equipas')) : null,
      linhaDados('Títulos', ...(daJoker(f, 't_titulos') ?? (tit.length ? juntar([...tit, incognita()]) : [incognita()])))));
}

/**
 * Os dados conhecidos de uma ficha para a ficha técnica da Joker, a começar pelos mais relevantes para a pergunta
 * (para os jogos da seleção: a estreia, a nação e a posição).
 */
export function dadosParaJoker(f, pergunta, ctx) {
  const todos = [...dadosPublicos(f, ctx).children];
  const por = Object.fromEntries(todos.map((d) => [d.querySelector('dt').textContent, d]));
  const extra = { jogos: ['Jogos', 'jogos'], golos: ['Golos', 'golos'], inter: ['Seleção', 'inter'], golos_selecao: ['Seleção', 'inter'],
    t_titulos: ['Títulos', 't_titulos'] }[pergunta];
  const linhas = [];
  if (extra) {
    const texto = textoIntervalo(intervalo(f, extra[1]));
    linhas.push(linhaDados(extra[0], ...(texto ? [texto] : [incognita()])));
  }
  const ordem = pergunta === 'estreia' ? ['Nação', 'Posição', 'Estado'] : ['Estreia', 'Nação', 'Posição', 'Estado'];
  for (const k of ordem) if (por[k] && linhas.length < 4) linhas.push(por[k]);
  return el('dl', { class: 'folha-dados' }, ...linhas);
}

function notasExtra(f, ctx) {
  if (!f.livres.length) return null;
  const textos = { sim: 'Sim', nao: 'Não', nao_sei: 'Não sei' };
  return el('section', {},
    el('h4', { text: 'Notas extra' }),
    el('ul', { class: 'notas' }, ...f.livres.map((l) =>
      el('li', {}, `${l.texto} `, el('span', { class: `resposta-livre ${l.r.replace('_', '-')}`, text: textos[l.r] }),
        ' ', el('span', { class: 'autor', text: `— ${ctx.nome(l.autor)}` })))));
}

function descartadas(f, ctx) {
  const itens = [
    ...Object.entries(f.respostas).filter(([, v]) => v.r === 'nao').map(([k, v]) => [P.afirmacao(k, ctx.cat), v.autor]),
    ...f.palpites.map((p) => [`Palpite final: ${p.nome}`, p.autor]),
  ];
  if (!itens.length) return null;
  return el('section', { class: 'descartadas' },
    el('h4', { text: 'Informações descartadas' }),
    el('ul', {}, ...itens.map(([t, autor]) => el('li', {}, el('span', { text: t }), el('span', { class: 'autor', text: ctx.nome(autor) })))));
}

// ---------------------------------------------------------------------------
// Peças comuns
// ---------------------------------------------------------------------------

function retrato(foto, nome) {
  if (!foto?.url) return el('figure', { class: 'folha-foto' }, el('div', { class: 'moldura desconhecida' }, silhueta()));
  return el('figure', { class: 'folha-foto' },
    el('div', { class: 'moldura' }, el('img', { src: miniatura(foto.url), alt: nome, title: creditoFoto(foto), loading: 'lazy', referrerpolicy: 'no-referrer' })));
}
function silhueta() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '64');
  svg.setAttribute('height', '80');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-silhueta');
  svg.append(use);
  return svg;
}

/** Os seis quadrados dos "sim" (quanto já se sabe de uma ficha). */
export function contadorSim(n, titulo) {
  return el('span', { class: 'contador-sim', title: titulo, 'aria-label': titulo },
    el('span', { class: 'caixas' }, ...Array.from({ length: P.SIM_MINIMOS }, (_, i) => el('i', { class: i < n ? 'sim' : null }))));
}

/** Dados de um jogador já conhecido (revelado ou o meu): nascimento, nação, posição, físico, estado. */
function dadosRegisto(reg) {
  const nacoes = reg.nacionalidades.map((c) => `${P.nomePais(c)}${P.PAISES[c]?.confederacao ? ` (${P.CONFEDERACOES[P.PAISES[c].confederacao].nome})` : ''}`);
  const fisico = [reg.perfil?.altura_cm ? metros(reg.perfil.altura_cm) : null, PES[reg.perfil?.pe] ?? null].filter(Boolean);
  const ultimoAno = Math.max(...reg.carreira.map((c) => c.fim ?? 0));
  // O mesmo que a resposta ao Estado: no ativo, treinador (já não joga) ou retirado.
  const atual = reg.treinador?.atual;
  const agora = reg.estado === 'ativo' ? `No ativo${reg.clube_atual ? '' : ' (sem clube)'}`
    : reg.treinador ? `Treinador${atual ? ` (${atual.tipo === 'selecao' ? `seleção ${P.dePais(atual.pais)}` : atual.nome})` : ''}${ultimoAno ? ` · deixou de jogar em ${ultimoAno}` : ''}`
      : `Retirado${ultimoAno ? ` (${ultimoAno})` : ''}`;
  const estado = `${agora}${reg.estreia ? ` · estreou-se em ${reg.estreia}` : ''}`;
  const naturalidade = reg.perfil?.naturalidade?.split(',')[0];
  return el('dl', { class: 'folha-dados' },
    linhaDados('Nasceu', `${data(reg.nascimento)}${naturalidade ? ` · ${naturalidade}` : ''}`),
    linhaDados('Nação', nacoes.join(' · ') || '—'),
    linhaDados('Posição', [reg.posicao.setores.map((s) => P.SETORES[s]).join(' / '), reg.posicao.especificas.join(', ')].filter(Boolean).join(' · ')),
    linhaDados('Físico', fisico.join(' · ') || 'sem registo'),
    linhaDados('Estado', estado));
}

function carreiraRegisto(reg, cat, completa) {
  const ativo = reg.estado === 'ativo';
  const cabeca = completa ? ['Clube', 'Épocas', 'J', 'G', 'A', 'N.º'] : ['Clube', 'País', 'Épocas'];
  const linhas = reg.carreira.map((c, i) => {
    const pais = c.paises_liga.length ? c.paises_liga.map(P.nomePais).join(', ') : '—';
    const ep = epocas(c.inicio, c.fim, ativo && i === reg.carreira.length - 1);
    const nome = `${c.nome}${c.emprestimo ? ' (emp.)' : ''}`;
    if (!completa) return el('tr', {}, el('td', { text: nome }), el('td', { class: 'esq', text: pais }), el('td', { text: ep }));
    return el('tr', {},
      el('td', {}, nome, el('small', { text: pais })),
      el('td', { text: ep }),
      el('td', { text: c.jogos ?? '—' }),
      el('td', { text: c.golos ?? '—' }),
      el('td', { text: c.assistencias != null ? `≃${c.assistencias}` : '—' }),
      el('td', { text: c.numeros?.length ? c.numeros.join(', ') : '—' }));
  });
  if (completa) {
    for (const s of reg.selecoes) {
      linhas.push(el('tr', {},
        el('td', {}, P.nomePais(s.pais), el('small', { text: 'seleção' })),
        el('td', { text: epocas(s.inicio, s.fim, false) }),
        el('td', { text: s.jogos ?? '—' }),
        el('td', { text: s.golos ?? '—' }),
        el('td', { text: '—' }),
        el('td', { text: s.numeros?.length ? s.numeros.join(', ') : '—' })));
    }
    const t = reg.totais;
    const assist = t.assistencias;
    linhas.push(el('tr', { class: 'total' },
      el('td', { text: 'Total' }),
      el('td', { text: '' }),
      el('td', { text: t.jogos }),
      el('td', { text: t.golos }),
      el('td', { text: `≃${assist.conhecidas}` }),
      el('td', { text: '' })));
  }
  return el('section', {},
    el('h4', { text: 'Carreira' }),
    el('table', { class: 'tabela-carreira' },
      el('thead', {}, el('tr', {}, ...cabeca.map((t, i) => el('th', { class: !completa && i === 1 ? 'esq' : null, text: t })))),
      el('tbody', {}, ...linhas)));
}

// ---------------------------------------------------------------------------
// Fichas dos adversários
// ---------------------------------------------------------------------------

/**
 * A ficha de um jogador secreto. `o`: { cat, dono (jogador público), alvo, aberta, podePalpitar, porqueNao,
 * pontosPalpite, identificadoAgora, palpite (caixa aberta?), novas (Set "n:chave"), nome(id), cor(id) }.
 */
export function fichaPublica(f, o) {
  const ctx = o;
  const revelada = f.revelada;
  const nSim = P.contarSim(f);
  const pronto = P.palpiteDesbloqueado(f);
  // Com os "sim" todos e o palpite ainda fechado, o que falta (o clube) fica escrito à frente dos quadrados.
  const faltaClube = !f.identificada && !revelada && P.faltaParaPalpite(f).sim === 0 && P.faltaParaPalpite(f).clube;
  const resumo = f.identificada ? 'identificado' : revelada ? 'revelado' : pronto ? `${nSim} sim · palpite!` : `${Math.min(nSim, P.SIM_MINIMOS)}/${P.SIM_MINIMOS} sim`;
  const classe = ['folha', 'ficha', 'papel', o.alvo ? 'alvo' : '', o.recolhida ? 'recolhida' : ''].filter(Boolean).join(' ');
  const corpo = revelada
    ? [carreiraRegisto(revelada, o.cat, false)]
    : [carreiraPublica(f, ctx), treinadorPublico(f, ctx), estatisticasPublicas(f, ctx), premiosPublicos(f), notasExtra(f, ctx), descartadas(f, ctx)];
  const titulo = `${nSim} «sim»`;
  const rodape = f.identificada
    ? el('span', { class: 'carimbo identificado-mini', style: { '--rot': rotacao(`id${f.n}`) }, title: `Identificado por ${o.nome(f.identificada.por)}`, text: 'Identificado' })
    : revelada
      ? el('span', { class: 'carimbo identificado-mini', style: { '--rot': rotacao(`rv${f.n}`) }, text: 'Revelado' })
      : el('button', {
        class: 'btn btn-principal btn-palpite', type: 'button', disabled: !o.podePalpitar, title: o.podePalpitar || faltaClube ? null : o.porqueNao,
        dataset: { palpite: String(f.n) },
      }, 'Palpite final');
  const art = el('article', {
    class: classe, id: `f-${f.n}`, style: { '--cor-dono': o.cor(f.dono) }, 'aria-label': `Ficha de ${o.dono?.nome ?? '?'}`,
    dataset: { ficha: String(f.n) },
  },
  o.alvo ? el('span', { class: 'folha-etiqueta-alvo', text: 'Alvo' }) : null,
  el('header', { class: 'folha-topo' },
    el('div', { class: 'folha-linha' },
      el('div', { class: 'pin-dono', text: o.dono?.nome ?? '?' }),
      el('div', { class: 'folha-id' },
        el('h3', { class: `folha-nome${revelada ? '' : ' desconhecido'}`, text: revelada ? revelada.nome : '[Desconhecido]' }),
        el('span', { class: `folha-resumo${pronto || f.identificada ? ' pronto' : ''}`, text: resumo })),
      el('button', { class: 'folha-min', type: 'button', 'aria-label': `${o.recolhida ? 'Abrir' : 'Recolher'} a ficha de ${o.dono?.nome ?? '?'}`, dataset: { recolher: String(f.n) }, text: o.recolhida ? '+' : '–' })),
    el('div', { class: 'folha-retrato' }, retrato(revelada?.perfil?.foto, revelada?.nome), revelada ? dadosRegisto(revelada) : dadosPublicos(f, ctx))),
  el('div', { class: 'folha-corpo' }, ...corpo),
  el('footer', { class: 'folha-rodape' }, contadorSim(nSim, titulo),
    faltaClube ? el('span', { class: 'falta-palpite', text: 'Falta um clube confirmado' }) : null, rodape));
  if (o.identificadoAgora && revelada) {
    art.append(el('div', { class: 'identificado' },
      el('p', { class: 'carimbo-grande', text: 'Identificado' }),
      el('figure', { class: 'identificado-foto' },
        revelada.perfil?.foto?.url ? el('img', { src: miniatura(revelada.perfil.foto.url), alt: revelada.nome, title: creditoFoto(revelada.perfil.foto), referrerpolicy: 'no-referrer' }) : silhueta()),
      el('p', { class: 'identificado-nome', text: revelada.nome }),
      el('p', { class: 'carimbo carimbo-autor', style: { '--cor-autor': o.cor(f.identificada?.por) }, text: o.nome(f.identificada?.por) })));
  }
  return art;
}

/** A caixa do palpite final, por cima do fundo da ficha (no Desafio do Dia, sem dono nem pontos). */
export function caixaPalpite(f, o) {
  return el('form', { class: 'caixa-palpite', novalidate: true, dataset: { caixa: String(f.n) } },
    el('h4', { text: `Palpite final${o.dono ? ` · ficha de ${o.dono.nome}` : ''}` }),
    el('div', { class: 'autocompletar' }, el('input', { class: 'campo', placeholder: 'Quem é?', 'aria-label': 'Nome do jogador', autocomplete: 'off', spellcheck: 'false' })),
    el('p', { class: 'erro', role: 'alert' }),
    el('div', { class: 'linha-botoes' },
      el('button', { class: 'cancelar', type: 'button', dataset: { cancelar: '' }, text: 'Cancelar' }),
      el('button', { class: 'btn btn-principal', type: 'submit', text: o.pontosPalpite != null ? `Enviar · ${o.pontosPalpite} pts` : 'Enviar palpite' })));
}

// ---------------------------------------------------------------------------
// O meu dossier
// ---------------------------------------------------------------------------

/**
 * Uma linha por tipo de prémio, pela ordem de partilhado/perguntas.json, com os países (campeonatos e taças) e os
 * anos: "Campeonato nacional · Croácia (2019, 2020), Inglaterra (2023)", "Liga dos Campeões (2024, 2025)".
 */
export function linhasPremios(lista) {
  // Primeiro os campeonatos e as taças nacionais, depois pela ordem de perguntas.json.
  const ordem = ['campeonato_nacional', 'taca_nacional', ...Object.keys(P.PREMIOS)];
  const porId = new Map();
  for (const p of lista) {
    if (!p.id || !P.PREMIOS[p.id]) continue;
    const porPais = porId.get(p.id) ?? new Map();
    porId.set(p.id, porPais);
    const atual = porPais.get(p.pais ?? '') ?? { anos: [], n: 0 };
    atual.anos.push(...(p.anos ?? []));
    atual.n += p.n ?? (p.anos?.length || 1);
    porPais.set(p.pais ?? '', atual);
  }
  const anos = ({ anos: a, n }) => {
    const unicos = [...new Set(a)].sort((x, y) => x - y);
    return unicos.length ? `(${unicos.join(', ')})` : n > 1 ? `×${n}` : '';
  };
  return [...porId].sort(([a], [b]) => ordem.indexOf(a) - ordem.indexOf(b)).map(([id, porPais]) => ({
    nome: nomePremio(id),
    partes: [...porPais].map(([pais, x]) => ({ pais: pais ? P.nomePais(pais) : null, anos: anos(x) })),
  }));
}

/** Uma linha de prémios: "<b>Campeonato nacional</b> · Croácia <i>(2019, 2020)</i>, Inglaterra <i>(2023)</i>". */
export const textoPremio = (l) => `${l.nome}${l.partes.some((x) => x.pais) ? ' ·' : ''} ${l.partes.map((x) => [x.pais, x.anos].filter(Boolean).join(' ')).join(', ')}`.trim();
function linhaPremio(l) {
  const partes = l.partes.flatMap((x, i) => [i ? ', ' : (x.pais ? ' · ' : ' '), x.pais ?? '', x.pais && x.anos ? ' ' : '', x.anos ? el('em', { text: x.anos }) : null]);
  return el('li', {}, el('strong', { text: l.nome }), ...partes.filter((x) => x !== ''));
}

// ---------------------------------------------------------------------------
// O dossier
// ---------------------------------------------------------------------------

/** O dossier do meu jogador secreto: tudo o que há no registo, para responder às perguntas livres. */
export function dossier(reg, f, o) {
  const cat = o.cat;
  const tr = reg.treinador;
  const grupos = [['clube', 'Clubes'], ['selecao', 'Internacionais'], ['individual', 'Pessoais']]
    .map(([tipo, rotulo]) => [rotulo, linhasPremios(reg.premios.filter((p) => P.PREMIOS[p.id]?.tipo === tipo))])
    .filter(([, linhas]) => linhas.length);
  const nSim = f ? P.contarSim(f) : 0;
  const titulo = `Os outros já têm ${plural(nSim, '«sim»', '«sim»')} sobre o teu jogador`;
  return el('article', { class: 'folha dossier', id: 'f-meu', 'aria-label': 'O teu dossier' },
    el('p', { class: 'dossier-titulo', text: 'Dossier · o teu jogador' }),
    el('div', { class: 'dossier-folha papel' },
      el('header', { class: 'folha-topo' },
        el('div', { class: 'folha-linha' },
          el('div', { class: 'folha-id' }, el('h3', { class: 'folha-nome', text: reg.nome })),
          el('span', { class: 'carimbo carimbo-secreto', text: f?.identificada ? 'Identificado' : 'Confidencial' })),
        el('div', { class: 'folha-retrato' }, retrato(reg.perfil?.foto, reg.nome), dadosRegisto(reg))),
      el('div', { class: 'folha-corpo' },
        carreiraRegisto(reg, cat, true),
        grupos.length ? el('section', {}, el('h4', { text: 'Prémios' }),
          ...grupos.map(([rotulo, linhas]) => el('div', { class: 'premios-grupo' },
            el('p', { class: 'premios-rotulo', text: rotulo }),
            el('ul', { class: 'lista-folha' }, ...linhas.map(linhaPremio))))) : null,
        tr ? el('section', {},
          el('h4', { text: 'Treinador' }),
          el('ul', { class: 'lista-folha' },
            ...tr.equipas.map((e) => el('li', { text: `${e.tipo === 'selecao' ? `Seleção ${P.dePais(e.pais)}` : e.nome}${e.pais && e.tipo !== 'selecao' ? ` (${P.nomePais(e.pais)})` : ''} · ${epocas(e.inicio, e.fim, e === tr.atual)}${e.interino ? ' · interino' : ''}` })),
            el('li', { text: plural(tr.n_titulos ?? 0, 'título', 'títulos') }),
            ...linhasPremios(tr.titulos).map(linhaPremio))) : null,
        reg.perfil?.alcunhas?.length ? el('section', {}, el('h4', { text: 'Alcunhas' }), el('p', { class: 'texto-maquina', text: reg.perfil.alcunhas.join(' · ') })) : null,
        el('p', { class: 'folha-fonte' }, 'Fonte: ',
          reg.fontes?.wikipedia ? el('a', { href: `https://en.wikipedia.org/wiki/${encodeURIComponent(reg.fontes.wikipedia.replace(/ /g, '_'))}`, target: '_blank', rel: 'noopener', text: 'Wikipédia' }) : 'Wikipédia',
          ' · zerozero · Transfermarkt. Só podes pesquisar o teu jogador.')),
      el('footer', { class: 'folha-rodape' },
        contadorSim(nSim, titulo),
        el('button', { class: 'btn btn-principal btn-palpite', type: 'button', disabled: true, title: 'Não podes dar palpites à tua própria ficha' }, 'Palpite final'))));
}

/** O dossier enquanto não há jogador (a escolher, ou a ver). */
export function dossierVazio(texto) {
  return el('article', { class: 'folha dossier', id: 'f-meu', 'aria-label': 'O teu dossier' },
    el('p', { class: 'dossier-titulo', text: 'Dossier · o teu jogador' }),
    el('div', { class: 'dossier-folha papel' },
      el('div', { class: 'folha-corpo' }, el('p', { class: 'texto-maquina', text: texto }))));
}
