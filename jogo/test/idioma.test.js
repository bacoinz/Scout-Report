import { describe, it, expect, beforeAll } from 'vitest';

// O tradutor lê o idioma do endereço (?lang=en); nos testes não há browser.
let traduzir;
beforeAll(async () => {
  globalThis.location = { search: '?lang=en', href: 'http://localhost/?lang=en' };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  ({ traduzir } = await import('../public/js/idioma.js'));
});

describe('inglês', () => {
  const casos = [
    ['Estreou-se como sénior nos anos 2010? → Não', 'Made his senior debut in the 2010s? → No'],
    ['É guarda-redes? → Sim (+3)', 'Is he a goalkeeper? → Yes (+3)'],
    ['perguntou «Jogou/joga no Benfica?» à ficha de', 'asked «Played/plays for Benfica?» on the card of'],
    ['Jogou/joga no Brasil?', 'Played/plays in Brazil?'],
    ['Treinou a seleção de França?', 'Coached the France national team?'],
    ['Ganhou a Liga dos Campeões como treinador?', 'Won the Champions League as a coach?'],
    ['Ronda Joker: «Quantas internacionalizações tem?» → 82', 'Joker Round: «How many caps does he have?» → 82'],
    ['Falta 3 «sim» e um clube confirmado', 'Still needs 3 «yes» and a confirmed club'],
    ['Mede mais de 1,80 m?', 'Taller than 1.80 m?'],
    ['PL, EE', 'ST, LW'],
    ['É de Inglaterra?', 'Is he from England?'],
    ['Scout Report — Relatório #12', 'Scout Report — Report #12'],
    ['Desisti ao fim de 7 perguntas', 'Gave up after 7 questions'],
  ];
  for (const [pt, en] of casos) it(pt, () => expect(traduzir(pt)).toBe(en));

  it('o que não tem tradução fica igual (nomes de jogadores e de clubes)', () => {
    expect(traduzir('Cristiano Ronaldo')).toBe('Cristiano Ronaldo');
    expect(traduzir('  Benfica ')).toBe('  Benfica ');
  });
});
