// Painel das perguntas: cada categoria tem subcategorias com um rótulo pequeno ("Pé", "Jogou em…") e as opções em
// grelha de botões, num campo com sugestões (países, clubes) ou numa lista (prémios). Os níveis 2 e 3 só aparecem
// depois de confirmado o nível de cima. A hierarquia, as deduções e o que já foi respondido vêm de
// comum/perguntas.js. Escolher uma opção seleciona a pergunta; o Enviar (em jogo.js) manda-a.
import * as P from './comum/perguntas.js';
import { el, pts } from './util.js';
import { autocompletar } from './autocompletar.js';

const nomeCurtoPremio = (id) => P.PREMIOS[id].nome.replace(/^(o|a|os|as|um|uma) /, '').replace(/ \(ou [^)]*\)$/, '').replace(/^./, (c) => c.toUpperCase());
const tipoPremio = (tipo) => (k) => P.PREMIOS[P.ler(k).valor]?.tipo === tipo;

/**
 * As subcategorias de cada categoria: o rótulo, os tipos de pergunta e como se escolhe (grelha por omissão;
 * `campo` com sugestões quando há muitas opções, com esse texto de exemplo; `lista` para os prémios).
 */
const GRUPOS = {
  estado: [{ tipos: ['ativo', 'retirado', 'foi_treinador'], colunas: 3 }],
  era: [
    { rotulo: 'Estreou-se nos anos…', tipos: ['decada'], colunas: 3 },
    { rotulo: 'Estreou-se em…', tipos: ['ano'], colunas: 5 },
  ],
  nacionalidade: [
    { rotulo: 'Continente', tipos: ['conf'], larga: true },
    { rotulo: 'País', tipos: ['nac'], campo: 'país', larga: true },
  ],
  posicao: [
    { rotulo: 'Setor', tipos: ['setor'], larga: true },
    { rotulo: 'Posição', tipos: ['pos'], larga: true },
  ],
  fisico: [
    { rotulo: 'Pé', tipos: ['pe'], colunas: 3 },
    { rotulo: 'Altura', tipos: ['baixo', 'altura'], colunas: 5 },
  ],
  carreira: [
    { rotulo: 'Jogou em…', tipos: ['pais'], campo: 'país', larga: true },
    { rotulo: 'Joga atualmente em…', tipos: ['pais_atual'], campo: 'país', larga: true },
    { rotulo: 'Jogou na liga…', tipos: ['liga'], campo: 'liga', larga: true },
    { rotulo: 'Joga atualmente na liga…', tipos: ['liga_atual'], campo: 'liga', larga: true },
    { rotulo: 'Jogou no clube…', tipos: ['clube'], campo: 'clube', larga: true },
    { rotulo: 'Joga atualmente no clube…', tipos: ['clube_atual'], campo: 'clube', larga: true },
  ],
  estatisticas: [
    { rotulo: 'Jogos', tipos: ['jogos'], colunas: 4 },
    { rotulo: 'Golos', tipos: ['golos'], colunas: 4 },
    { rotulo: 'Assistências', tipos: ['assist'], colunas: 4 },
    { rotulo: 'Internacionalizações', tipos: ['inter'], colunas: 4 },
  ],
  numeros: [
    { rotulo: 'Números usados', tipos: ['faixa'], colunas: 3 },
    { rotulo: 'Número exato', tipos: ['num'], campo: 'número', colunas: 5 },
  ],
  premios: [
    { rotulo: 'Clubes', tipos: ['premio'], filtro: tipoPremio('clube'), lista: true },
    { rotulo: 'Internacionais', tipos: ['premio'], filtro: tipoPremio('selecao'), lista: true },
    { rotulo: 'Pessoais', tipos: ['premio'], filtro: tipoPremio('individual'), lista: true },
  ],
  treinador: [
    { rotulo: 'Treinador', tipos: ['t_atual', 't_selecao'], larga: true },
    { rotulo: 'Títulos como treinador', tipos: ['t_titulos'], colunas: 4 },
    { rotulo: 'Ganhou como treinador', tipos: ['t_premio'], lista: true },
    { rotulo: 'Treinou em…', tipos: ['t_pais'], campo: 'país', larga: true },
    { rotulo: 'Treinou o clube…', tipos: ['t_clube'], campo: 'clube', larga: true },
    { rotulo: 'Treinou a seleção de…', tipos: ['t_sel'], campo: 'país', larga: true },
    { rotulo: 'Treina atualmente…', tipos: ['t_atual_clube', 't_atual_sel'], campo: 'equipa', larga: true },
  ],
};
/** Até tantas opções vão em grelha; mais do que isso, num campo com sugestões. */
const MAX_GRELHA = 12;

