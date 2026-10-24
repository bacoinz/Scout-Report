// Perguntas estruturadas: textos, níveis e pontos, desbloqueio por hierarquia, deduções e respostas.
// O mesmo código corre no Durable Object (que responde e valida) e no browser (que monta o menu e as fichas).
// Puro. Uma pergunta é uma chave "tipo:valor" ("liga:Q324867", "jogos:300", "ativo"); uma ficha é
// { respostas: { [chave]: { r: 'sim' | 'nao' | 'sem_registo', autor, ronda } }, livres: [{ texto, r, autor }] }.
import { PERGUNTAS, PAISES } from './dados.gen.js';

export { PAISES };
export const COBERTURA_MINIMA = 0.9;
export const PONTOS = PERGUNTAS.pontos;
export const SIM_MINIMOS = PERGUNTAS.palpite.sim_minimos;
export const ORDEM = PERGUNTAS.ordem_categorias;
export const NOMES_CATEGORIAS = {
  era: 'Era', nacionalidade: 'Nacionalidade', posicao: 'Posição', fisico: 'Físico', estado: 'Estado',
  carreira: 'Carreira', estatisticas: 'Estatísticas', numeros: 'Números', premios: 'Prémios', treinador: 'Treinador',
};

export const CONFEDERACOES = {
  UEFA: { nome: 'Europa (UEFA)', de: 'da Europa (UEFA)' },
  CONMEBOL: { nome: 'América do Sul (CONMEBOL)', de: 'da América do Sul (CONMEBOL)' },
  CONCACAF: { nome: 'América do Norte e Central (CONCACAF)', de: 'da América do Norte e Central (CONCACAF)' },
  CAF: { nome: 'África (CAF)', de: 'de África (CAF)' },
  AFC: { nome: 'Ásia (AFC)', de: 'da Ásia (AFC)' },
  OFC: { nome: 'Oceânia (OFC)', de: 'da Oceânia (OFC)' },
};
export const SETORES = PERGUNTAS.setores;
export const POSICOES = PERGUNTAS.posicoes;
export const PREMIOS = PERGUNTAS.premios;
const PES = { direito: 'É destro?', esquerdo: 'É canhoto?', ambos: 'Usa os dois pés?' };
const FAIXAS = PERGUNTAS.numeros.faixas;
const LIMIARES = {
  jogos: PERGUNTAS.estatisticas.jogos,
  golos: PERGUNTAS.estatisticas.golos,
  inter: PERGUNTAS.estatisticas.internacionalizacoes,
  assist: PERGUNTAS.estatisticas.assistencias,
  altura: PERGUNTAS.fisico.alturas_cm,
  // "Ganhou algum título como treinador?" é o limiar 0 ("mais de 0").
  t_titulos: [0, ...PERGUNTAS.treinador.titulos.filter((n) => n > 1)],
};

/** Os limiares de um tipo "mais de N" (jogos, golos, inter, assist, altura, t_titulos). */
export const limiaresDe = (tipo) => LIMIARES[tipo] ?? [];
export const FAIXAS_NUMEROS = FAIXAS;

// ---------------------------------------------------------------------------
// Artigos (PT-PT): "de Espanha", "do Brasil", "da Argentina", "dos Países Baixos"
// ---------------------------------------------------------------------------

const ARTIGOS = {
  o: 'AF AZ BH BJ BR BT BW BI KH CA CL EC EG SV GA GH GT HT IR IQ JP KZ KE XK KW KG LA LB LS LI LU MW ML MX ME NP NE ' +
    'OM PK PA PY PE QA RW SN SD SS SR TJ TG TM UY UZ VN YE ZW GB-WLS BD LK BN DJ BZ TD CG SZ',
  a: 'AL DZ AR AM AU AT BY BE BO BA BG CN CO CR HR CZ CD DK DO GQ ER EE ET FI GM GE DE GR GN GW GY HU IS IN ID IE CI ' +
    'JM JO LV LR LY LT MY MR MD MN MK GB-NIR NO NZ NI NG PS PL RO RU SA GB-SCT RS SL SK SI SO ZA KR KP SE CH SY TZ TH ' +
    'TN TR UA VE ZM CF PG NC PF GF MQ GP RE',
  os: 'NL US AE CM',
  as: 'BS HN PH MV KM FO SC SB KY VG VI TC MP BM',
};
const ARTIGO = new Map(Object.entries(ARTIGOS).flatMap(([art, codigos]) => codigos.split(' ').map((c) => [c, art])));
const CONTRAI = { de: { o: 'do', a: 'da', os: 'dos', as: 'das' }, em: { o: 'no', a: 'na', os: 'nos', as: 'nas' } };

