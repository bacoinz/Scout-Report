// Painel das perguntas: as categorias pela ordem do menu, com o que a ficha do alvo deixa perguntar (a hierarquia,
// as deduções e o que já foi respondido vêm de comum/perguntas.js). Escolher uma pergunta seleciona-a; o Enviar
// (em app.js) manda a escolhida ou a pergunta livre.
import * as P from './comum/perguntas.js';
import { el, pts } from './util.js';
import { autocompletar } from './autocompletar.js';

/** Os tipos com um valor por escolher: o texto da linha e o que falta para abrir. */
const ABERTOS = {
  ano: ['Estreou-se em… (ano)', 'Confirma primeiro a década'],
  nac: ['É de… (país)', 'Confirma primeiro a confederação'],
  pos: ['É… (posição)', 'Confirma primeiro o setor'],
  pais: ['Jogou numa liga de… (país)', null],
  pais_atual: ['Joga atualmente numa liga de… (país)', null],
  liga: ['Jogou na… (liga)', 'Confirma primeiro um país'],
  liga_atual: ['Joga atualmente na… (liga)', 'Confirma primeiro um país'],
  clube: ['Jogou no… (clube)', 'Confirma primeiro uma liga'],
  clube_atual: ['Joga atualmente no… (clube)', 'Confirma primeiro uma liga'],
  num: ['Usou o n.º…', 'Confirma primeiro uma faixa de números'],
  t_pais: ['Treinou em… (país)', null],
  t_clube: ['Treinou o… (clube)', 'Confirma primeiro um país onde treinou'],
  t_sel: ['Treinou a seleção de…', 'Confirma primeiro um país onde treinou'],
  t_atual_clube: ['Treina atualmente o… (clube)', 'Confirma primeiro um país onde treinou'],
  t_atual_sel: ['Treina atualmente a seleção de…', 'Confirma primeiro um país onde treinou'],
};
const MAX_BOTOES = 12;

/** O nome curto de uma opção (para os botões e as sugestões) e o que se mostra ao lado. */
function opcao(chave, cat) {
  const { tipo, valor: v } = P.ler(chave);
  switch (tipo) {
    case 'ano':
      return { nome: v };
    case 'pos':
      return { nome: P.POSICOES[v].nome };
    case 'num':
      return { nome: `n.º ${v}`, busca: v };
    case 'liga':
    case 'liga_atual':
      return { nome: v.startsWith('outra-') ? 'Outra liga' : P.nomeLiga(cat, v), extra: P.nomePais(P.paisLiga(cat, v)) };
    case 'clube':
    case 'clube_atual':
    case 't_clube':
    case 't_atual_clube': {
      const c = cat.clubes[v];
      return { nome: P.nomeClube(cat, v), extra: c?.pais ? P.nomePais(c.pais) : '' };
    }
    default:
      return { nome: P.nomePais(v) };
  }
}

/** O porquê de uma pergunta fechada, curto. */
function porque(estado, ficha, cat) {
  if (estado.estado === 'respondida') {
    return { sim: 'Respondida: sim', nao: 'Respondida: não', sem_registo: 'Sem registo nesta ficha' }[estado.r];
  }
  if (estado.estado === 'deduzida') {
    const origem = P.afirmacao(estado.de, cat).replace(/^./, (c) => c.toLowerCase());
    return `Deduzida: ${P.valor(ficha, estado.de) === 'nao' ? 'não ' : ''}${origem}`;
  }
  if (estado.estado === 'bloqueada' && estado.fechada) {
    const pai = estado.requer?.[0];
    if (!pai) return 'Fechada';
    const texto = P.afirmacao(pai, cat).replace(/^./, (c) => c.toLowerCase());
    return P.valor(ficha, pai) === 'sem_registo' ? `Fechada: sem registo (${texto})` : `Fechada: não ${texto}`;
  }
  return 'Ainda fechada';
}

