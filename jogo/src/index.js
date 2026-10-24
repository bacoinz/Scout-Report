// Worker: cria salas, encaminha WebSockets para o Durable Object da sala, serve o catálogo e os nomes do D1 e o
// frontend. (Do Guess The Kit.)
import { ALFABETO_CODIGO } from './regras.js';
import { lerCatalogo, lerNomes, lerVersao } from './catalogo.js';

export { Sala } from './sala.js';

const json = (dados, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache } });

function gerarCodigo() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => ALFABETO_CODIGO[b % ALFABETO_CODIGO.length]).join('');
}

async function criarSala(request, env) {
  let corpo = {};
  try {
    corpo = await request.json();
  } catch {
    // corpo vazio: sala sem token de anfitrião
  }
  const anfitriaoToken = typeof corpo.token === 'string' && corpo.token.length <= 64 ? corpo.token : null;
  for (let tentativa = 0; tentativa < 12; tentativa++) {
    const codigo = gerarCodigo();
    const { ok } = await env.SALAS.getByName(codigo).criar({ codigo, anfitriaoToken });
    if (ok) return json({ codigo });
  }
  return json({ erro: 'Não foi possível criar a sala. Tenta outra vez.' }, 503);
}

/**
 * Catálogo e nomes: pedidos com `?v=<versão>`. Com a versão atual guardam-se para sempre no browser (mudam com a
 * versão da exportação); sem ela, ou com uma antiga, só um minuto.
 */
async function servirComVersao(request, env, ler) {
  const pedida = new URL(request.url).searchParams.get('v');
  const versao = await lerVersao(env.DB);
  const dados = await ler(env.DB);
  return json(dados, 200, pedida === versao ? 'public, max-age=31536000, immutable' : 'public, max-age=60');
}

/**
 * O index.html com a pré-visualização do Discord: imagem com URL absoluto e, na página de uma sala, título e
 * descrição com o código.
 */
async function pagina(request, env, codigo = null) {
  const html = await env.ASSETS.fetch(new Request(new URL('/', request.url), { headers: request.headers }));
  const imagem = new URL('/og.png', request.url).href;
  let reescrever = new HTMLRewriter().on('meta[property="og:image"]', { element: (el) => el.setAttribute('content', imagem) });
  if (codigo) {
    const titulo = `Scout Report · Sala ${codigo}`;
    const descricao = `Entra na sala ${codigo}: cada um tem um jogador secreto. Pergunta, carimba e identifica o dos teus amigos.`;
    reescrever = reescrever
      .on('meta[property="og:title"]', { element: (el) => el.setAttribute('content', titulo) })
      .on('meta[property="og:description"]', { element: (el) => el.setAttribute('content', descricao) })
      .on('meta[name="description"]', { element: (el) => el.setAttribute('content', descricao) });
  }
  return reescrever.transform(html);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/salas' && request.method === 'POST') return criarSala(request, env);

    const info = pathname.match(/^\/api\/salas\/([A-Za-z]{4})$/);
    if (info && request.method === 'GET') return json(await env.SALAS.getByName(info[1].toUpperCase()).info());

    if (pathname === '/api/catalogo' && request.method === 'GET') return servirComVersao(request, env, lerCatalogo);
    if (pathname === '/api/nomes' && request.method === 'GET') return servirComVersao(request, env, lerNomes);

    const ws = pathname.match(/^\/ws\/([A-Za-z]{4})$/);
    if (ws) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Esperava um WebSocket.', { status: 426 });
      return env.SALAS.getByName(ws[1].toUpperCase()).fetch(request);
    }

    const sala = pathname.match(/^\/sala\/([A-Za-z]{4})\/?$/);
    if (sala) return pagina(request, env, sala[1].toUpperCase());
    if (pathname === '/' || pathname === '/index.html') return pagina(request, env);

    if (pathname.startsWith('/api/') || pathname.startsWith('/ws/')) return json({ erro: 'Não encontrado.' }, 404);
    return env.ASSETS.fetch(request);
  },
};
