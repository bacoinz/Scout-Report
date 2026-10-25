// Perguntas estruturadas: textos, níveis e pontos, desbloqueio por hierarquia, deduções e respostas.
// O mesmo código corre no Durable Object (que responde e valida) e no browser (que monta o menu e as fichas).
// Puro. Uma pergunta é uma chave "tipo:valor" ("clube:Q8682", "jogos:300", "ativo"); uma ficha é
// { respostas: { [chave]: { r: 'sim' | 'nao' | 'sem_registo', autor, ronda } }, livres: [{ texto, r, autor }],
//   completos: { pais, clube } } — completos: o servidor já viu que estão encontrados todos os países (ou clubes).
import { PERGUNTAS, PAISES } from './dados.gen.js';

export { PAISES };
export const COBERTURA_MINIMA = 0.9;
export const PONTOS = PERGUNTAS.pontos;
export const SIM_MINIMOS = PERGUNTAS.palpite.sim_minimos;
export const ORDEM = PERGUNTAS.ordem_categorias;
export const NOMES_CATEGORIAS = {
  era: 'Anos', nacionalidade: 'Nacionalidade', posicao: 'Posição', fisico: 'Físico', estado: 'Estado',
  carreira: 'Carreira', estatisticas: 'Estatísticas', numeros: 'Números', premios: 'Prémios', treinador: 'Treinador',
};

/** As confederações mostram-se só pelo continente (a Austrália, da AFC, é "Ásia"). */
export const CONFEDERACOES = {
  UEFA: { nome: 'Europa', de: 'da Europa' },
  CONMEBOL: { nome: 'América do Sul', de: 'da América do Sul' },
  CONCACAF: { nome: 'América do Norte e Central', de: 'da América do Norte e Central' },
  CAF: { nome: 'África', de: 'de África' },
  AFC: { nome: 'Ásia', de: 'da Ásia' },
  OFC: { nome: 'Oceânia', de: 'da Oceânia' },
};
export const SETORES = PERGUNTAS.setores;
export const POSICOES = PERGUNTAS.posicoes;
export const PREMIOS = PERGUNTAS.premios;
const PES = { direito: 'É destro?', esquerdo: 'É canhoto?', ambos: 'É ambidestro?' };
const FAIXAS = PERGUNTAS.numeros.faixas;
const LIMIARES = {
  jogos: PERGUNTAS.estatisticas.jogos,
  golos: PERGUNTAS.estatisticas.golos,
  inter: PERGUNTAS.estatisticas.internacionalizacoes,
  assist: PERGUNTAS.estatisticas.assistencias,
  inter_menos: PERGUNTAS.estatisticas.internacionalizacoes_menos_de,
  assist_menos: PERGUNTAS.estatisticas.assistencias_menos_de,
  altura: PERGUNTAS.fisico.alturas_cm,
  baixo: PERGUNTAS.fisico.menos_de_cm,
  // "Ganhou algum título como treinador?" é o limiar 0 ("mais de 0").
  t_titulos: [0, ...PERGUNTAS.treinador.titulos.filter((n) => n > 1)],
};

/** Os pares "menos de N" → "mais de N" do mesmo valor (excluem-se: "menos de 25 ✓" fecha os "mais de"). */
const MENOS_DE = { baixo: 'altura', assist_menos: 'assist', inter_menos: 'inter' };

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
const anos = (d) => (d < 2000 ? `anos ${String(d).slice(2)}` : `anos ${d}`);

// ---------------------------------------------------------------------------
// Catálogo (clubes do D1) com os índices para o menu
// ---------------------------------------------------------------------------

/**
 * { clubes: {id: {nome, pais}} } → o mesmo, mais os clubes de cada país. O país de um clube é o das passagens dos
 * jogadores por ele (o da liga), o mesmo que responde a "jogou em {país}?". As ligas do D1 já não entram nas perguntas.
 */
export function prepararCatalogo({ clubes = {}, versao = null } = {}) {
  const clubesPorPais = {};
  for (const [id, c] of Object.entries(clubes)) if (c.pais) (clubesPorPais[c.pais] ??= []).push(id);
  const porNome = (a, b) => (clubes[a]?.nome ?? a).localeCompare(clubes[b]?.nome ?? b, 'pt');
  for (const lista of Object.values(clubesPorPais)) lista.sort(porNome);
  const paisesComClubes = Object.keys(clubesPorPais).sort((a, b) => nomePais(a).localeCompare(nomePais(b), 'pt'));
  return { versao, clubes, clubesPorPais, paisesComClubes };
}