/**
 * O menu de uma ficha. `o`: { cat, ativo (é a minha vez), identificado (metade dos pontos), escolhida,
 * aoEscolher(chave), abertas (Set das categorias abertas) }. Devolve os <details> das categorias.
 */
export function menu(ficha, o) {
  const { cat } = o;
  const valorPts = (k) => pts(P.comFator(P.pontos(k), o.identificado));
  const botao = (k) => {
    const e = P.avaliar(ficha, k, cat);
    const aberta = e.estado === 'aberta';
    return el('li', {},
      el('button', {
        class: 'pergunta', type: 'button', disabled: !aberta || !o.ativo, 'aria-pressed': aberta ? String(o.escolhida === k) : null,
        dataset: { chave: k }, onclick: () => o.aoEscolher(o.escolhida === k ? null : k),
      },
      el('span', {}, P.texto(k, cat), !aberta ? el('span', { class: 'porque', text: porque(e, ficha, cat) }) : null),
      el('span', { class: 'pts', text: aberta ? valorPts(k) : '—' })));
  };

  const categorias = P.ORDEM.filter((c) => c !== 'treinador' || P.comTreinador(ficha));
  return categorias.map((categoria) => {
    const itens = [];
    for (const tipo of P.TIPOS_POR_CATEGORIA[categoria]) {
      const chaves = P.candidatas(ficha, tipo, cat).filter((k) => P.valida(k, cat));
      if (!ABERTOS[tipo]) {
        itens.push(...chaves.map(botao));
        continue;
      }
      const [rotulo, falta] = ABERTOS[tipo];
      if (!chaves.length) {
        itens.push(el('li', {}, el('button', { class: 'pergunta', type: 'button', disabled: true },
          el('span', {}, rotulo, el('span', { class: 'porque', text: falta ?? 'Sem opções' })), el('span', { class: 'pts', text: '—' }))));
        continue;
      }
      const abertas = chaves.filter((k) => P.avaliar(ficha, k, cat).estado === 'aberta');
      if (chaves.length <= MAX_BOTOES) {
        itens.push(...chaves.map(botao));
        continue;
      }
      // Muitas opções (países, clubes, números): um campo com sugestões, só das que estão abertas.
      const input = el('input', { class: 'campo', placeholder: rotulo, autocomplete: 'off', spellcheck: 'false', disabled: !o.ativo || !abertas.length });
      const escolhidaAqui = o.escolhida && abertas.includes(o.escolhida);
      if (escolhidaAqui) input.value = opcao(o.escolhida, cat).nome;
      const li = el('li', {},
        el('div', { class: 'pergunta-campo' },
          el('div', { class: 'autocompletar' }, input),
          el('span', { class: 'pts', text: abertas.length ? valorPts(abertas[0]) : '—' })));
      autocompletar(input, {
        opcoes: () => abertas.map((k) => ({ valor: k, ...opcao(k, cat) })),
        aoEscolher: (op) => {
          input.value = op.nome;
          o.aoEscolher(op.valor);
        },
        max: 8,
      });
      itens.push(li);
    }
    const r = P.resumoCategoria(ficha, categoria);
    const resumo = [r.sim && `${r.sim} ✓`, r.nao && `${r.nao} ✗`, r.sem_registo && `${r.sem_registo} s/ registo`].filter(Boolean).join(' · ') || '—';
    const det = el('details', { class: 'categoria', open: o.abertas.has(categoria), dataset: { categoria } },
      el('summary', {}, P.NOMES_CATEGORIAS[categoria], ' ', el('span', { class: 'resumo-cat', text: resumo })),
      el('ul', { class: 'perguntas' }, ...itens));
    det.addEventListener('toggle', () => (det.open ? o.abertas.add(categoria) : o.abertas.delete(categoria)));
    return det;
  });
}

/** O texto e os pontos da pergunta escolhida (para a barra por cima do Enviar). */
export function descreverEscolhida(chave, cat, identificado) {
  return { texto: P.texto(chave, cat), pontos: pts(P.comFator(P.pontos(chave), identificado)) };
}