const metros = (cm) => `${(Number(cm) / 100).toFixed(2).replace('.', ',')}m`;

/** O texto do botão: curto, sem a pergunta ("Guarda-redes", "+1,80m", "anos 90"). */
export function rotulo(chave, cat) {
  const { tipo, valor: v } = P.ler(chave);
  switch (tipo) {
    case 'ativo': return 'No ativo';
    case 'retirado': return 'Retirado';
    case 'foi_treinador': return 'É/foi treinador';
    case 'decada': return `anos ${Number(v) < 2000 ? v.slice(2) : v}`;
    case 'conf': return P.CONFEDERACOES[v].nome;
    case 'setor': return P.SETORES[v];
    case 'pos': return P.POSICOES[v].nome;
    case 'pe': return { direito: 'Destro', esquerdo: 'Canhoto', ambos: 'Ambidestro' }[v];
    case 'altura': return `+${metros(v)}`;
    case 'baixo': return `-${metros(v)}`;
    case 'jogos': case 'golos': case 'assist': case 'inter': return `+${v}`;
    case 'faixa': {
      const [a, b] = P.FAIXAS_NUMEROS[Number(v)];
      return b >= 99 ? `${a}+` : `${a}-${b}`;
    }
    case 'liga': case 'liga_atual': return v.startsWith('outra-') ? 'Outra liga' : P.nomeLiga(cat, v);
    case 'clube': case 'clube_atual': case 't_clube': case 't_atual_clube': return P.nomeClube(cat, v);
    case 'premio': case 't_premio': return nomeCurtoPremio(v);
    case 't_atual': return 'Treina atualmente';
    case 't_selecao': return 'Treinou uma seleção';
    case 't_titulos': return Number(v) === 0 ? 'Algum título' : `+${v}`;
    case 't_atual_sel': return `Seleção ${P.dePais(v)}`;
    case 'ano': case 'num': return v;
    default: return P.nomePais(v);
  }
}

/** O porquê de uma opção fechada (vai para o title do botão). */
function porque(estado, ficha, cat) {
  if (estado.estado === 'respondida') return { sim: 'Já respondida: sim', nao: 'Já respondida: não', sem_registo: 'Sem registo nesta ficha' }[estado.r];
  if (estado.estado === 'deduzida') {
    const origem = P.afirmacao(estado.de, cat).replace(/^./, (c) => c.toLowerCase());
    return `Já se sabe (${estado.r === 'sim' ? 'sim' : 'não'}): ${P.valor(ficha, estado.de) === 'nao' ? 'não ' : ''}${origem}`;
  }
  return 'Ainda fechada';
}
/** A classe de uma opção fechada: sim, não ou sem registo (dada ou deduzida). */
const classeEstado = (e) => [e.r === 'sem_registo' ? 'sr' : e.r, e.estado === 'deduzida' ? 'deduzida' : ''].filter(Boolean).join(' ');

/**
 * O menu de uma ficha. `o`: { cat, ativo (é a minha vez), identificado (metade dos pontos), escolhida,
 * aoEscolher(chave), abertas (Set das categorias abertas) }. Devolve os <details> das categorias.
 */
