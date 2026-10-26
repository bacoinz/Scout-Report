// Autocompletar (clubes, países, números e o nome do palpite): campo + lista de sugestões, com teclado.
import { el } from './util.js';
import { normalizar } from './comum/nomes.js';

/**
 * Filtro por omissão: primeiro o que começa pelo texto, depois o que tem uma palavra a começar por ele, depois o
 * que o contém. `opcoes`: [{ valor, nome, extra? }].
 */
export function filtrar(opcoes, texto, max = 8) {
  const alvo = normalizar(texto);
  if (!alvo) return opcoes.slice(0, max);
  const pontuadas = [];
  for (const o of opcoes) {
    const n = o.chaveBusca ?? (o.chaveBusca = normalizar(`${o.nome} ${o.busca ?? ''}`));
    const p = n.startsWith(alvo) ? 3 : n.split(' ').some((w) => w.startsWith(alvo)) ? 2 : n.includes(alvo) ? 1 : 0;
    if (p) pontuadas.push([p, o]);
  }
  return pontuadas.sort((a, b) => b[0] - a[0]).slice(0, max).map(([, o]) => o);
}

/**
 * Liga um campo a uma lista de sugestões. `opcoes()` dá as opções atuais (ou `sugerir(texto)` faz a procura);
 * `aoEscolher(opcao)` recebe a escolhida; `aoMostrar(lista)` corre sempre que a lista aparece (o menu das perguntas
 * desliza para a mostrar). Devolve { fechar, limpar }.
 */
export function autocompletar(input, { opcoes = () => [], sugerir = null, aoEscolher, aoMostrar = null, max = 8, abrirVazio = false }) {
  const caixa = input.closest('.autocompletar') ?? input.parentElement;
  const lista = el('ul', { class: 'sugestoes', role: 'listbox', hidden: true });
  caixa.append(lista);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  let atuais = [];
  let marcado = -1;

  const fechar = () => {
    lista.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    marcado = -1;
  };
  const marcar = (i) => {
    marcado = i;
    [...lista.children].forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
  };
  const escolher = (o) => {
    fechar();
    aoEscolher(o);
  };
  const mostrar = () => {
    const texto = input.value;
    if (!texto.trim() && !abrirVazio) return fechar();
    atuais = sugerir ? sugerir(texto) : filtrar(opcoes(), texto, max);
    lista.replaceChildren(...atuais.map((o, i) =>
      el('li', { role: 'option', 'aria-selected': 'false', onpointerdown: (e) => { e.preventDefault(); escolher(atuais[i]); } },
        el('span', { text: o.nome }), o.extra ? el('small', { text: o.extra }) : null)));
    if (!atuais.length) lista.append(el('li', { class: 'vazio', 'aria-disabled': 'true', text: 'Nada encontrado' }));
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    marcar(atuais.length ? 0 : -1);
    aoMostrar?.(lista);
  };

  input.addEventListener('input', mostrar);
  input.addEventListener('focus', () => { if (input.value.trim() || abrirVazio) mostrar(); });
  input.addEventListener('blur', () => setTimeout(fechar, 120));
  input.addEventListener('keydown', (e) => {
    if (lista.hidden) {
      if (e.key === 'ArrowDown') mostrar();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!atuais.length) return;
      marcar((marcado + (e.key === 'ArrowDown' ? 1 : -1) + atuais.length) % atuais.length);
    } else if (e.key === 'Enter') {
      if (marcado >= 0 && atuais[marcado]) {
        e.preventDefault();
        escolher(atuais[marcado]);
      }
    } else if (e.key === 'Escape') {
      fechar();
    }
  });
  return {
    fechar,
    limpar: () => {
      input.value = '';
      fechar();
    },
  };
}
