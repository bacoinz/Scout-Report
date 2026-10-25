import { describe, it, expect } from 'vitest';
import { quadrados, textoResumo } from '../public/js/resumo.js';

const s = (chave) => ({ chave, r: 'sim' });
const n = (chave) => ({ chave, r: 'nao' });

describe('resumo do Desafio do Dia', () => {
  it('o exemplo do plano: 8 perguntas e o palpite certo', () => {
    const passos = [s('a'), n('b'), s('c'), s('d'), n('e'), s('f'), s('g'), s('h')];
    expect(textoResumo(42, passos, { certo: true })).toBe('Scout Report — Relatório #42\n🟩🟥🟩🟩🟥🟩🟩🟩🟪\n9 perguntas');
  });

  it('os palpites errados contam (⬛) e as perguntas sem registo não', () => {
    const passos = [s('a'), { chave: 'num:7', r: 'sem_registo' }, { palpite: 'Q1', nome: 'X' }, n('b')];
    expect(quadrados(passos)).toEqual(['sim', 'errado', 'nao']);
    expect(textoResumo(3, passos, { certo: true })).toBe('Scout Report — Relatório #3\n🟩⬛🟥🟪\n4 perguntas');
  });

  it('quem desiste leva a bandeira branca', () => {
    expect(textoResumo(7, [s('a'), n('b')], { desistiu: true })).toBe('Scout Report — Relatório #7\n🟩🟥🏳️\nDesisti ao fim de 2 perguntas');
    expect(textoResumo(7, [], { desistiu: true })).toBe('Scout Report — Relatório #7\n🏳️\nDesisti ao fim de 0 perguntas');
  });

  it('em linhas de 10 quadrados', () => {
    const passos = Array.from({ length: 23 }, (_, i) => (i % 2 ? n(`k${i}`) : s(`k${i}`)));
    const linhas = textoResumo(1, passos, { certo: true }).split('\n');
    expect(linhas).toHaveLength(5);
    expect([...linhas[1]]).toHaveLength(10);
    expect(linhas[3]).toBe('🟩🟥🟩🟪');
    expect(linhas[4]).toBe('24 perguntas');
  });

  it('uma só pergunta', () => {
    expect(textoResumo(1, [], { certo: true }).endsWith('\n1 pergunta')).toBe(true);
  });
});
