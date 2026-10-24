import { describe, it, expect } from 'vitest';
import { repartir } from '../src/catalogo.js';

describe('sorteio por década de nascimento', () => {
  it('anos 90 mais do que 80 e 2000, que saem mais do que 70, que saem mais do que 60', () => {
    let semente = 7;
    const aleatorio = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
    const disponiveis = new Map([[1960, 1e6], [1970, 1e6], [1980, 1e6], [1990, 1e6], [2000, 1e6]]);
    const conta = repartir(disponiveis, 4000, aleatorio);
    expect(conta.get(1990)).toBeGreaterThan(conta.get(1980));
    expect(conta.get(1990)).toBeGreaterThan(conta.get(2000));
    expect(conta.get(1980)).toBeGreaterThan(conta.get(1970));
    expect(conta.get(2000)).toBeGreaterThan(conta.get(1970));
    expect(conta.get(1970)).toBeGreaterThan(conta.get(1960));
  });
  it('não pede a uma década mais do que ela tem', () => {
    const conta = repartir(new Map([[1990, 2], [1960, 50]]), 10, () => 0.01);
    expect(conta.get(1990)).toBe(2);
    expect(conta.get(1960)).toBe(8);
    expect([...repartir(new Map([[1990, 1]]), 5).values()]).toEqual([1]);
  });
});
