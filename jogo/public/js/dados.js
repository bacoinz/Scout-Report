// O catálogo (ligas e clubes) e os nomes dos jogadores, do D1. Pedem-se com a versão da base, por isso o browser
// guarda-os em cache até à exportação seguinte; aqui ficam também em memória (o jogo e o Desafio do Dia usam-nos).
import { prepararCatalogo } from './comum/perguntas.js';
import { criarIndice } from './comum/nomes.js';

let guardados = null; // { versao, dados }

/** { cat, indice, nomesPorId } da versão pedida. Falha (rejeita) sem ligação. */
export async function carregarDados(versao) {
  if (guardados?.versao === versao) return guardados.dados;
  const v = encodeURIComponent(versao);
  const [cat, nomes] = await Promise.all([
    fetch(`/api/catalogo?v=${v}`).then((r) => r.json()),
    fetch(`/api/nomes?v=${v}`).then((r) => r.json()),
  ]);
  const dados = { cat: prepararCatalogo(cat), indice: criarIndice(nomes), nomesPorId: new Map(nomes.map((j) => [j.id, j])) };
  guardados = { versao, dados };
  return dados;
}
