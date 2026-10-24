// Nomes dos jogadores para o palpite final: sem acentos, maiúsculas nem pontuação, com os aliases da Wikidata, os
// apelidos ("Figo", "Van Basten") e gralhas pequenas (1 até 6 letras, 2 acima). Puro e igual no browser e no
// servidor. normalizar/tolerancia/distancia vêm do Hidden Eleven e são iguais ao `normalizar` do pipeline
// (pipeline/scout/normalizar.py); os apelidos também.

const ESPECIAIS = { ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ß: 'ss', æ: 'ae', œ: 'oe', ı: 'i' };
const PARTICULAS = new Set([
  'van', 'von', 'der', 'den', 'de', 'di', 'da', 'das', 'do', 'dos', 'del', 'della', 'la', 'le', 'ten', 'ter', 'el', 'al', 'du', 'dal', 'mac',
]);
const SUFIXOS = new Set(['junior', 'jr', 'filho', 'sobrinho', 'neto']);

/** Minúsculas, sem acentos, sem pontuação, espaços simplificados. */
export function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[øłđðþßæœı]/g, (c) => ESPECIAIS[c])
    .replace(/['’‘`´ʼ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const letras = (chave) => chave.replace(/ /g, '').length;

/** Gralhas toleradas: 1 para nomes até 6 letras, 2 para nomes maiores. */
export function tolerancia(chave) {
  return letras(chave) <= 6 ? 1 : 2;
}

/**
 * Distância de Damerau-Levenshtein restrita (troca de letras vizinhas conta 1).
 * Devolve max + 1 assim que for impossível ficar dentro de `max`.
 */
export function distancia(a, b, max = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  let antes = null;
  let anterior = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const atual = [i];
    let menor = i;
    for (let j = 1; j <= m; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo);
      if (antes && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, antes[j - 2] + 1);
      }
      atual[j] = v;
      if (v < menor) menor = v;
    }
    if (menor > max) return max + 1;
    antes = anterior;
    anterior = atual;
  }
  return anterior[m];
}

/** Índice do termo onde começa o apelido, contando com as partículas ("marco van basten" → 1). */
function inicioDoApelido(termos) {
  let inicio = termos.length - 1;
  while (inicio > 1 && PARTICULAS.has(termos[inicio - 1])) inicio--;
  return Math.max(inicio, 0);
}

/**
 * Apelidos automáticos:
 * - o último termo, com e sem as partículas que o antecedem ("van basten", "basten");
 * - com três ou mais termos, os dois últimos ("sa pinto", "kolo muani");
 * - se o último termo for um sufixo ("Júnior", "Filho"), também o que vem antes.
 */
function apelidos(termos) {
  if (termos.length < 2) return [];
  const ultimo = termos[termos.length - 1];
  const inicio = inicioDoApelido(termos);
  const resultado = [];
  if (inicio < termos.length - 1) resultado.push(termos.slice(inicio).join(' '));
  else if (termos.length >= 3) resultado.push(termos.slice(-2).join(' '));
  resultado.push(ultimo);
  if (SUFIXOS.has(ultimo)) {
    const semSufixo = termos.slice(0, -1);
    resultado.push(semSufixo.join(' '), ...apelidos(semSufixo));
  }
  return resultado.filter((c) => letras(c) >= 3);
}

export const PRIORIDADE = { COMPLETO: 3, ALIAS: 2, APELIDO: 1 };

/** Chaves de um jogador com a prioridade de cada uma (o nome, os aliases e os apelidos do nome). */
function chavesDe(j) {
  const mapa = new Map();
  const juntar = (chave, prioridade) => {
    if (chave && (mapa.get(chave) ?? 0) < prioridade) mapa.set(chave, prioridade);
  };
  const completo = normalizar(j.nome);
  juntar(completo, PRIORIDADE.COMPLETO);
  for (const a of j.aliases ?? []) juntar(normalizar(a), PRIORIDADE.ALIAS);
  for (const a of apelidos(completo.split(' '))) juntar(a, PRIORIDADE.APELIDO);
  return mapa;
}