export const nomePais = (codigo) => PAISES[codigo]?.nome ?? codigo;
/** "de Espanha" / "do Brasil" / "da Argentina". */
export const dePais = (codigo) => `${CONTRAI.de[ARTIGO.get(codigo)] ?? 'de'} ${nomePais(codigo)}`;
/** "em Espanha" / "no Brasil" / "na Argentina". */
export const emPais = (codigo) => `${CONTRAI.em[ARTIGO.get(codigo)] ?? 'em'} ${nomePais(codigo)}`;

// Clubes que em português são "a": "na Juventus", "a Lazio".
const CLUBES_FEMININOS = /^(juventus|lazio|roma|fiorentina|sampdoria|atalanta|udinese|salernitana|reggina|ternana|cremonese|spezia|spal|triestina|reggiana|real sociedad|academica|associacao academica|portuguesa|ponte preta|chapecoense|cultural leonesa|ponferradina|gimnastica)\b/;
const semAcentos = (t) => String(t).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
export const artigoClube = (nome) => (CLUBES_FEMININOS.test(semAcentos(nome)) ? 'a' : 'o');
const noClube = (nome) => `${artigoClube(nome) === 'a' ? 'na' : 'no'} ${nome}`;
const oClube = (nome) => `${artigoClube(nome)} ${nome}`;
const naLiga = (nome) => `${/^(campeonato|brasileirao|torneio)/.test(semAcentos(nome)) ? 'no' : 'na'} ${nome}`;
const anos = (d) => (d < 2000 ? `anos ${String(d).slice(2)}` : `anos ${d}`);

// ---------------------------------------------------------------------------
// Catálogo (clubes e ligas do D1) com os índices para o menu
// ---------------------------------------------------------------------------

/** { ligas: {id: {nome, pais}}, clubes: {id: {nome, pais, ligas}} } → o mesmo, mais os índices por país e liga. */
export function prepararCatalogo({ ligas = {}, clubes = {}, versao = null } = {}) {
  const ligasPorPais = {};
  const clubesPorLiga = {};
  const clubesPorPais = {};
  const juntar = (mapa, chave, id) => {
    if (chave) (mapa[chave] ??= []).push(id);
  };
  for (const [id, l] of Object.entries(ligas)) juntar(ligasPorPais, l.pais, id);
  for (const [id, c] of Object.entries(clubes)) {
    for (const l of c.ligas ?? []) juntar(clubesPorLiga, l, id);
    juntar(clubesPorPais, c.pais, id);
  }
  const porNome = (mapa) => (a, b) => (mapa[a]?.nome ?? a).localeCompare(mapa[b]?.nome ?? b, 'pt');
  // A "Outra liga de X" fica no fim da lista desse país.
  for (const lista of Object.values(ligasPorPais)) lista.sort((a, b) => a.startsWith('outra-') - b.startsWith('outra-') || porNome(ligas)(a, b));
  for (const lista of [...Object.values(clubesPorLiga), ...Object.values(clubesPorPais)]) lista.sort(porNome(clubes));
  const paisesComLiga = Object.keys(ligasPorPais).sort((a, b) => nomePais(a).localeCompare(nomePais(b), 'pt'));
  return { versao, ligas, clubes, ligasPorPais, clubesPorLiga, clubesPorPais, paisesComLiga };
}

export const nomeLiga = (cat, id) => (id.startsWith('outra-') ? `Outra liga ${dePais(id.slice(6))}` : cat.ligas[id]?.nome ?? id);
export const paisLiga = (cat, id) => (id.startsWith('outra-') ? id.slice(6) : cat.ligas[id]?.pais ?? null);
export const nomeClube = (cat, id) => cat.clubes[id]?.nome ?? id;

// ---------------------------------------------------------------------------
// Tipos de pergunta
// ---------------------------------------------------------------------------

const intEntre = (v, a, b) => /^\d+$/.test(v) && Number(v) >= a && Number(v) <= b;
const ultima = (reg) => (reg.estado === 'ativo' ? reg.carreira.at(-1) : null);
const tre = (reg) => reg.treinador ?? { equipas: [], atual: null, titulos: [], n_titulos: 0 };

/** Resposta a "mais de N" com o valor (ou SEM REGISTO sem ele). */
const maisDe = (valor, n) => (valor == null ? 'sem_registo' : valor > n ? 'sim' : 'nao');
const simNao = (b) => (b ? 'sim' : 'nao');

/** Números de camisola e assistências: um "sim" basta com dados parciais; um "não" pede a carreira coberta. */
function numeros(reg, aceita) {
  const t = reg.totais.numeros;
  if (t.conhecidos.some(aceita)) return 'sim';
  return t.cobertura >= COBERTURA_MINIMA ? 'nao' : 'sem_registo';
}
/** O mesmo que pipeline/scout/assistencias.py → resposta(). */
export function respostaAssistencias(assist, limiar) {
  if (assist.conhecidas > limiar) return 'sim';
  if ((assist.maximo ?? Infinity) <= limiar || assist.cobertura >= COBERTURA_MINIMA) return 'nao';
  return 'sem_registo';
}

