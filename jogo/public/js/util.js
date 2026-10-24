// Utilitários do cliente (do Guess The Kit).

export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
export const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

/** Cria um elemento HTML. `attrs`: class, text, dataset, style, on* e atributos normais. */
export function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.setAttribute('class', v);
    else if (k === 'text') n.textContent = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, valor] of Object.entries(v)) {
        if (p.startsWith('--')) n.style.setProperty(p, valor);
        else n.style[p] = valor;
      }
    } else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) n.append(f);
  return n;
}

/** 38 000 → "0:38" */
export function formatarTempo(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function ler(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function guardar(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // modo privado: fica só em memória
  }
}

export function novoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
export const pts = (n) => `${n} ${n === 1 ? 'pt' : 'pts'}`;

/** Rotação fixa e pequena de um carimbo, a partir de um texto (para não mexer a cada desenho). */
export function rotacao(texto, max = 4) {
  let h = 0;
  for (const c of String(texto)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `${((Math.abs(h) % (2 * max * 10 + 1)) / 10 - max).toFixed(1)}deg`;
}

/** "1989–1992" → "89–92"; sem fim → "23–". */
export function epocas(inicio, fim, ativo = false) {
  const curto = (a) => (a == null ? '' : String(a).slice(2));
  if (inicio == null) return '—';
  if (fim == null) return ativo ? `${curto(inicio)}–` : curto(inicio);
  return inicio === fim ? curto(inicio) : `${curto(inicio)}–${curto(fim)}`;
}

/** "1972-06-23" → "23/6/1972" */
export function data(iso) {
  if (!iso) return '?';
  const [a, m, d] = iso.split('-').map(Number);
  return d ? `${d}/${m}/${a}` : String(a);
}

/** Miniatura da Wikimedia Commons (o URL original pode ter vários MB). */
export function miniatura(url, largura = 500) {
  const m = String(url ?? '').match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(\w)\/(\w\w)\/([^/]+)$/);
  if (!m) return url;
  const [, a, ab, ficheiro] = m;
  const extra = /\.svg$/i.test(ficheiro) ? '.png' : '';
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${ficheiro}/${largura}px-${ficheiro}${extra}`;
}

/** "Foto: Autor, CC BY 4.0, via Wikimedia Commons" (só no title da imagem). */
export const creditoFoto = (foto) => (foto ? `Foto: ${foto.autor || 'autor desconhecido'}${foto.licenca ? `, ${foto.licenca}` : ''}, via Wikimedia Commons` : '');