/** Índice dos jogadores: [{ id, nome, aliases, dica }]. */
export function criarIndice(jogadores) {
  const porChave = new Map(); // chave -> Map(id -> prioridade)
  const porId = new Map();
  for (const j of jogadores) {
    porId.set(j.id, j);
    for (const [chave, prioridade] of chavesDe(j)) {
      if (!porChave.has(chave)) porChave.set(chave, new Map());
      const ids = porChave.get(chave);
      if ((ids.get(j.id) ?? 0) < prioridade) ids.set(j.id, prioridade);
    }
  }
  const chaves = [];
  for (const [chave, ids] of porChave) {
    const topo = Math.max(...ids.values());
    chaves.push({ chave, prioridade: topo, ids: [...ids].filter(([, p]) => p === topo).map(([id]) => id), tol: tolerancia(chave), todos: [...ids.keys()] });
  }
  return { chaves, porChave: new Map(chaves.map((c) => [c.chave, c])), porId };
}

/**
 * O que foi escrito: { tipo: 'unico', id } | { tipo: 'ambiguo', ids } | { tipo: 'nenhum' }.
 * A correspondência exata vem primeiro: o nome de outro jogador nunca é "corrigido" para este.
 */
export function procurar(indice, texto) {
  const alvo = normalizar(texto);
  if (!alvo) return { tipo: 'nenhum' };
  const exato = indice.porChave.get(alvo);
  if (exato) return exato.ids.length === 1 ? { tipo: 'unico', id: exato.ids[0], distancia: 0 } : { tipo: 'ambiguo', ids: exato.ids };
  if (letras(alvo) < 3) return { tipo: 'nenhum' };
  let menor = Infinity;
  let candidatos = [];
  for (const c of indice.chaves) {
    const d = distancia(alvo, c.chave, c.tol);
    if (d > c.tol || d > menor) continue;
    if (d < menor) {
      menor = d;
      candidatos = [];
    }
    candidatos.push(c);
  }
  if (!candidatos.length) return { tipo: 'nenhum' };
  const melhor = new Map();
  for (const c of candidatos) for (const id of c.ids) melhor.set(id, Math.max(melhor.get(id) ?? 0, c.prioridade));
  const topo = Math.max(...melhor.values());
  const ids = [...melhor].filter(([, p]) => p === topo).map(([id]) => id);
  return ids.length === 1 ? { tipo: 'unico', id: ids[0], distancia: menor } : { tipo: 'ambiguo', ids };
}

/**
 * Sugestões para o autocompletar: primeiro quem tem uma chave a começar pelo texto (o nome antes dos aliases),
 * depois quem a contém, depois as gralhas. Devolve até `max` jogadores ({ id, nome, dica }).
 */
export function sugerir(indice, texto, max = 8) {
  const alvo = normalizar(texto);
  if (letras(alvo) < 2) return [];
  const pontos = new Map();
  const dar = (id, p) => pontos.set(id, Math.max(pontos.get(id) ?? 0, p));
  for (const c of indice.chaves) {
    const palavras = c.chave.split(' ');
    let p = 0;
    if (c.chave === alvo) p = 100;
    else if (c.chave.startsWith(alvo)) p = 80;
    else if (palavras.some((w) => w.startsWith(alvo))) p = 60;
    else if (alvo.length >= 3 && c.chave.includes(alvo)) p = 40;
    else if (letras(alvo) >= 4 && distancia(alvo, c.chave.slice(0, alvo.length + 1), 1) <= 1) p = 20;
    if (p) for (const id of c.todos) dar(id, p + c.prioridade);
  }
  return [...pontos]
    .sort(([a, pa], [b, pb]) => pb - pa || indice.porId.get(a).nome.localeCompare(indice.porId.get(b).nome, 'pt'))
    .slice(0, max)
    .map(([id]) => indice.porId.get(id));
}
