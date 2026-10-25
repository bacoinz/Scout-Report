import { describe, it, expect } from 'vitest';
import { pontuar, ordenarFichas, escolherPergunta, PERGUNTAS_JOKER } from '../src/joker.js';
import { registo } from './apoio.js';

const ficha = (respostas = {}, valores = {}) => ({
  respostas: Object.fromEntries(Object.entries(respostas).map(([k, r]) => [k, { r, autor: 'j1', ronda: 1 }])),
  livres: [],
  valores,
});

describe('pontos da Joker', () => {
  it('exato 15; com um exato, os outros 0; o dono 0', () => {
    expect(pontuar(31, { a: 31, b: 30, c: 40 })).toMatchObject({ pontos: { a: 15, b: 0, c: 0 }, dono: 0, exatos: ['a'] });
  });
  it('sem exato, o mais perto sem passar 9 (empatados todos); o dono 3', () => {
    expect(pontuar(31, { a: 29, b: 29, c: 20, d: 32 })).toMatchObject({ pontos: { a: 9, b: 9, c: 0, d: 0 }, dono: 3, perto: ['a', 'b'] });
  });
  it('toda a gente passou, ou ninguém respondeu: o dono 9', () => {
    expect(pontuar(31, { a: 40, b: 32 })).toMatchObject({ pontos: { a: 0, b: 0 }, dono: 9 });
    expect(pontuar(31, {})).toMatchObject({ pontos: {}, dono: 9 });
  });
  it('dois exatos ganham os dois', () => {
    expect(pontuar(0, { a: 0, b: 0, c: 1 }).pontos).toEqual({ a: 15, b: 15, c: 0 });
  });
});

describe('que ficha e que pergunta', () => {
  it('a ficha com menos "sim" (os empates ao calhas)', () => {
    const a = { n: 1, ...ficha({ 'conf:UEFA': 'sim', 'setor:medio': 'sim' }) };
    const b = { n: 2, ...ficha({ 'conf:UEFA': 'sim' }) };
    const c = { n: 3, ...ficha({ 'conf:UEFA': 'sim' }) };
    expect(ordenarFichas([a, b, c], () => 0.5)[2].n).toBe(1);
    expect(ordenarFichas([a, b, c], () => 0.5)[0].n).toBe(2);
  });
  it('uma pergunta ainda não revelada; as de treinador só com "é ou foi treinador" ✓', () => {
    const zidane = registo('Q1835');
    const todas = new Set();
    for (let i = 0; i < 40; i++) todas.add(escolherPergunta(ficha(), zidane, () => i / 40));
    expect([...todas].sort()).toEqual(['clubes', 'estreia', 'golos', 'golos_selecao', 'inter', 'jogos']);
    const treinador = new Set();
    for (let i = 0; i < 40; i++) treinador.add(escolherPergunta(ficha({ foi_treinador: 'sim' }), zidane, () => i / 40));
    expect(treinador.has('t_titulos') && treinador.has('t_equipas')).toBe(true);
    expect(escolherPergunta(ficha({}, { jogos: 1, golos: 1, inter: 1, golos_selecao: 1, estreia: 1, clubes: 1 }), zidane, () => 0)).toBeNull();
  });
  it('os valores vêm do registo', () => {
    const zidane = registo('Q1835');
    expect(PERGUNTAS_JOKER.jogos.valor(zidane)).toBe(797);
    expect(PERGUNTAS_JOKER.estreia.valor(zidane)).toBe(1989);
    expect(PERGUNTAS_JOKER.t_titulos.valor(zidane)).toBe(11);
    expect(PERGUNTAS_JOKER.t_equipas.valor(zidane)).toBe(3); // Castilla, Real Madrid, França
  });
});