export const nomeClube = (cat, id) => cat.clubes[id]?.nome ?? id;
/** Os países e os clubes da carreira de um jogador (para saber quando já se encontraram todos). */
const paisesDe = (reg) => [...new Set(reg.carreira.flatMap((c) => c.paises_liga))];
const clubesDe = (reg) => [...new Set(reg.carreira.map((c) => c.clube))];

// ---------------------------------------------------------------------------
// Tipos de pergunta
// ---------------------------------------------------------------------------

const intEntre = (v, a, b) => /^\d+$/.test(v) && Number(v) >= a && Number(v) <= b;
const tre = (reg) => reg.treinador ?? { equipas: [], atual: null, titulos: [], n_titulos: 0 };
/**
 * O estado tem uma só resposta certa: no ativo (a jogar), treinador (já não joga e é ou foi treinador) ou retirado.
 * Um jogador no ativo que já treinou conta como no ativo.
 */
const situacao = (reg) => (reg.estado === 'ativo' ? 'ativo' : reg.treinador ? 'treinador' : 'retirado');
const ESTADOS = ['ativo', 'retirado', 'treinador'];

/** Resposta a "mais de N" com o valor (ou SEM REGISTO sem ele). */
const maisDe = (valor, n) => (valor == null ? 'sem_registo' : valor > n ? 'sim' : 'nao');
const simNao = (b) => (b ? 'sim' : 'nao');

