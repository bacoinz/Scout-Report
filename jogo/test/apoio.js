// Dados reais para os testes: os registos do pipeline (pipeline/dados/jogadores/) e um catálogo montado como o
// `python -m scout exportar` o monta (clubes e ligas das carreiras, as ligas sem país com o das passagens).
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepararCatalogo, nomePais } from '../public/js/comum/perguntas.js';

const dados = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'pipeline', 'dados');
const lerJson = (caminho) => JSON.parse(readFileSync(caminho, 'utf8'));

let registos = null;
export function todos() {
  registos ??= readdirSync(join(dados, 'jogadores')).filter((f) => f.endsWith('.json')).map((f) => lerJson(join(dados, 'jogadores', f)));
  return registos;
}
export const registo = (qid) => todos().find((r) => r.id === qid);
export const porNome = (nome) => todos().find((r) => r.nome === nome);

let catalogo = null;
export function catalogoDeTeste() {
  if (catalogo) return catalogo;
  const ligasCat = lerJson(join(dados, 'ligas.json'));
  const clubesCat = lerJson(join(dados, 'clubes.json'));
  const ligas = {};
  const clubes = {};
  const paisesDaLiga = {};
  for (const r of todos()) {
    for (const c of r.carreira) {
      const clube = (clubes[c.clube] ??= { nome: clubesCat[c.clube]?.nome ?? c.nome, pais: c.paises_liga[0] ?? null, ligas: [] });
      for (const l of c.ligas) {
        if (!clube.ligas.includes(l)) clube.ligas.push(l);
        (paisesDaLiga[l] ??= []).push(...c.paises_liga);
      }
    }
    for (const e of r.treinador?.equipas ?? []) {
      if (e.tipo === 'clube') clubes[e.equipa] ??= { nome: e.nome, pais: e.pais, ligas: [] };
    }
  }
  for (const [l, paises] of Object.entries(paisesDaLiga)) {
    const pais = l.startsWith('outra-') ? l.slice(6) : ligasCat[l]?.pais ?? paises[0] ?? null;
    ligas[l] = { nome: l.startsWith('outra-') ? `Outra liga de ${nomePais(pais)}` : ligasCat[l]?.nome ?? l, pais };
  }
  catalogo = prepararCatalogo({ ligas, clubes, versao: 'teste' });
  return catalogo;
}

/** Uma ficha com estas respostas: { 'pais:ES': 'sim', … }, e as livres: ['sim', 'nao', …]. */
export function ficha(respostas = {}, livres = []) {
  return {
    respostas: Object.fromEntries(Object.entries(respostas).map(([k, r]) => [k, { r, autor: 'j1', ronda: 1 }])),
    livres: livres.map((r) => ({ texto: '?', r, autor: 'j1' })),
  };
}