export function menu(ficha, o) {
  const { cat } = o;
  const estados = new Map();
  const estado = (k) => {
    if (!estados.has(k)) estados.set(k, P.avaliar(ficha, k, cat));
    return estados.get(k);
  };
  const aberta = (k) => estado(k).estado === 'aberta';

  const botao = (k) => {
    const e = estado(k);
    const livre = e.estado === 'aberta';
    return el('button', {
      class: `opcao ${livre ? '' : classeEstado(e)}`.trim(), type: 'button', disabled: !livre || !o.ativo,
      'aria-pressed': livre ? String(o.escolhida === k) : null, title: livre ? P.afirmacao(k, cat) : porque(e, ficha, cat),
      dataset: { chave: k }, onclick: () => o.aoEscolher(o.escolhida === k ? null : k),
    }, rotulo(k, cat));
  };

  const campo = (chaves, exemplo) => {
    const abertas = chaves.filter(aberta);
    const input = el('input', { class: 'campo', placeholder: exemplo, autocomplete: 'off', spellcheck: 'false', disabled: !o.ativo || !abertas.length });
    if (o.escolhida && abertas.includes(o.escolhida)) input.value = rotulo(o.escolhida, cat);
    const caixa = el('div', { class: 'autocompletar' }, input);
    autocompletar(input, {
      opcoes: () => abertas.map((k) => {
        const c = cat.clubes[P.ler(k).valor];
        return { valor: k, nome: rotulo(k, cat), extra: c?.pais ? P.nomePais(c.pais) : '' };
      }),
      aoEscolher: (op) => {
        input.value = op.nome;
        o.aoEscolher(op.valor);
      },
    });
    // As que já estão decididas ficam à vista por baixo do campo, como os botões fechados.
    const fechadas = chaves.filter((k) => !aberta(k));
    return [caixa, fechadas.length ? el('div', { class: 'grelha larga' }, ...fechadas.map(botao)) : null];
  };

  const lista = (chaves) => [el('select', { class: 'campo lista-opcoes', disabled: !o.ativo, onchange: (e) => o.aoEscolher(e.target.value || null) },
    el('option', { value: '', text: 'Escolhe…' }),
    ...chaves.map((k) => {
      const e = estado(k);
      const marca = e.estado === 'aberta' ? '' : e.r === 'sim' ? ' ✓' : e.r === 'nao' ? ' ✗' : ' · sem registo';
      return el('option', { value: k, disabled: e.estado !== 'aberta', selected: o.escolhida === k, text: `${rotulo(k, cat)}${marca}` });
    }))];

  const categorias = P.ORDEM.filter((c) => c !== 'treinador' || P.comTreinador(ficha));
  return categorias.map((categoria) => {
    const grupos = [];
    const abertasCat = [];
    for (const g of GRUPOS[categoria]) {
      let chaves = g.tipos.flatMap((t) => P.candidatas(ficha, t, cat)).filter((k) => P.valida(k, cat));
      if (g.filtro) chaves = chaves.filter(g.filtro);
      // Os níveis 2 e 3 só aparecem com o nível de cima confirmado (sem candidatas, o grupo não se mostra).
      chaves = chaves.filter((k) => estado(k).estado !== 'bloqueada');
      if (!chaves.length) continue;
      abertasCat.push(...chaves.filter(aberta));
      const conteudo = g.lista ? lista(chaves)
        : g.campo && chaves.length > MAX_GRELHA ? campo(chaves, g.campo)
          : [el('div', { class: `grelha${g.larga ? ' larga' : ''}`, style: g.colunas ? { '--colunas': String(g.colunas) } : null }, ...chaves.map(botao))];
      grupos.push(el('div', { class: 'grupo' }, g.rotulo ? el('p', { class: 'grupo-rotulo', text: g.rotulo }) : null, ...conteudo));
    }
    // Os pontos ficam só no título: os de cada nível que está aberto nesta categoria (3, depois 3/6, 3/6/9).
    const valores = [...new Set(abertasCat.map((k) => P.comFator(P.pontos(k), o.identificado)))].sort((a, b) => a - b);
    const r = P.resumoCategoria(ficha, categoria);
    const resumo = [r.sim && `${r.sim} ✓`, r.nao && `${r.nao} ✗`, r.sem_registo && `${r.sem_registo} s/ registo`].filter(Boolean).join(' · ');
    const det = el('details', { class: 'categoria', open: o.abertas.has(categoria), dataset: { categoria } },
      el('summary', {},
        el('span', { class: 'cat-nome', text: P.NOMES_CATEGORIAS[categoria] }),
        el('span', { class: 'cat-pts', text: valores.length ? `${valores.join('/')} pts` : '' }),
        resumo ? el('span', { class: 'resumo-cat', text: resumo }) : null),
      el('div', { class: 'grupos' }, ...grupos));
    det.addEventListener('toggle', () => (det.open ? o.abertas.add(categoria) : o.abertas.delete(categoria)));
    return det;
  });
}

/** O que vai ser perguntado e quanto vale (na barra por cima do Enviar), sem ponto de interrogação. */
export function descreverEscolhida(chave, cat, identificado) {
  return { texto: P.afirmacao(chave, cat), pontos: pts(P.comFator(P.pontos(chave), identificado)) };
}