/** Números de camisola e assistências: um "sim" basta com dados parciais; um "não" pede a carreira coberta. */
function numeros(reg, aceita) {
  const t = reg.totais.numeros;
  if (t.conhecidos.some(aceita)) return 'sim';
  return t.cobertura >= COBERTURA_MINIMA ? 'nao' : 'sem_registo';
}
/** "Menos de N assistências?": "sim" só com o máximo estimado (ou a carreira coberta) abaixo de N. */
export function respostaAssistenciasMenos(assist, limiar) {
  if (assist.conhecidas >= limiar) return 'nao';
  if ((assist.maximo ?? Infinity) < limiar || assist.cobertura >= COBERTURA_MINIMA) return 'sim';
  return 'sem_registo';
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
  baixo: {
    cat: 'fisico', nivel: 1, valida: (v) => LIMIARES.baixo.includes(Number(v)),
    texto: (v) => `Mede menos de ${(Number(v) / 100).toFixed(2).replace('.', ',')} m?`,
    responder: (reg, v) => (reg.perfil?.altura_cm ? simNao(reg.perfil.altura_cm < Number(v)) : 'sem_registo'),
    valores: () => LIMIARES.baixo.map(String),
  },
  altura: {
    cat: 'fisico', nivel: 1, valida: (v) => LIMIARES.altura.includes(Number(v)),
    texto: (v) => `Mede mais de ${(Number(v) / 100).toFixed(2).replace('.', ',')} m?`,
    responder: (reg, v) => maisDe(reg.perfil?.altura_cm ?? null, Number(v)),
    valores: () => LIMIARES.altura.map(String),
  },
  // Estado: uma só resposta certa
  ativo: { cat: 'estado', nivel: 1, texto: () => 'Está no ativo?', responder: (reg) => simNao(situacao(reg) === 'ativo') },
  retirado: { cat: 'estado', nivel: 1, texto: () => 'Está retirado?', responder: (reg) => simNao(situacao(reg) === 'retirado') },
  treinador: { cat: 'estado', nivel: 1, texto: () => 'É treinador?', responder: (reg) => simNao(situacao(reg) === 'treinador') },
  // Carreira: país → clube, sem distinguir o passado do presente ("Jogou/joga em Espanha?"). Pergunta-se pelos países
  // e pelos clubes até estarem todos encontrados.
  pais: {
    cat: 'carreira', nivel: 1, valida: (v, cat) => Boolean(cat.clubesPorPais[v]),
    texto: (v) => `Jogou/joga ${emPais(v)}?`,
    responder: (reg, v) => simNao(reg.carreira.some((c) => c.paises_liga.includes(v))),
  },
  clube: {
    cat: 'carreira', nivel: 2, valida: (v, cat) => Boolean(cat.clubes[v]?.pais),
    texto: (v, cat) => `Jogou/joga ${noClube(nomeClube(cat, v))}?`,
    responder: (reg, v) => simNao(reg.carreira.some((c) => c.clube === v)),
    requer: (v, cat) => [[`pais:${cat.clubes[v]?.pais}`]],
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
  inter_menos: {
    cat: 'estatisticas', nivel: 1, valida: (v) => LIMIARES.inter_menos.includes(Number(v)),
    texto: (v) => `Tem menos de ${v} internacionalizações?`,
    responder: (reg, v) => simNao(reg.totais.internacionalizacoes < Number(v)),
    valores: () => LIMIARES.inter_menos.map(String),
  },
  assist_menos: {
    cat: 'estatisticas', nivel: 1, valida: (v) => LIMIARES.assist_menos.includes(Number(v)),
    texto: (v) => `Fez menos de ${v} assistências?`,
    responder: (reg, v) => respostaAssistenciasMenos(reg.totais.assistencias, Number(v)),
    valores: () => LIMIARES.assist_menos.map(String),
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
      return b >= 99 ? `Usou um número a partir do ${a}?` : `Usou um número de ${a} a ${b}?`;
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
  // Treinador: só com "é treinador?" ✓ (no estado)
  t_atual: {
    cat: 'treinador', nivel: 1, texto: () => 'Treina atualmente?', responder: (reg) => simNao(Boolean(tre(reg).atual)),
    requer: () => [['treinador']],
  },
  t_selecao: {
    cat: 'treinador', nivel: 1, texto: () => 'Treinou uma seleção?',
    responder: (reg) => simNao(tre(reg).equipas.some((e) => e.tipo === 'selecao')), requer: () => [['treinador']],
  },
  t_titulos: {
    cat: 'treinador', nivel: 1, valida: (v) => LIMIARES.t_titulos.includes(Number(v)),
    texto: (v) => (Number(v) === 0 ? 'Ganhou algum título como treinador?' : `Ganhou mais de ${v} títulos como treinador?`),
    responder: (reg, v) => maisDe(tre(reg).n_titulos ?? 0, Number(v)),
    requer: () => [['treinador']], valores: () => LIMIARES.t_titulos.map(String),
  },
  t_premio: {
    cat: 'treinador', nivel: 1, valida: (v) => Boolean(PREMIOS[v]?.treinador),
    texto: (v) => `Ganhou ${PREMIOS[v].nome} como treinador?`,
    responder: (reg, v) => simNao(tre(reg).titulos.some((p) => p.id === v)),
    requer: () => [['treinador']], valores: () => Object.keys(PREMIOS).filter((id) => PREMIOS[id].treinador),
  },
  t_pais: {
    cat: 'treinador', nivel: 1, valida: (v) => Boolean(PAISES[v]),
    texto: (v) => `Treinou ${emPais(v)}?`,
    responder: (reg, v) => simNao(tre(reg).equipas.some((e) => e.pais === v)),
    requer: () => [['treinador']],
  },
  t_clube: {
    cat: 'treinador', nivel: 2, valida: (v, cat) => Boolean(cat.clubes[v]),
    texto: (v, cat) => `Treinou ${oClube(nomeClube(cat, v))}?`,
    responder: (reg, v) => simNao(tre(reg).equipas.some((e) => e.tipo === 'clube' && e.equipa === v)),
    requer: (v, cat) => [['treinador'], [`t_pais:${cat.clubes[v]?.pais}`]],
  },
  t_sel: {
    cat: 'treinador', nivel: 2, valida: (v) => Boolean(PAISES[v]),
    texto: (v) => `Treinou a seleção ${dePais(v)}?`,
    responder: (reg, v) => simNao(tre(reg).equipas.some((e) => e.tipo === 'selecao' && e.pais === v)),
    requer: (v) => [['treinador'], [`t_pais:${v}`]],
  },
  t_atual_clube: {
    cat: 'treinador', nivel: 2, valida: (v, cat) => Boolean(cat.clubes[v]),
    texto: (v, cat) => `Treina atualmente ${oClube(nomeClube(cat, v))}?`,
    responder: (reg, v) => simNao(tre(reg).atual?.tipo === 'clube' && tre(reg).atual.equipa === v),
    requer: (v, cat) => [['treinador'], [`t_pais:${cat.clubes[v]?.pais}`]],
  },
  t_atual_sel: {
    cat: 'treinador', nivel: 2, valida: (v) => Boolean(PAISES[v]),
    texto: (v) => `Treina atualmente a seleção ${dePais(v)}?`,
    responder: (reg, v) => simNao(tre(reg).atual?.tipo === 'selecao' && tre(reg).atual.pais === v),
    requer: (v) => [['treinador'], [`t_pais:${v}`]],
  },
};

/** Os tipos de cada categoria, pela ordem do menu. */
export const TIPOS_POR_CATEGORIA = {
  era: ['decada', 'ano'],
  nacionalidade: ['conf', 'nac'],
  posicao: ['setor', 'pos'],
  fisico: ['pe', 'baixo', 'altura'],
  estado: ['ativo', 'retirado', 'treinador'],
  carreira: ['pais', 'clube'],
  estatisticas: ['jogos', 'golos', 'assist_menos', 'assist', 'inter_menos', 'inter'],
  numeros: ['faixa', 'num'],
  premios: ['premio'],
  treinador: ['t_atual', 't_selecao', 't_titulos', 't_premio', 't_pais', 't_clube', 't_sel', 't_atual_clube', 't_atual_sel'],
};

/** "clube:Q8682" → { tipo: 'clube', valor: 'Q8682', def }; null se o tipo não existir. */
export function ler(chave) {
  if (typeof chave !== 'string' || chave.length > 80) return null;
  const i = chave.indexOf(':');
  const tipo = i < 0 ? chave : chave.slice(0, i);
  const valor = i < 0 ? '' : chave.slice(i + 1);
  const def = Object.hasOwn(TIPOS, tipo) ? TIPOS[tipo] : null;
  if (!def) return null;
  return { tipo, valor, def };
}

/** A chave existe e o valor faz sentido (país e clube do catálogo, limiares da tabela…)? */
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

const TODOS = { pais: 'Já se encontraram todos os países', clube: 'Já se encontraram todos os clubes' };

/** O texto da pergunta ("Jogou no Benfica?"). */
export function texto(chave, cat) {
  if (String(chave).startsWith('joker:')) return 'Revelado na Ronda Joker';
  if (String(chave).startsWith('completo:')) return TODOS[String(chave).slice(9)] ?? chave;
  const p = ler(chave);
  return p ? p.def.texto(p.valor, cat) : chave;
}
/** A pergunta como afirmação ("Jogou no Benfica"), para as informações descartadas e as deduções. */
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

/**
 * O que já se sabe sem perguntar, a partir das respostas desta ficha: { r, de } (de = a chave que o decide), ou
 * null. Só valores que se excluem (limiares, década e ano, pé, o estado) e, com todos os países (ou clubes)
 * encontrados, os que faltam.
 */
export function deduzir(ficha, chave) {
  const p = ler(chave);
  if (!p) return null;
  const { tipo, valor } = p;
  const joker = deduzirDaJoker(ficha?.valores ?? {}, tipo, valor);
  if (joker) return joker;
  const achar = (cond) => respondidas(ficha).find(([k, v]) => cond(k, v.r));
  const de = (achado, res) => (achado ? { r: res, de: achado[0] } : null);

  if (MENOS_DE[tipo]) {
    // "Menos de 25" fica "não" com algum "mais de N" ✓ (N ≥ 24: o valor é pelo menos 25).
    const mais = MENOS_DE[tipo];
    const acima = doTipo(ficha, mais).find(([m, res]) => res === 'sim' && Number(m) >= Number(valor) - 1);
    return acima ? { r: 'nao', de: `${mais}:${acima[0]}` } : null;
  }
  const menos = Object.keys(MENOS_DE).find((t) => MENOS_DE[t] === tipo);
  if (menos) {
    const abaixo = doTipo(ficha, menos).find(([m, res]) => res === 'sim' && Number(m) <= Number(valor) + 1);
    if (abaixo) return { r: 'nao', de: `${menos}:${abaixo[0]}` };
  }
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
    case 'retirado':
    case 'treinador': {
      // Uma só resposta certa: um ✓ fecha as outras duas e dois ✗ dão a terceira.
      const outros = ESTADOS.filter((k) => k !== tipo);
      const certo = outros.find((k) => r(ficha, k) === 'sim');
      if (certo) return { r: 'nao', de: certo };
      return outros.every((k) => r(ficha, k) === 'nao') ? { r: 'sim', de: outros[0] } : null;
    }
    case 'pais':
    case 'clube':
      return ficha?.completos?.[tipo] ? { r: 'nao', de: `completo:${tipo}` } : null;
    case 'premio': {
      // Os torneios de uma confederação (o Europeu, a Taça da Ásia…) ficam "não" com uma nacionalidade
      // confirmada de outra confederação, ou com o continente dela descartado.
      const confs = PREMIOS[valor]?.confederacoes;
      if (!confs) return null;
      const nacs = doTipo(ficha, 'nac').filter(([, res]) => res === 'sim').map(([v]) => v);
      if (nacs.length && !nacs.some((n) => confs.includes(PAISES[n]?.confederacao))) return { r: 'nao', de: `nac:${nacs[0]}` };
      if (confs.every((c) => r(ficha, `conf:${c}`) === 'nao')) return { r: 'nao', de: `conf:${confs[0]}` };
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

/** Que perguntas cada valor revelado na Joker decide, e como. */
const PELA_JOKER = {
  jogos: (v, n) => v > n, golos: (v, n) => v > n, inter: (v, n) => v > n, inter_menos: (v, n) => v < n,
  t_titulos: (v, n) => v > n,
};
const CAMPO_DA_JOKER = { jogos: 'jogos', golos: 'golos', inter: 'inter', inter_menos: 'inter', t_titulos: 't_titulos' };

/** { r, de: 'joker:<pergunta>' } se um valor revelado na Joker decide esta pergunta. */
function deduzirDaJoker(valores, tipo, valor) {
  const campo = CAMPO_DA_JOKER[tipo];
  if (campo && Number.isInteger(valores[campo])) return { r: simNao(PELA_JOKER[tipo](valores[campo], Number(valor))), de: `joker:${campo}` };
  if ((tipo === 'decada' || tipo === 'ano') && Number.isInteger(valores.estreia)) {
    const certo = tipo === 'decada' ? Math.floor(valores.estreia / 10) * 10 === Number(valor) : valores.estreia === Number(valor);
    return { r: simNao(certo), de: 'joker:estreia' };
  }
  return null;
}

/** A resposta que a ficha tem (dada ou deduzida), ou null. */
export function valor(ficha, chave) {
  return r(ficha, chave) ?? deduzir(ficha, chave)?.r ?? null;
}

/**
 * Já se encontraram todos os países e todos os clubes da carreira? Só quem tem o registo o sabe (o servidor), depois
 * de cada resposta; a ficha guarda-o em `completos` e os países (ou clubes) que faltam perguntar passam a "não".
 */
export function completos(reg, ficha) {
  const sim = (k) => r(ficha, k) === 'sim';
  return { pais: paisesDe(reg).every((p) => sim(`pais:${p}`)), clube: clubesDe(reg).every((c) => sim(`clube:${c}`)) };
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

/** Algum clube confirmado? */
export const clubeConfirmado = (ficha) => respondidas(ficha).some(([k, v]) => v.r === 'sim' && k.startsWith('clube:'));

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
 * (os clubes dos países confirmados, os anos da década confirmada…). Devolve chaves completas.
 */
export function candidatas(ficha, tipo, cat) {
  const d = TIPOS[tipo];
  if (!d) return [];
  if (!d.valida) return [tipo];
  if (d.valores) return d.valores().map((v) => `${tipo}:${v}`);
  const sim = (k) => valor(ficha, k) === 'sim';
  const comSim = (prefixo) => respondidas(ficha).map(([k]) => k).filter((k) => k.startsWith(prefixo) && sim(k))
    .map((k) => k.slice(prefixo.length));
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
      return cat.paisesComClubes.map((c) => `pais:${c}`);
    case 'clube':
      return comSim('pais:').flatMap((c) => cat.clubesPorPais[c] ?? []).map((c) => `clube:${c}`);
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

/** Resumo de uma categoria nesta ficha: { sim, nao, sem_registo } das respostas dadas. */
export function resumoCategoria(ficha, cat) {
  const conta = { sim: 0, nao: 0, sem_registo: 0 };
  for (const [k, v] of respondidas(ficha)) if (categoria(k) === cat) conta[v.r] += 1;
  return conta;
}

/** A categoria Treinador só aparece com "Treinador" ✓ no estado. */
export const comTreinador = (ficha) => valor(ficha, 'treinador') === 'sim';
