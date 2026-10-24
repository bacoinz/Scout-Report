import { describe, it, expect } from 'vitest';
import { normalizar, distancia, criarIndice, procurar, sugerir } from '../public/js/comum/nomes.js';
import { todos, porNome } from './apoio.js';

const indice = criarIndice(todos().map((r) => ({ id: r.id, nome: r.nome, aliases: r.aliases, dica: r.dica })));
const id = (nome) => porNome(nome).id;
const unico = (texto) => {
  const r = procurar(indice, texto);
  return r.tipo === 'unico' ? indice.porId.get(r.id).nome : r.tipo;
};

describe('normalizar e distância', () => {
  it('sem acentos, maiúsculas nem pontuação', () => {
    expect(normalizar('  Luka Modrić ')).toBe('luka modric');
    expect(normalizar("N'Golo Kanté")).toBe('ngolo kante');
    expect(normalizar('Ødegaard')).toBe('odegaard');
  });
  it('troca de letras vizinhas conta 1', () => {
    expect(distancia('figo', 'fgio')).toBe(1);
    expect(distancia('zidane', 'zidan')).toBe(1);
  });
});

describe('procurar', () => {
  it('nome completo, alias e apelido', () => {
    expect(unico('Luís Figo')).toBe('Luís Figo');
    expect(unico('figo')).toBe('Luís Figo');
    expect(unico('Zizou')).toBe('Zinedine Zidane');
    expect(unico('van basten')).toBe('Marco van Basten');
    expect(unico('CR7')).toBe('Cristiano Ronaldo');
  });
  it('o nome exato de um jogador ganha ao apelido de outro', () => {
    expect(unico('Ronaldo')).toBe('Ronaldo');
    expect(procurar(indice, 'Ronaldo').id).toBe(id('Ronaldo'));
  });
  it('gralhas pequenas', () => {
    expect(unico('Zidan')).toBe('Zinedine Zidane');
    expect(unico('Messsi')).toBe('Lionel Messi');
    expect(unico('Shevchenko')).toBe('Andriy Shevchenko');
    expect(unico('Schevchenko')).toBe('Andriy Shevchenko');
  });
  it('homónimos ficam ambíguos (não se escolhe por ninguém)', () => {
    const r = procurar(indice, 'João Pinto');
    expect(r.tipo).toBe('ambiguo');
    expect(r.ids.length).toBeGreaterThanOrEqual(2);
  });
  it('quem não está na base não é ninguém', () => {
    expect(procurar(indice, 'Fulano de Tal').tipo).toBe('nenhum');
    expect(procurar(indice, 'ab').tipo).toBe('nenhum');
  });
});

describe('sugerir', () => {
  it('começa pelos nomes que começam pelo texto', () => {
    expect(sugerir(indice, 'Zid').map((j) => j.nome)).toContain('Zinedine Zidane');
    expect(sugerir(indice, 'figo')[0].nome).toBe('Luís Figo');
    expect(sugerir(indice, 'joao pinto').filter((j) => j.nome.startsWith('João Pinto')).length).toBeGreaterThanOrEqual(2);
  });
  it('cada sugestão leva a dica que distingue homónimos', () => {
    for (const j of sugerir(indice, 'joao pinto')) expect(j.dica).toMatch(/^\d{4} · /);
  });
  it('não sugere nada com uma letra', () => {
    expect(sugerir(indice, 'z')).toEqual([]);
  });
});
