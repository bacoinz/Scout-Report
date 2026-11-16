// Idioma do jogo: português (o original) ou inglês. O jogo escreve sempre em português (no cliente e nas mensagens
// do servidor); em inglês, cada texto que aparece no ecrã troca-se pela tradução de ingles.js, à medida que vai
// aparecendo. Mudar de idioma recarrega a página. (O mesmo esquema do Coach Board.)
import { PARES, POSICOES_EN, COMO_JOGAR, COMO_DIA } from './ingles.js';
import { PAISES, PREMIOS, POSICOES, SETORES, CONFEDERACOES } from './comum/perguntas.js';

const CHAVE = 'sr.idioma';

function escolhido() {
  if (typeof location === 'undefined') return 'pt'; // nos testes, sem browser
  const doLink = new URLSearchParams(location.search).get('lang');
  try {
    // Um link com ?lang=en fica escolhido para as próximas visitas.
    if (doLink === 'pt' || doLink === 'en') localStorage.setItem(CHAVE, doLink);
  } catch {}
  if (doLink === 'pt' || doLink === 'en') return doLink;
  try {
    const guardado = localStorage.getItem(CHAVE);
    if (guardado === 'pt' || guardado === 'en') return guardado;
  } catch {}
  return (navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

export const IDIOMA = escolhido();
export const emIngles = IDIOMA === 'en';
/** Para datas e meses (Intl). */
export const LOCALE = emIngles ? 'en-GB' : 'pt-PT';

export function mudarIdioma(idioma) {
  try {
    localStorage.setItem(CHAVE, idioma);
  } catch {}
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  location.replace(url);
}

// --- O dicionário: textos exatos e padrões com partes que mudam ---

const exatos = new Map();
const padroes = [];
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function juntar(pt, en) {
  if (!/\{\d+\}/.test(pt)) {
    if (!exatos.has(pt)) exatos.set(pt, en);
    return;
  }
  const ordem = [];
  const re = new RegExp(`^${escapar(pt).replace(/\\\{(\d+)\\\}/g, (_, d) => {
    ordem.push(Number(d));
    return '([\\s\\S]+?)';
  })}$`);
  padroes.push({ re, ordem, en, fixo: pt.replace(/\{\d+\}/g, '').length });
}

// Os países: o nome em inglês vem do próprio browser (Intl), com as quatro nações do Reino Unido à parte. Cada país
// aparece também com as preposições do português ("de Espanha", "no Brasil"…).
const UK = { 'GB-ENG': 'England', 'GB-SCT': 'Scotland', 'GB-WLS': 'Wales', 'GB-NIR': 'Northern Ireland', XK: 'Kosovo' };
let regioes = null;
export function nomeIngles(codigo, pt) {
  if (UK[codigo]) return UK[codigo];
  try {
    regioes ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regioes.of(codigo) ?? pt;
  } catch {
    return pt;
  }
}

function paresPaises() {
  for (const [codigo, p] of Object.entries(PAISES)) {
    const en = nomeIngles(codigo, p.nome);
    juntar(p.nome, en);
    for (const de of ['de', 'do', 'da', 'dos', 'das']) {
      juntar(`${de} ${p.nome}`, `from ${en}`);
      juntar(`seleção ${de} ${p.nome}`, `${en} national team`);
      juntar(`Seleção ${de} ${p.nome}`, `${en} national team`);
      juntar(`a seleção ${de} ${p.nome}`, `the ${en} national team`);
    }
    for (const em of ['em', 'no', 'na', 'nos', 'nas']) juntar(`${em} ${p.nome}`, `in ${en}`);
  }
}

// Os prémios: "a Liga dos Campeões" (nas perguntas) e "Liga dos Campeões" (nas fichas).
const PREMIOS_EN = {
  liga_campeoes: 'the Champions League', liga_europa: 'the Europa League (or UEFA Cup)', liga_conferencia: 'the Conference League',
  taca_tacas: 'the Cup Winners\' Cup', supertaca_europeia: 'the UEFA Super Cup', mundial_clubes: 'the Club World Cup (or Intercontinental Cup)',
  libertadores: 'the Copa Libertadores', campeonato_nacional: 'a national league title', taca_nacional: 'a national cup',
  mundial: 'the World Cup', europeu: 'the Euros', copa_america: 'the Copa América', can: 'the Africa Cup of Nations',
  taca_asia: 'the Asian Cup', gold_cup: 'the CONCACAF Gold Cup', liga_nacoes: 'the Nations League', taca_confederacoes: 'the Confederations Cup',
  jogos_olimpicos: 'the Olympic Games', bola_de_ouro: 'the Ballon d\'Or', melhor_jogador_fifa: 'the FIFA Best Player award',
  bota_de_ouro: 'the Golden Shoe', golden_boy: 'the Golden Boy', melhor_treinador_fifa: 'the FIFA Best Coach award',
};
const PREMIOS_CURTOS = {
  mundial_clubes: 'Club World Cup', liga_europa: 'Europa League', campeonato_nacional: 'National league', taca_nacional: 'National cup',
  melhor_jogador_fifa: 'FIFA Best Player', melhor_treinador_fifa: 'FIFA Best Coach',
};
const curto = (en) => en.replace(/^(the|a) /, '').replace(/ \(or [^)]*\)$/, '').replace(/^./, (c) => c.toUpperCase());

function paresDados() {
  for (const [id, p] of Object.entries(PREMIOS)) {
    const en = PREMIOS_EN[id];
    if (!en) continue;
    juntar(p.nome, en);
    const pt = p.nome.replace(/^(o|a|os|as|um|uma) /, '').replace(/ \(ou [^)]*\)$/, '').replace(/^prémio de /, '').replace(/^./, (c) => c.toUpperCase());
    juntar(pt, PREMIOS_CURTOS[id] ?? curto(en));
  }
  const SET = { gr: 'Goalkeeper', defesa: 'Defender', medio: 'Midfielder', avancado: 'Forward' };
  for (const [id, nome] of Object.entries(SETORES)) {
    juntar(nome, SET[id]);
    juntar(nome.toLowerCase(), `a ${SET[id].toLowerCase()}`);
  }
  for (const [id, p] of Object.entries(POSICOES)) {
    const en = POSICOES_EN[id];
    juntar(p.nome, en.nome);
    juntar(p.nome.toLowerCase(), `${/^[aeiou]/i.test(en.nome) ? 'an' : 'a'} ${en.nome.toLowerCase()}`);
  }
  const CONF = { UEFA: 'Europe', CONMEBOL: 'South America', CONCACAF: 'North and Central America', CAF: 'Africa', AFC: 'Asia', OFC: 'Oceania' };
  for (const [id, c] of Object.entries(CONFEDERACOES)) {
    juntar(c.nome, CONF[id]);
    juntar(c.de, `from ${CONF[id]}`);
  }
}