/**
 * Cada tipo: categoria, nível, se o valor é válido, o texto, a resposta e o que requerem (a hierarquia: grupos de chaves;
 * a pergunta abre quando, em cada grupo, alguma tem ✓).
 */
const TIPOS = {
  // Era
  decada: {
    cat: 'era', nivel: 1, valida: (v) => PERGUNTAS.decadas.includes(Number(v)),
    texto: (v) => `Estreou-se como sénior nos ${anos(Number(v))}?`,
    responder: (reg, v) => simNao(Math.floor(reg.estreia / 10) * 10 === Number(v)),
    valores: () => PERGUNTAS.decadas.map(String),
  },
  ano: {
    cat: 'era', nivel: 2, valida: (v) => intEntre(v, PERGUNTAS.decadas[0], PERGUNTAS.decadas.at(-1) + 9),
    texto: (v) => `Estreou-se como sénior em ${v}?`,
    responder: (reg, v) => simNao(reg.estreia === Number(v)),
    requer: (v) => [[`decada:${Math.floor(Number(v) / 10) * 10}`]],
  },
  // Nacionalidade
  conf: {
    cat: 'nacionalidade', nivel: 1, valida: (v) => v in CONFEDERACOES,
    texto: (v) => `É ${CONFEDERACOES[v].de}?`,
    responder: (reg, v) => simNao(reg.confederacoes.includes(v)),
    valores: () => Object.keys(CONFEDERACOES),
  },
  nac: {
    cat: 'nacionalidade', nivel: 2, valida: (v) => Boolean(PAISES[v]?.confederacao),
    texto: (v) => `É ${dePais(v)}?`,
    responder: (reg, v) => simNao(reg.nacionalidades.includes(v)),
    requer: (v) => [[`conf:${PAISES[v].confederacao}`]],
  },
  // Posição
  setor: {
    cat: 'posicao', nivel: 1, valida: (v) => v in SETORES,
    texto: (v) => `É ${SETORES[v].toLowerCase()}?`,
    responder: (reg, v) => simNao(reg.posicao.setores.includes(v)),
    valores: () => Object.keys(SETORES),
  },
  pos: {
    cat: 'posicao', nivel: 2, valida: (v) => v in POSICOES,
    texto: (v) => `É ${POSICOES[v].nome.toLowerCase()}?`,
    responder: (reg, v) => simNao(reg.posicao.especificas.includes(v)),
    requer: (v) => [[`setor:${POSICOES[v].setor}`]],
  },
  // Físico
  pe: {
    cat: 'fisico', nivel: 1, valida: (v) => v in PES, texto: (v) => PES[v],
    responder: (reg, v) => (reg.perfil?.pe ? simNao(reg.perfil.pe === v) : 'sem_registo'),
    valores: () => Object.keys(PES),
  },
  altura: {
    cat: 'fisico', nivel: 1, valida: (v) => LIMIARES.altura.includes(Number(v)),
    texto: (v) => `Mede mais de ${(Number(v) / 100).toFixed(2).replace('.', ',')} m?`,
    responder: (reg, v) => maisDe(reg.perfil?.altura_cm ?? null, Number(v)),
    valores: () => LIMIARES.altura.map(String),
  },
  // Estado
  ativo: { cat: 'estado', nivel: 1, texto: () => 'Está no ativo?', responder: (reg) => simNao(reg.estado === 'ativo') },
  retirado: { cat: 'estado', nivel: 1, texto: () => 'Está retirado?', responder: (reg) => simNao(reg.estado === 'retirado') },
  foi_treinador: { cat: 'estado', nivel: 1, texto: () => 'É ou foi treinador?', responder: (reg) => simNao(Boolean(reg.treinador)) },
  // Carreira: país da liga → liga → clube, na carreira toda ou só agora
  pais: {
    cat: 'carreira', nivel: 1, valida: (v, cat) => Boolean(cat.ligasPorPais[v]),
    texto: (v) => `Jogou numa liga ${dePais(v)}?`,
    responder: (reg, v) => simNao(reg.carreira.some((c) => c.paises_liga.includes(v))),
  },
  pais_atual: {
    cat: 'carreira', nivel: 1, valida: (v, cat) => Boolean(cat.ligasPorPais[v]),
    texto: (v) => `Joga atualmente numa liga ${dePais(v)}?`,
    responder: (reg, v) => simNao(Boolean(ultima(reg)?.paises_liga.includes(v))),
  },
  liga: {
    cat: 'carreira', nivel: 2, valida: (v, cat) => Boolean(cat.ligas[v]),
    texto: (v, cat) => (v.startsWith('outra-') ? `Jogou noutra liga ${dePais(v.slice(6))}?` : `Jogou ${naLiga(nomeLiga(cat, v))}?`),
    responder: (reg, v) => simNao(reg.carreira.some((c) => c.ligas.includes(v))),
    requer: (v, cat) => [[`pais:${paisLiga(cat, v)}`, `pais_atual:${paisLiga(cat, v)}`]],
  },
  liga_atual: {
    cat: 'carreira', nivel: 2, valida: (v, cat) => Boolean(cat.ligas[v]),
    texto: (v, cat) => (v.startsWith('outra-') ? `Joga atualmente noutra liga ${dePais(v.slice(6))}?`
      : `Joga atualmente ${naLiga(nomeLiga(cat, v))}?`),
    responder: (reg, v) => simNao(Boolean(ultima(reg)?.ligas.includes(v))),
    requer: (v, cat) => [[`pais:${paisLiga(cat, v)}`, `pais_atual:${paisLiga(cat, v)}`]],
  },
  clube: {
    cat: 'carreira', nivel: 3, valida: (v, cat) => Boolean(cat.clubes[v]),
    texto: (v, cat) => `Jogou ${noClube(nomeClube(cat, v))}?`,
    responder: (reg, v) => simNao(reg.carreira.some((c) => c.clube === v)),
    requer: (v, cat) => [(cat.clubes[v]?.ligas ?? []).flatMap((l) => [`liga:${l}`, `liga_atual:${l}`])],
  },
  clube_atual: {
    cat: 'carreira', nivel: 3, valida: (v, cat) => Boolean(cat.clubes[v]),
    texto: (v, cat) => `Joga atualmente ${noClube(nomeClube(cat, v))}?`,
    responder: (reg, v) => simNao(reg.clube_atual === v),
    requer: (v, cat) => [(cat.clubes[v]?.ligas ?? []).flatMap((l) => [`liga:${l}`, `liga_atual:${l}`])],
  },
  // Estatísticas (clubes, todas as competições, e seleção)
  jogos: {
    cat: 'estatisticas', nivel: 1, valida: (v) => LIMIARES.jogos.includes(Number(v)),
    texto: (v) => `Fez mais de ${v} jogos?`, responder: (reg, v) => maisDe(reg.totais.jogos, Number(v)),
    valores: () => LIMIARES.jogos.map(String),
  },
  golos: {
    cat: 'estatisticas', nivel: 1, valida: (v) => LIMIARES.golos.includes(Number(v)),
    texto: (v) => `Marcou mais de ${v} golos?`, responder: (reg, v) => maisDe(reg.totais.golos, Number(v)),
    valores: () => LIMIARES.golos.map(String),
  },
  inter: {
    cat: 'estatisticas', nivel: 1, valida: (v) => LIMIARES.inter.includes(Number(v)),
    texto: (v) => `Tem mais de ${v} internacionalizações?`,
    responder: (reg, v) => maisDe(reg.totais.internacionalizacoes, Number(v)),
    valores: () => LIMIARES.inter.map(String),
  },
  assist: {
    cat: 'estatisticas', nivel: 1, valida: (v) => LIMIARES.assist.includes(Number(v)),
    texto: (v) => `Fez mais de ${v} assistências?`,
    responder: (reg, v) => respostaAssistencias(reg.totais.assistencias, Number(v)),
    valores: () => LIMIARES.assist.map(String),
  },
  // Números de camisola: três faixas, e cada ✓ abre os números dessa faixa
  faixa: {
    cat: 'numeros', nivel: 1, valida: (v) => intEntre(v, 0, FAIXAS.length - 1),
    texto: (v) => {
      const [a, b] = FAIXAS[Number(v)];
      return a === 1 ? `Usou um número abaixo de ${b + 1}?` : b >= 99 ? `Usou um número acima de ${a - 1}?` : `Usou um número de ${a} a ${b}?`;
    },
    responder: (reg, v) => {
      const [a, b] = FAIXAS[Number(v)];
      return numeros(reg, (n) => n >= a && n <= b);
    },
    valores: () => FAIXAS.map((_, i) => String(i)),
  },
  num: {
    cat: 'numeros', nivel: 3, valida: (v) => intEntre(v, 1, 99),
    texto: (v) => `Usou o n.º ${v}?`, responder: (reg, v) => numeros(reg, (n) => n === Number(v)),
    requer: (v) => [[`faixa:${FAIXAS.findIndex(([a, b]) => Number(v) >= a && Number(v) <= b)}`]],
  },
  // Prémios: cada um é uma pergunta à parte
  premio: {
    cat: 'premios', nivel: 1, valida: (v) => PREMIOS[v] && PREMIOS[v].jogador !== false,
    texto: (v) => `Ganhou ${PREMIOS[v].nome}?`, responder: (reg, v) => simNao(reg.premios.some((p) => p.id === v)),
    valores: () => Object.keys(PREMIOS).filter((id) => PREMIOS[id].jogador !== false),
  },
  // Treinador: só com "é ou foi treinador?" ✓
  t_atual: {
    cat: 'treinador', nivel: 1, texto: () => 'Treina atualmente?', responder: (reg) => simNao(Boolean(tre(reg).atual)),
    requer: () => [['foi_treinador']],
  },
  t_selecao: {
    cat: 'treinador', nivel: 1, texto: () => 'Treinou uma seleção?',
    responder: (reg) => simNao(tre(reg).equipas.some((e) => e.tipo === 'selecao')), requer: () => [['foi_treinador']],
  },
  t_titulos: {
    cat: 'treinador', nivel: 1, valida: (v) => LIMIARES.t_titulos.includes(Number(v)),
    texto: (v) => (Number(v) === 0 ? 'Ganhou algum título como treinador?' : `Ganhou mais de ${v} títulos como treinador?`),
    responder: (reg, v) => maisDe(tre(reg).n_titulos ?? 0, Number(v)),
    requer: () => [['foi_treinador']], valores: () => LIMIARES.t_titulos.map(String),
  },
  t_premio: {
    cat: 'treinador', nivel: 1, valida: (v) => Boolean(PREMIOS[v]?.treinador),
    texto: (v) => `Ganhou ${PREMIOS[v].nome} como treinador?`,
    responder: (reg, v) => simNao(tre(reg).titulos.some((p) => p.id === v)),
    requer: () => [['foi_treinador']], valores: () => Object.keys(PREMIOS).filter((id) => PREMIOS[id].treinador),
  },
  t_pais: {
    cat: 'treinador', nivel: 1, valida: (v) => Boolean(PAISES[v]),
    texto: (v) => `Treinou ${emPais(v)}?`,
    responder: (reg, v) => simNao(tre(reg).equipas.some((e) => e.pais === v)),
    requer: () => [['foi_treinador']],
  },
  t_clube: {
    cat: 'treinador', nivel: 2, valida: (v, cat) => Boolean(cat.clubes[v]),
    texto: (v, cat) => `Treinou ${oClube(nomeClube(cat, v))}?`,
    responder: (reg, v) => simNao(tre(reg).equipas.some((e) => e.tipo === 'clube' && e.equipa === v)),
    requer: (v, cat) => [['foi_treinador'], [`t_pais:${cat.clubes[v]?.pais}`]],
  },
  t_sel: {
    cat: 'treinador', nivel: 2, valida: (v) => Boolean(PAISES[v]),
    texto: (v) => `Treinou a seleção ${dePais(v)}?`,
    responder: (reg, v) => simNao(tre(reg).equipas.some((e) => e.tipo === 'selecao' && e.pais === v)),
    requer: (v) => [['foi_treinador'], [`t_pais:${v}`]],
  },
  t_atual_clube: {
    cat: 'treinador', nivel: 2, valida: (v, cat) => Boolean(cat.clubes[v]),
    texto: (v, cat) => `Treina atualmente ${oClube(nomeClube(cat, v))}?`,
    responder: (reg, v) => simNao(tre(reg).atual?.tipo === 'clube' && tre(reg).atual.equipa === v),
    requer: (v, cat) => [['foi_treinador'], [`t_pais:${cat.clubes[v]?.pais}`]],
  },
  t_atual_sel: {
    cat: 'treinador', nivel: 2, valida: (v) => Boolean(PAISES[v]),
    texto: (v) => `Treina atualmente a seleção ${dePais(v)}?`,
    responder: (reg, v) => simNao(tre(reg).atual?.tipo === 'selecao' && tre(reg).atual.pais === v),
    requer: (v) => [['foi_treinador'], [`t_pais:${v}`]],
  },
};

