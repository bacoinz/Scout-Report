// Ronda Joker no browser: o anúncio (a carta e o título), a ficha técnica (sujeito, dados conhecidos, pergunta,
// cronómetro, o meu palpite em algarismos e quem já respondeu) e a revelação (o valor certo e os pontos).
import { $, el, formatarTempo } from './util.js';
import { dadosParaJoker } from './ficha.js';
import { sons } from './sons.js';

/** As perguntas da Joker (iguais a src/joker.js). */
const PERGUNTAS = {
  jogos: 'Quantos jogos fez na carreira (clubes e seleção)?',
  golos: 'Quantos golos marcou na carreira (clubes e seleção)?',
  inter: 'Quantas internacionalizações tem?',
  golos_selecao: 'Quantos golos marcou pela seleção?',
  estreia: 'Em que ano se estreou como sénior?',
  clubes: 'Por quantos clubes passou como sénior (contam os empréstimos)?',
  t_titulos: 'Quantos títulos ganhou como treinador?',
  t_equipas: 'Quantas equipas treinou (clubes e seleções)?',
};
export const textoPergunta = (id) => PERGUNTAS[id] ?? id;

const ui = { chave: null, visto: null, enviar: () => false };
const ANEL = 326.7;

export function ligar(enviar) {
  ui.enviar = enviar;
  const input = $('#ft-input');
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 4);
    desenharDigitos();
  });
  $('#ft-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value) return;
    if (ui.enviar({ t: 'lance', valor: Number(input.value) })) {
      input.disabled = true;
      $('#ft-enviar').disabled = true;
      $('#ft-enviar').textContent = 'Enviado ✓';
    }
  });
}

function desenharDigitos() {
  const v = $('#ft-input').value;
  const caixas = [...document.querySelectorAll('#ft-digitos .digito')];
  const texto = v.padStart(caixas.length, '0');
  caixas.forEach((c, i) => {
    c.textContent = texto[i];
    c.classList.toggle('vazio', i < caixas.length - v.length);
    c.classList.toggle('cursor', i === caixas.length - 1 && !$('#ft-input').disabled);
  });
  $('#ft-digitos').setAttribute('aria-label', `O teu palpite: ${v || 'nenhum'}`);
}

