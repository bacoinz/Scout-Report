// Painel das perguntas: cada categoria tem subcategorias com um rótulo pequeno ("Pé", "Jogou em…") e as opções em
// grelha de botões, num campo com sugestões (países, clubes) ou numa lista (prémios). Os níveis 2 e 3 só aparecem
// depois de confirmado o nível de cima. A hierarquia, as deduções e o que já foi respondido vêm de
// comum/perguntas.js. Escolher uma opção seleciona a pergunta; o Enviar (em jogo.js) manda-a.
import * as P from './comum/perguntas.js';
import { el, pts } from './util.js';
import { autocompletar } from './autocompletar.js';
import { nomePremio } from './ficha.js';

const tipoPremio = (tipo) => (k) => P.PREMIOS[P.ler(k).valor]?.tipo === tipo;

/**
 * As subcategorias de cada categoria: o rótulo, os tipos de pergunta e como se escolhe (grelha por omissão;
 * `campo` com sugestões quando há muitas opções, com esse texto de exemplo; `lista` para os prémios).
 * `soCerto`: depois de uma resposta certa, o grupo fica só com ela (sai o resto e o campo), para não baralhar.
 */
const GRUPOS = {
  estado: [{ tipos: ['ativo', 'retirado', 'treinador'], colunas: 3, soCerto: true }],
  era: [
    { rotulo: 'Estreou-se nos anos…', tipos: ['decada'], colunas: 3, soCerto: true },
    { rotulo: 'Estreou-se em…', tipos: ['ano'], colunas: 5, soCerto: true },
  ],
  nacionalidade: [
    { rotulo: 'Continente', tipos: ['conf'], larga: true, soCerto: true },
    { rotulo: 'País', tipos: ['nac'], campo: 'país', larga: true, soCerto: true },
  ],
  posicao: [
    { rotulo: 'Setor', tipos: ['setor'], larga: true, soCerto: true },
    { rotulo: 'Posição', tipos: ['pos'], larga: true, soCerto: true },
  ],
  fisico: [
    { rotulo: 'Pé', tipos: ['pe'], colunas: 3, soCerto: true },
    { rotulo: 'Altura', tipos: ['baixo', 'altura'], colunas: 5 },
  ],
  // Países e clubes: pergunta-se até estarem todos encontrados (o campo só sai com `completos` na ficha). O país e o
  // clube atuais são só um.
  carreira: [
    { rotulo: 'Jogou em…', tipos: ['pais'], campo: 'país', larga: true },
    { rotulo: 'Joga atualmente em…', tipos: ['pais_atual'], campo: 'país', larga: true, soCerto: true },
    { rotulo: 'Jogou no clube…', tipos: ['clube'], campo: 'clube', larga: true },
    { rotulo: 'Joga atualmente no clube…', tipos: ['clube_atual'], campo: 'clube', larga: true, soCerto: true },
  ],
  estatisticas: [
    { rotulo: 'Jogos', tipos: ['jogos'], colunas: 4 },
    { rotulo: 'Golos', tipos: ['golos'], colunas: 4 },
    { rotulo: 'Assistências', tipos: ['assist_menos', 'assist'], colunas: 4 },
    { rotulo: 'Internacionalizações', tipos: ['inter_menos', 'inter'], colunas: 4 },
  ],
  numeros: [
    { rotulo: 'Números usados', tipos: ['faixa'], colunas: 3, soCerto: true },
    { rotulo: 'Número exato', tipos: ['num'], campo: 'número', colunas: 5, soCerto: true },
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
    { rotulo: 'Treinou em…', tipos: ['t_pais'], campo: 'país', larga: true, soCerto: true },
    { rotulo: 'Treinou o clube…', tipos: ['t_clube'], campo: 'clube', larga: true, soCerto: true },
    { rotulo: 'Treinou a seleção de…', tipos: ['t_sel'], campo: 'país', larga: true, soCerto: true },
    { rotulo: 'Treina atualmente…', tipos: ['t_atual_clube', 't_atual_sel'], campo: 'equipa', larga: true, soCerto: true },
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
    case 'treinador': return 'Treinador';
    case 'decada': return `anos ${Number(v) < 2000 ? v.slice(2) : v}`;
    case 'conf': return P.CONFEDERACOES[v].nome;
    case 'setor': return P.SETORES[v];
    case 'pos': return P.POSICOES[v].nome;
    case 'pe': return { direito: 'Destro', esquerdo: 'Canhoto', ambos: 'Ambidestro' }[v];
    case 'altura': return `+${metros(v)}`;
    case 'baixo': return `-${metros(v)}`;
    case 'assist_menos': case 'inter_menos': return `-${v}`;
    case 'jogos': case 'golos': case 'assist': case 'inter': return `+${v}`;
    case 'faixa': {
      const [a, b] = P.FAIXAS_NUMEROS[Number(v)];
      return b >= 99 ? `${a}+` : `${a}-${b}`;
    }
    case 'clube': case 'clube_atual': case 't_clube': case 't_atual_clube': return P.nomeClube(cat, v);
    case 'premio': case 't_premio': return nomePremio(v);
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
    // As já respondidas (e as deduzidas com ✓) ficam à vista por baixo do campo, como os botões fechados; as
    // deduzidas com ✗ não (com todos os países encontrados seriam centenas). Sem nada por perguntar, o campo sai
    // e ficam só as certas.
    const vistas = chaves.filter((k) => estado(k).estado === 'respondida' || (estado(k).estado === 'deduzida' && estado(k).r === 'sim'));
    const decididas = abertas.length ? vistas : vistas.filter((k) => estado(k).r === 'sim');
    const grelhaDecididas = decididas.length ? el('div', { class: 'grelha larga' }, ...decididas.map(botao)) : null;
    return abertas.length ? [caixa, grelhaDecididas] : [grelhaDecididas];
  };

  // Lista que se abre por baixo do botão (no estilo dos campos e das sugestões da app). As deduzidas não aparecem:
  // com a nacionalidade confirmada, os torneios de outras confederações saem da lista.
  const lista = (chaves) => {
    const visiveis = chaves.filter((k) => estado(k).estado !== 'deduzida');
    const aqui = visiveis.includes(o.escolhida) ? o.escolhida : null;
    const opcoes = el('div', { class: 'seletor-lista', role: 'listbox', hidden: true },
      ...visiveis.map((k) => {
        const e = estado(k);
        const livre = e.estado === 'aberta';
        return el('button', {
          class: `seletor-opcao ${livre ? '' : classeEstado(e)}`.trim(), type: 'button', role: 'option', disabled: !livre || !o.ativo,
          'aria-selected': String(k === aqui), title: livre ? P.afirmacao(k, cat) : porque(e, ficha, cat), onclick: () => o.aoEscolher(k),
        }, rotulo(k, cat));
      }));
    const botao = el('button', {
      class: `campo seletor-botao${aqui ? ' escolhido' : ''}`, type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', disabled: !visiveis.length,
      onclick: () => {
        opcoes.hidden = !opcoes.hidden;
        botao.setAttribute('aria-expanded', String(!opcoes.hidden));
      },
    }, el('span', { text: aqui ? rotulo(aqui, cat) : 'Escolhe…' }), el('span', { class: 'seta', 'aria-hidden': 'true', text: '▾' }));
    return [el('div', { class: 'seletor' }, botao, opcoes)];
  };

  const grelha = (g, chaves) => el('div', { class: `grelha${g.larga ? ' larga' : ''}`, style: g.colunas ? { '--colunas': String(g.colunas) } : null }, ...chaves.map(botao));

  const categorias = P.ORDEM.filter((c) => c !== 'treinador' || P.comTreinador(ficha));
  return categorias.map((categoria) => {
    const grupos = [];
    const abertasVisiveis = [];
    for (const g of GRUPOS[categoria]) {
      let chaves = g.tipos.flatMap((t) => P.candidatas(ficha, t, cat)).filter((k) => P.valida(k, cat));
      if (g.filtro) chaves = chaves.filter(g.filtro);
      // Os níveis 2 e 3 só aparecem com o nível de cima confirmado (sem candidatas, o grupo não se mostra).
      chaves = chaves.filter((k) => estado(k).estado !== 'bloqueada');
      if (!chaves.length) continue;
      // Depois de acertar, o grupo fica só com o ✓ (num grupo da hierarquia, segue-se o nível de baixo).
      const certas = g.soCerto ? chaves.filter((k) => estado(k).r === 'sim') : [];
      let conteudo;
      if (certas.length) {
        conteudo = [grelha(g, certas)];
      } else if (g.lista) {
        conteudo = lista(chaves);
        abertasVisiveis.push(...chaves.filter(aberta));
      } else if (g.campo && chaves.length > MAX_GRELHA) {
        conteudo = campo(chaves, g.campo);
        abertasVisiveis.push(...chaves.filter(aberta));
      } else {
        // Num grupo de países ou clubes sem nada por perguntar (todos encontrados), ficam só os certos.
        const abertasAqui = chaves.filter(aberta);
        const mostrar = g.campo && !abertasAqui.length ? chaves.filter((k) => estado(k).r === 'sim') : chaves;
        conteudo = mostrar.length ? [grelha(g, mostrar)] : [];
        abertasVisiveis.push(...abertasAqui);
      }
      conteudo = conteudo.filter(Boolean);
      if (!conteudo.length) continue;
      grupos.push(el('div', { class: 'grupo' }, g.rotulo ? el('p', { class: 'grupo-rotulo', text: g.rotulo }) : null, ...conteudo));
    }
    // Sem nada por perguntar (todos os níveis respondidos), a categoria fecha-se: leva o carimbo e não abre.
    const fechada = abertasVisiveis.length === 0;
    if (fechada) o.abertas.delete(categoria);
    // Os pontos são os do nível em que a categoria está (o mais fundo que está aberto: 3, depois 6, depois 9).
    const pontosCat = fechada ? null : Math.max(...abertasVisiveis.map((k) => P.comFator(P.pontos(k), o.identificado)));
    const r = P.resumoCategoria(ficha, categoria);
    const resumo = [r.sim && `${r.sim} ✓`, r.nao && `${r.nao} ✗`, r.sem_registo && `${r.sem_registo} s/ registo`].filter(Boolean).join(' · ');
    const det = el('details', { class: `categoria${fechada ? ' fechada' : ''}`, open: !fechada && o.abertas.has(categoria), dataset: { categoria } },
      el('summary', { 'aria-disabled': fechada ? 'true' : null, onclick: fechada ? (e) => e.preventDefault() : null },
        el('span', { class: 'cat-nome', text: P.NOMES_CATEGORIAS[categoria] }),
        el('span', { class: 'resumo-cat', text: resumo }),
        fechada ? el('span', { class: 'carimbo mini cat-fechada', text: 'Fechado' }) : el('span', { class: 'cat-pts', text: `${pontosCat} pts` })),
      el('div', { class: 'grupos' }, ...grupos));
    det.addEventListener('toggle', () => (det.open ? o.abertas.add(categoria) : o.abertas.delete(categoria)));
    return det;
  });
}

/** O que vai ser perguntado e quanto vale (na barra por cima do Enviar), sem ponto de interrogação. */
export function descreverEscolhida(chave, cat, identificado) {
  return { texto: P.afirmacao(chave, cat), pontos: pts(P.comFator(P.pontos(chave), identificado)) };
}