/** Os tipos de cada categoria, pela ordem do menu. */
export const TIPOS_POR_CATEGORIA = {
  era: ['decada', 'ano'],
  nacionalidade: ['conf', 'nac'],
  posicao: ['setor', 'pos'],
  fisico: ['pe', 'altura'],
  estado: ['ativo', 'retirado', 'foi_treinador'],
  carreira: ['pais', 'pais_atual', 'liga', 'liga_atual', 'clube', 'clube_atual'],
  estatisticas: ['jogos', 'golos', 'inter', 'assist'],
  numeros: ['faixa', 'num'],
  premios: ['premio'],
  treinador: ['t_atual', 't_selecao', 't_titulos', 't_premio', 't_pais', 't_clube', 't_sel', 't_atual_clube', 't_atual_sel'],
};

/** "liga:Q324867" → { tipo: 'liga', valor: 'Q324867', def }; null se o tipo não existir. */
export function ler(chave) {
  if (typeof chave !== 'string' || chave.length > 80) return null;
  const i = chave.indexOf(':');
  const tipo = i < 0 ? chave : chave.slice(0, i);
  const valor = i < 0 ? '' : chave.slice(i + 1);
  const def = Object.hasOwn(TIPOS, tipo) ? TIPOS[tipo] : null;
  if (!def) return null;
  return { tipo, valor, def };
}