for (const [pt, en] of PARES) juntar(pt, en);
paresPaises();
paresDados();

// Os padrões com mais texto fixo são os mais específicos: experimentam-se primeiro.
padroes.sort((a, b) => b.fixo - a.fixo);

// Partes de frases: "no Benfica" (jogou no), "o Benfica" (treinou o).
const RESTOS = [
  [/^(?:no|na|nos|nas) (.+)$/, 'for $1'],
  [/^(?:o|a|os|as) (.+)$/, '$1'],
];

/** "anos 90" → "90s"; "1,80 m" → "1.80 m". */
function formas(t) {
  const decada = t.match(/^anos (\d{2,4})$/);
  if (decada) return `${decada[1]}s`;
  if (/\d,\d/.test(t) && /^[\d,+\-–≤ m]+$/.test(t)) return t.replace(/(\d),(\d)/g, '$1.$2');
  return null;
}

/** "PL, EE" ou "MDC": só siglas de posições. */
function siglas(t) {
  const partes = t.split(/(,? )/);
  if (!partes.every((p, i) => (i % 2 ? true : POSICOES_EN[p]))) return null;
  return partes.map((p, i) => (i % 2 ? p : POSICOES_EN[p].sigla)).join('');
}

const cache = new Map();

function parte(t, profundidade) {
  const exato = exatos.get(t);
  if (exato !== undefined) return exato;
  // "Pergunta → Resposta": cada lado traduz-se à parte (um padrão que acaba em {0} engolia a resposta).
  const seta = t.indexOf(' → ');
  if (seta > 0) return `${parte(t.slice(0, seta), profundidade + 1)} → ${parte(t.slice(seta + 3), profundidade + 1)}`;
  const outro = formas(t) ?? siglas(t);
  if (outro) return outro;
  if (profundidade > 3) return t;
  for (const p of padroes) {
    const m = t.match(p.re);
    if (!m) continue;
    return p.en.replace(/\{(\d+)\}/g, (_, d) => parte(m[p.ordem.indexOf(Number(d)) + 1], profundidade + 1));
  }
  if (profundidade > 0) for (const [re, en] of RESTOS) if (re.test(t)) return t.replace(re, en);
  return t;
}