/** Desenha a Joker. `ctx`: { sala, eu, privado, cat, nome(id), cor(id) }. Devolve true se está à vista. */
export function render(ctx) {
  const { sala } = ctx;
  const j = sala.partida?.joker;
  const caixa = $('#joker');
  if (sala.fase !== 'jogo' || !j) {
    caixa.hidden = true;
    ui.chave = null;
    return false;
  }
  const agora = ctx.agora;
  const nova = ui.chave !== `${j.ficha}:${j.pergunta}`;
  if (nova) {
    ui.chave = `${j.ficha}:${j.pergunta}`;
    // O anúncio só aparece a quem está a ver quando a Joker começa (quem chega depois vê logo a ficha técnica).
    caixa.classList.toggle('sem-anuncio', agora >= j.abre || j.fase === 'revelacao');
    if (agora < j.abre) sons.joker();
    const input = $('#ft-input');
    input.value = '';
    input.disabled = false;
    $('#ft-enviar').disabled = false;
    $('#ft-enviar').textContent = 'Enviar palpite';
  }
  caixa.hidden = false;
  const f = sala.partida.fichas.find((x) => x.n === j.ficha);
  $('#ft-sujeito').style.setProperty('--cor-dono', ctx.cor(j.dono));
  $('#ft-dono').textContent = ctx.nome(j.dono);
  $('#ft-dados').replaceChildren(f ? dadosParaJoker(f, j.pergunta, { cat: ctx.cat, novas: new Set() }) : '');
  $('#ft-pergunta').textContent = textoPergunta(j.pergunta);

  // O meu palpite: o dono e quem está a ver não respondem.
  const eu = sala.jogadores.find((x) => x.id === ctx.eu);
  const respondentes = sala.jogadores.filter((x) => !x.espectador && !x.saiu && x.ficha != null && x.id !== j.dono);
  const respondo = respondentes.some((x) => x.id === ctx.eu);
  const enviado = ctx.privado?.lance != null;
  const nota = j.dono === ctx.eu ? 'É a tua ficha: desta vez não respondes. Se toda a gente passar do valor, ganhas 9.'
    : eu?.espectador ? 'Estás a ver: jogas a partir da próxima ronda.' : !respondo ? 'Não respondes a esta Joker.' : '';
  $('#ft-form').hidden = Boolean(nota);
  $('#ft-nota').hidden = !nota;
  $('#ft-nota').textContent = nota;
  if (enviado) {
    $('#ft-input').value = String(ctx.privado.lance);
    $('#ft-input').disabled = true;
    $('#ft-enviar').disabled = true;
    $('#ft-enviar').textContent = 'Enviado ✓';
  }
  desenharDigitos();
  if (nova && respondo && !enviado && j.fase === 'joker') setTimeout(() => $('#ft-input').focus({ preventScroll: true }), Math.max(0, j.abre - agora));

  // Quem já respondeu (os números só se veem na revelação).
  const enviados = new Set(j.enviados);
  $('#ft-lista').replaceChildren(
    ...respondentes.map((x) => el('li', {},
      el('span', { class: 'ponto', style: { background: ctx.cor(x.id) } }),
      `${x.nome}${x.id === ctx.eu ? ' (tu)' : ''}`,
      el('span', { class: `estado${enviados.has(x.id) ? ' ok' : ''}`, text: enviados.has(x.id) ? '✓ enviado' : x.ligado ? 'a escrever…' : 'desligado' }))),
    el('li', {}, el('span', { class: 'ponto', style: { background: ctx.cor(j.dono) } }), ctx.nome(j.dono),
      el('span', { class: 'estado', text: 'dono · não responde' })));

  // Revelação: o valor certo e os pontos de cada um.
  const revelada = j.fase === 'revelacao';
  $('#ficha-tecnica').classList.toggle('revelada', revelada);
  $('#ft-resultados').hidden = !revelada;
  if (revelada) {
    $('#ft-valor').textContent = String(j.valor);
    const ordem = respondentes.slice().sort((a, b) => (j.pontos[b.id] ?? 0) - (j.pontos[a.id] ?? 0)
      || Math.abs((j.lances[a.id] ?? Infinity) - j.valor) - Math.abs((j.lances[b.id] ?? Infinity) - j.valor));
    const estado = (x) => {
      const n = j.lances[x.id];
      const pts = j.pontos[x.id] ?? 0;
      if (n == null) return ['sem palpite', ''];
      if (j.exatos.includes(x.id)) return [`exato +${pts}`, ' pontos'];
      if (j.perto.includes(x.id)) return [`mais perto +${pts}`, ' pontos'];
      return n > j.valor ? ['passou', ''] : ['0', ''];
    };
    const dono = j.pontos[j.dono] ?? 0;
    const porque = j.exatos.length ? 'alguém acertou' : j.perto.length ? 'alguém ficou perto' : 'toda a gente passou';
    $('#ft-resultados').replaceChildren(
      ...ordem.map((x) => {
        const [texto, classe] = estado(x);
        const n = j.lances[x.id];
        return el('li', { class: n != null && n > j.valor ? 'passou' : null },
          el('span', { class: 'ponto', style: { background: ctx.cor(x.id) } }),
          `${x.nome}${x.id === ctx.eu ? ' (tu)' : ''}${n != null ? ` · ${n}` : ''}`,
          el('span', { class: `estado${classe}`, text: texto }));
      }),
      el('li', {}, el('span', { class: 'ponto', style: { background: ctx.cor(j.dono) } }), `${ctx.nome(j.dono)} (dono)`,
        el('span', { class: `estado${dono ? ' pontos' : ''}`, text: `${dono ? `+${dono}` : '0'} · ${porque}` })));
    if (ui.visto !== ui.chave) {
      ui.visto = ui.chave;
      sons.carimbo();
      if ((j.pontos[ctx.eu] ?? 0) > 0) setTimeout(() => sons.identificado(), 300);
    }
  }
  tick(ctx);
  return true;
}

/** O cronómetro: os 15 s dos palpites (durante o anúncio fica cheio). Sem timer, fica cheio com ∞. */
export function tick(ctx) {
  const j = ctx.sala?.partida?.joker;
  if (!j || $('#joker').hidden) return;
  if (j.fase === 'revelacao') return;
  if (j.prazo == null) {
    $('#ft-relogio').textContent = '∞';
    $('#ft-anel').setAttribute('stroke-dashoffset', '0');
    return;
  }
  const total = j.prazo - j.abre;
  const falta = Math.max(0, Math.min(total, j.prazo - ctx.agora));
  $('#ft-relogio').textContent = formatarTempo(falta);
  $('#ft-anel').setAttribute('stroke-dashoffset', String(ANEL * (1 - falta / total)));
}