/** A chave existe e o valor faz sentido (país, liga e clube do catálogo, limiares da tabela…)? */
export function valida(chave, cat) {
  const p = ler(chave);
  if (!p) return false;
  if (!p.def.valida) return p.valor === '';
  return p.valor !== '' && Boolean(p.def.valida(p.valor, cat));
}

export const categoria = (chave) => ler(chave)?.def.cat ?? null;
export const nivel = (chave) => ler(chave)?.def.nivel ?? null;
/** Pontos de um "sim" (antes da metade de quem já foi identificado). */
export function pontos(chave) {
  const d = ler(chave)?.def;
  if (!d) return 0;
  return d.cat === 'fisico' ? PONTOS.fisico : PONTOS[`nivel${d.nivel}`];
}
/** Metade, arredondada para cima, para quem já tem o jogador identificado. */
export const comFator = (pts, identificado) => (identificado ? Math.ceil(pts * PONTOS.fator_identificado) : pts);

/** O texto da pergunta ("Jogou na La Liga?"). */
export function texto(chave, cat) {
  const p = ler(chave);
  return p ? p.def.texto(p.valor, cat) : chave;
}
/** A pergunta como afirmação ("Jogou na La Liga"), para as informações descartadas e as deduções. */
export const afirmacao = (chave, cat) => texto(chave, cat).replace(/\?$/, '');