/** O texto no idioma escolhido. Em português, fica igual. */
export function traduzir(texto) {
  if (!emIngles || !texto) return texto;
  const m = String(texto).match(/^(\s*)([\s\S]*?)(\s*)$/);
  const nucleo = m[2];
  if (!nucleo) return texto;
  let r = cache.get(nucleo);
  if (r === undefined) {
    r = parte(nucleo, 0);
    if (cache.size > 20000) cache.clear();
    cache.set(nucleo, r);
  }
  return m[1] + r + m[3];
}

// --- No ecrã: traduz o que já lá está e o que for aparecendo ---

const ATRIBUTOS = ['title', 'placeholder', 'aria-label', 'alt'];
const SVG = 'http://www.w3.org/2000/svg';

function traduzirAtributo(el, nome) {
  const v = el.getAttribute(nome);
  if (!v) return;
  const t = traduzir(v);
  if (t !== v) el.setAttribute(nome, t);
}

function traduzirNo(no) {
  if (no.nodeType === 3) {
    if (no.parentNode?.namespaceURI === SVG) return;
    const v = no.nodeValue;
    const t = traduzir(v);
    if (t !== v) no.nodeValue = t;
    return;
  }
  if (no.nodeType !== 1 || no.tagName === 'SCRIPT' || no.tagName === 'STYLE' || no.tagName === 'PRE') return;
  // O que o jogador escreve (nomes, perguntas livres) não se traduz.
  if (no.dataset?.semTraducao != null) return;
  for (const a of ATRIBUTOS) traduzirAtributo(no, a);
  if (no.namespaceURI === SVG) return;
  for (const filho of no.childNodes) traduzirNo(filho);
}

/** Liga a tradução do ecrã. Chama-se uma vez, antes de o jogo desenhar alguma coisa. */
export function instalarTradutor() {
  document.documentElement.lang = emIngles ? 'en' : 'pt-PT';
  for (const s of document.querySelectorAll('[data-mudar-idioma]')) s.value = IDIOMA;
  if (!emIngles) return;
  const como = document.querySelector('#dialogo-como .regras');
  if (como) como.innerHTML = COMO_JOGAR;
  const dia = document.querySelector('#dialogo-dia .regras');
  if (dia) dia.innerHTML = COMO_DIA;
  // Títulos em duas cores com a ordem trocada em inglês ("Pergunta livre" → "Free question").
  for (const el of document.querySelectorAll('[data-en]')) el.textContent = el.dataset.en;
  const semana = document.querySelector('.cal-semana');
  if (semana) semana.innerHTML = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<li>${d}</li>`).join('');
  traduzirNo(document.body);
  new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      if (m.type === 'characterData') traduzirNo(m.target);
      else if (m.type === 'attributes') traduzirAtributo(m.target, m.attributeName);
      else for (const no of m.addedNodes) traduzirNo(no);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
}