/** A resposta do jogo, a partir do registo do jogador secreto: 'sim' | 'nao' | 'sem_registo'. */
export function responder(reg, chave) {
  const p = ler(chave);
  if (!p) throw new Error(`pergunta desconhecida: ${chave}`);
  return p.def.responder(reg, p.valor);
}

// ---------------------------------------------------------------------------
// Fichas: respostas, deduções e desbloqueio
// ---------------------------------------------------------------------------

const respondidas = (ficha) => Object.entries(ficha?.respostas ?? {});
const r = (ficha, chave) => ficha?.respostas?.[chave]?.r ?? null;

/** Outras respostas do mesmo tipo: [[valor, r]]. */
function doTipo(ficha, tipo) {
  const prefixo = `${tipo}:`;
  return respondidas(ficha).filter(([k]) => k.startsWith(prefixo)).map(([k, v]) => [k.slice(prefixo.length), v.r]);
}

const retirado = (ficha) => r(ficha, 'retirado') === 'sim' || r(ficha, 'ativo') === 'nao';
const ATUAIS = ['pais_atual', 'liga_atual', 'clube_atual'];

/**
 * O que já se sabe sem perguntar, a partir das respostas desta ficha: { r, de } (de = a chave que o decide), ou
 * null. Só valores que se excluem (limiares, década e ano, pé, ativo/retirado, o clube e o país atuais) e o que
 * uma resposta "atual" implica para a carreira toda.
 */
export function deduzir(ficha, chave) {
  const p = ler(chave);
  if (!p) return null;
  const { tipo, valor } = p;
  const achar = (cond) => respondidas(ficha).find(([k, v]) => cond(k, v.r));
  const de = (achado, res) => (achado ? { r: res, de: achado[0] } : null);

  if (LIMIARES[tipo]) {
    const n = Number(valor);
    const outros = doTipo(ficha, tipo).map(([v, res]) => [Number(v), res]);
    const acima = outros.find(([m, res]) => res === 'sim' && m >= n);
    if (acima) return { r: 'sim', de: `${tipo}:${acima[0]}` };
    const abaixo = outros.find(([m, res]) => res === 'nao' && m <= n);
    if (abaixo) return { r: 'nao', de: `${tipo}:${abaixo[0]}` };
    if (tipo === 't_titulos' && n === 0) return de(achar((k, res) => k.startsWith('t_premio:') && res === 'sim'), 'sim');
    return null;
  }
  switch (tipo) {
    case 'decada': {
      const outra = doTipo(ficha, 'decada').find(([v, res]) => v !== valor && res === 'sim');
      if (outra) return { r: 'nao', de: `decada:${outra[0]}` };
      const ano = doTipo(ficha, 'ano').find(([, res]) => res === 'sim');
      if (ano) return { r: simNao(Math.floor(Number(ano[0]) / 10) * 10 === Number(valor)), de: `ano:${ano[0]}` };
      return null;
    }
    case 'ano':
    case 'pe': {
      const outro = doTipo(ficha, tipo).find(([v, res]) => v !== valor && res === 'sim');
      return outro ? { r: 'nao', de: `${tipo}:${outro[0]}` } : null;
    }
    case 'ativo':
    case 'retirado': {
      const oposto = tipo === 'ativo' ? 'retirado' : 'ativo';
      const res = r(ficha, oposto);
      if (res === 'sim' || res === 'nao') return { r: res === 'sim' ? 'nao' : 'sim', de: oposto };
      const atual = achar((k, x) => ATUAIS.includes(ler(k)?.tipo) && x === 'sim');
      return atual ? { r: tipo === 'ativo' ? 'sim' : 'nao', de: atual[0] } : null;
    }
    case 'pais':
    case 'liga':
    case 'clube':
      return r(ficha, `${tipo}_atual:${valor}`) === 'sim' ? { r: 'sim', de: `${tipo}_atual:${valor}` } : null;
    case 'pais_atual':
    case 'liga_atual':
    case 'clube_atual': {
      if (retirado(ficha)) return { r: 'nao', de: r(ficha, 'retirado') === 'sim' ? 'retirado' : 'ativo' };
      const base = tipo.replace('_atual', '');
      if (r(ficha, `${base}:${valor}`) === 'nao') return { r: 'nao', de: `${base}:${valor}` };
      // Só há um clube atual e um país atual (a liga atual pode ser mais do que uma: subidas a meio da época).
      if (tipo !== 'liga_atual') {
        const outro = doTipo(ficha, tipo).find(([v, res]) => v !== valor && res === 'sim');
        if (outro) return { r: 'nao', de: `${tipo}:${outro[0]}` };
      }
      return null;
    }
    case 't_atual':
      return de(achar((k, res) => (k.startsWith('t_atual_clube:') || k.startsWith('t_atual_sel:')) && res === 'sim'), 'sim');
    case 't_selecao':
      return de(achar((k, res) => (k.startsWith('t_sel:') || k.startsWith('t_atual_sel:')) && res === 'sim'), 'sim');
    case 't_clube':
    case 't_sel': {
      const atual = tipo === 't_clube' ? `t_atual_clube:${valor}` : `t_atual_sel:${valor}`;
      if (r(ficha, atual) === 'sim') return { r: 'sim', de: atual };
      if (tipo === 't_sel' && r(ficha, 't_selecao') === 'nao') return { r: 'nao', de: 't_selecao' };
      return null;
    }
    case 't_atual_clube':
    case 't_atual_sel': {
      if (r(ficha, 't_atual') === 'nao') return { r: 'nao', de: 't_atual' };
      const base = tipo === 't_atual_clube' ? `t_clube:${valor}` : `t_sel:${valor}`;
      if (r(ficha, base) === 'nao') return { r: 'nao', de: base };
      if (tipo === 't_atual_sel' && r(ficha, 't_selecao') === 'nao') return { r: 'nao', de: 't_selecao' };
      const outro = achar((k, res) => k !== chave && (k.startsWith('t_atual_clube:') || k.startsWith('t_atual_sel:')) && res === 'sim');
      return outro ? { r: 'nao', de: outro[0] } : null;
    }
    default:
      return null;
  }
}

/** A resposta que a ficha tem (dada ou deduzida), ou null. */
export function valor(ficha, chave) {
  return r(ficha, chave) ?? deduzir(ficha, chave)?.r ?? null;
}

/**
 * O estado de uma pergunta nesta ficha:
 * - { estado: 'respondida', r }
 * - { estado: 'bloqueada', fechada, requer } — a hierarquia ainda não a abre (fechada: o que requer está todo ✗);
 * - { estado: 'deduzida', r, de } — já se sabe pelas outras respostas, não dá pontos;
 * - { estado: 'aberta' }.
 */
export function avaliar(ficha, chave, cat) {
  const p = ler(chave);
  if (!p) return { estado: 'bloqueada', fechada: true, requer: [] };
  const dada = r(ficha, chave);
  if (dada) return { estado: 'respondida', r: dada };
  for (const grupo of p.def.requer?.(p.valor, cat) ?? []) {
    const valores = grupo.map((k) => valor(ficha, k));
    if (!valores.includes('sim')) return { estado: 'bloqueada', fechada: grupo.length > 0 && valores.every((v) => v === 'nao' || v === 'sem_registo'), requer: grupo };
  }
  const d = deduzir(ficha, chave);
  if (d) return { estado: 'deduzida', ...d };
  return { estado: 'aberta' };
}

/** Pode perguntar-se isto a esta ficha agora? */
export const disponivel = (ficha, chave, cat) => valida(chave, cat) && avaliar(ficha, chave, cat).estado === 'aberta';

/** Os "sim" que contam para o palpite: as respostas estruturadas e as livres (as deduções não contam). */
export function contarSim(ficha) {
  return respondidas(ficha).filter(([, v]) => v.r === 'sim').length + (ficha?.livres ?? []).filter((l) => l.r === 'sim').length;
}

/** Algum clube confirmado (na carreira ou o atual)? */
export const clubeConfirmado = (ficha) => respondidas(ficha).some(([k, v]) => v.r === 'sim' && /^clube(_atual)?:/.test(k));

/** O que falta para o palpite final: { sim, clube } (sim = quantos "sim" faltam). */
export function faltaParaPalpite(ficha) {
  return { sim: Math.max(0, SIM_MINIMOS - contarSim(ficha)), clube: !clubeConfirmado(ficha) };
}
export const palpiteDesbloqueado = (ficha) => {
  const f = faltaParaPalpite(ficha);
  return f.sim === 0 && !f.clube;
};

/**
 * Os valores candidatos de um tipo nesta ficha (para o menu): os fixos, ou os que os pais com ✓ abrem
 * (as ligas dos países confirmados, os clubes das ligas confirmadas…). Devolve chaves completas.
 */
export function candidatas(ficha, tipo, cat) {
  const d = TIPOS[tipo];
  if (!d) return [];
  if (!d.valida) return [tipo];
  if (d.valores) return d.valores().map((v) => `${tipo}:${v}`);
  const sim = (k) => valor(ficha, k) === 'sim';
  const comSim = (prefixo) => respondidas(ficha).map(([k]) => k).concat(deduzidasSim(ficha, prefixo))
    .filter((k) => k.startsWith(prefixo) && sim(k)).map((k) => k.slice(prefixo.length));
  const unicos = (lista) => [...new Set(lista)];
  switch (tipo) {
    case 'ano':
      return comSim('decada:').flatMap((dec) => Array.from({ length: 10 }, (_, i) => `ano:${Number(dec) + i}`));
    case 'nac': {
      const confs = new Set(comSim('conf:'));
      return Object.keys(PAISES).filter((c) => confs.has(PAISES[c].confederacao)).map((c) => `nac:${c}`);
    }
    case 'pos': {
      const setores = new Set(comSim('setor:'));
      return Object.keys(POSICOES).filter((p) => setores.has(POSICOES[p].setor)).map((p) => `pos:${p}`);
    }
    case 'pais':
    case 'pais_atual':
      return cat.paisesComLiga.map((c) => `${tipo}:${c}`);
    case 'liga':
    case 'liga_atual': {
      const paises = unicos([...comSim('pais:'), ...comSim('pais_atual:')]);
      return paises.flatMap((c) => cat.ligasPorPais[c] ?? []).map((l) => `${tipo}:${l}`);
    }
    case 'clube':
    case 'clube_atual': {
      const ligas = unicos([...comSim('liga:'), ...comSim('liga_atual:')]);
      return unicos(ligas.flatMap((l) => cat.clubesPorLiga[l] ?? [])).map((c) => `${tipo}:${c}`);
    }
    case 'num':
      return comSim('faixa:').flatMap((i) => {
        const [a, b] = FAIXAS[Number(i)];
        return Array.from({ length: b - a + 1 }, (_, k) => `num:${a + k}`);
      });
    case 't_pais':
      return Object.keys(PAISES).map((c) => `t_pais:${c}`);
    case 't_clube':
    case 't_atual_clube':
      return comSim('t_pais:').flatMap((c) => cat.clubesPorPais[c] ?? []).map((q) => `${tipo}:${q}`);
    case 't_sel':
    case 't_atual_sel':
      return comSim('t_pais:').map((c) => `${tipo}:${c}`);
    default:
      return [];
  }
}

/** As chaves "base" que uma resposta "atual" com ✓ deixa deduzidas com ✓ (liga_atual:L ✓ → liga:L). */
function deduzidasSim(ficha, prefixo) {
  const base = prefixo.replace(/:$/, '');
  if (!['pais', 'liga', 'clube'].includes(base)) return [];
  return doTipo(ficha, `${base}_atual`).filter(([, res]) => res === 'sim').map(([v]) => `${base}:${v}`);
}

/** Resumo de uma categoria nesta ficha: { sim, nao, sem_registo } das respostas dadas. */
export function resumoCategoria(ficha, cat) {
  const conta = { sim: 0, nao: 0, sem_registo: 0 };
  for (const [k, v] of respondidas(ficha)) if (categoria(k) === cat) conta[v.r] += 1;
  return conta;
}

/** A categoria Treinador só aparece com "é ou foi treinador?" ✓. */
export const comTreinador = (ficha) => valor(ficha, 'foi_treinador') === 'sim';
