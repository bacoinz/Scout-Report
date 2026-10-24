import { describe, it, expect } from 'vitest';
import * as P from '../public/js/comum/perguntas.js';
import { registo, todos, catalogoDeTeste, ficha } from './apoio.js';

const cat = catalogoDeTeste();
const ZIDANE = 'Q1835';
const REAL_MADRID = 'Q8682';
const LA_LIGA = 'Q324867';

describe('respostas a partir do registo', () => {
  const z = registo(ZIDANE);
  const casos = {
    'decada:1980': 'sim', 'decada:1990': 'nao', 'ano:1989': 'sim',
    'conf:UEFA': 'sim', 'nac:FR': 'sim', 'nac:DZ': 'nao',
    'setor:medio': 'sim', 'pos:MO': 'sim', 'pos:MC': 'nao',
    'pe:direito': 'sim', 'pe:esquerdo': 'nao', 'altura:180': 'sim', 'altura:185': 'nao',
    retirado: 'sim', ativo: 'nao', foi_treinador: 'sim',
    'pais:ES': 'sim', 'pais:GB-ENG': 'nao', 'pais_atual:ES': 'nao', [`liga:${LA_LIGA}`]: 'sim',
    [`clube:${REAL_MADRID}`]: 'sim', [`clube_atual:${REAL_MADRID}`]: 'nao',
    'jogos:500': 'sim', 'golos:200': 'nao', 'inter:100': 'sim', 'assist:100': 'sim',
    'faixa:0': 'sim', 'num:5': 'sim', 'num:9': 'sem_registo',
    'premio:bola_de_ouro': 'sim', 'premio:libertadores': 'nao',
    t_atual: 'sim', t_selecao: 'sim', 't_titulos:10': 'sim', 't_titulos:20': 'nao', 't_titulos:0': 'sim',
    't_premio:liga_campeoes': 'sim', 't_premio:mundial': 'nao', 't_pais:ES': 'sim', 't_pais:IT': 'nao',
    [`t_clube:${REAL_MADRID}`]: 'sim', 't_sel:FR': 'sim', 't_atual_sel:FR': 'sim', [`t_atual_clube:${REAL_MADRID}`]: 'nao',
  };
  for (const [chave, esperado] of Object.entries(casos)) {
    it(`${chave} → ${esperado}`, () => expect(P.responder(z, chave)).toBe(esperado));
  }

  it('assistências: a mesma regra do pipeline (sim com dados parciais, não só com o máximo ou a carreira coberta)', () => {
    expect(P.respostaAssistencias({ conhecidas: 60, cobertura: 0.3, maximo: 400 }, 50)).toBe('sim');
    expect(P.respostaAssistencias({ conhecidas: 10, cobertura: 0.3, maximo: 40 }, 50)).toBe('nao');
    expect(P.respostaAssistencias({ conhecidas: 10, cobertura: 0.95, maximo: 400 }, 50)).toBe('nao');
    expect(P.respostaAssistencias({ conhecidas: 10, cobertura: 0.5, maximo: 400 }, 50)).toBe('sem_registo');
  });

  it('sem pé ou altura no registo dá SEM REGISTO', () => {
    const sem = { ...registo(ZIDANE), perfil: { pe: null, altura_cm: null } };
    expect(P.responder(sem, 'pe:direito')).toBe('sem_registo');
    expect(P.responder(sem, 'altura:175')).toBe('sem_registo');
  });

  it('todas as perguntas candidatas respondem sem erro para todos os jogadores', () => {
    const aberta = ficha({
      'decada:2000': 'sim', 'conf:UEFA': 'sim', 'setor:medio': 'sim', 'faixa:1': 'sim', foi_treinador: 'sim',
      't_pais:PT': 'sim', 'pais:PT': 'sim', 'liga:Q182994': 'sim',
    });
    const chaves = Object.values(P.TIPOS_POR_CATEGORIA).flat().flatMap((t) => P.candidatas(aberta, t, cat));
    expect(chaves.length).toBeGreaterThan(200);
    const validas = new Set(['sim', 'nao', 'sem_registo']);
    const falhas = [];
    for (const r of todos()) for (const k of chaves) if (!validas.has(P.responder(r, k))) falhas.push(`${r.nome} ${k}`);
    expect(falhas).toEqual([]);
  }, 30_000);
});

describe('textos', () => {
  it('artigos de países, clubes e ligas', () => {
    expect(P.texto('pais:BR', cat)).toBe('Jogou numa liga do Brasil?');
    expect(P.texto('pais:ES', cat)).toBe('Jogou numa liga de Espanha?');
    expect(P.texto('pais_atual:NL', cat)).toBe('Joga atualmente numa liga dos Países Baixos?');
    expect(P.texto('nac:AR', cat)).toBe('É da Argentina?');
    expect(P.texto('nac:PT', cat)).toBe('É de Portugal?');
    expect(P.texto('conf:CAF', cat)).toBe('É de África (CAF)?');
    expect(P.texto(`clube:${REAL_MADRID}`, cat)).toBe('Jogou no Real Madrid?');
    expect(P.texto('clube:Q1422', cat)).toBe('Jogou na Juventus?');
    expect(P.texto(`liga:${LA_LIGA}`, cat)).toBe('Jogou na La Liga?');
    expect(P.texto('liga:outra-PT', cat)).toBe('Jogou noutra liga de Portugal?');
    expect(P.texto('t_sel:FR', cat)).toBe('Treinou a seleção de França?');
    expect(P.texto('t_pais:BR', cat)).toBe('Treinou no Brasil?');
    expect(P.texto(`t_atual_clube:${REAL_MADRID}`, cat)).toBe('Treina atualmente o Real Madrid?');
  });
  it('números, alturas, décadas e limiares', () => {
    expect(P.texto('faixa:0', cat)).toBe('Usou um número abaixo de 10?');
    expect(P.texto('faixa:1', cat)).toBe('Usou um número de 10 a 20?');
    expect(P.texto('faixa:2', cat)).toBe('Usou um número acima de 20?');
    expect(P.texto('altura:180', cat)).toBe('Mede mais de 1,80 m?');
    expect(P.texto('decada:1990', cat)).toBe('Estreou-se como sénior nos anos 90?');
    expect(P.texto('decada:2010', cat)).toBe('Estreou-se como sénior nos anos 2010?');
    expect(P.texto('t_titulos:0', cat)).toBe('Ganhou algum título como treinador?');
    expect(P.afirmacao('pos:MO', cat)).toBe('É médio ofensivo');
  });
});

describe('validação das chaves', () => {
  it('recusa o que não existe', () => {
    for (const k of ['liga:Q0', 'jogos:150', 'num:100', 'num:0', 'premio:melhor_treinador_fifa', 'ativo:1', '__proto__',
      'constructor', 'decada:1920', 'nac:XX', 'pais:FO', 'faixa:3', 'clube:', '', null, 'pe:canhoto']) {
      expect(P.valida(k, cat), String(k)).toBe(false);
    }
  });
  it('aceita o que existe', () => {
    for (const k of ['liga:Q324867', 'jogos:300', 'num:99', 'premio:liga_campeoes', 'ativo', 'decada:1930', 'nac:PT', 'pais:PT',
      't_premio:melhor_treinador_fifa', 'liga:outra-PT']) {
      expect(P.valida(k, cat), k).toBe(true);
    }
  });
});

describe('hierarquia', () => {
  it('a liga abre com o país (da carreira ou o atual) e fecha quando ele é descartado', () => {
    expect(P.avaliar(ficha(), `liga:${LA_LIGA}`, cat)).toMatchObject({ estado: 'bloqueada', fechada: false });
    expect(P.avaliar(ficha({ 'pais:ES': 'sim' }), `liga:${LA_LIGA}`, cat).estado).toBe('aberta');
    expect(P.avaliar(ficha({ 'pais_atual:ES': 'sim' }), `liga:${LA_LIGA}`, cat).estado).toBe('aberta');
    expect(P.avaliar(ficha({ 'pais:ES': 'nao' }), `liga:${LA_LIGA}`, cat)).toMatchObject({ estado: 'bloqueada', fechada: true });
  });
  it('o clube abre com uma das suas ligas', () => {
    expect(P.disponivel(ficha({ 'pais:ES': 'sim' }), `clube:${REAL_MADRID}`, cat)).toBe(false);
    expect(P.disponivel(ficha({ 'pais:ES': 'sim', [`liga:${LA_LIGA}`]: 'sim' }), `clube:${REAL_MADRID}`, cat)).toBe(true);
    expect(P.disponivel(ficha({ 'pais:ES': 'sim', [`liga_atual:${LA_LIGA}`]: 'sim' }), `clube_atual:${REAL_MADRID}`, cat)).toBe(true);
    const clubes = P.candidatas(ficha({ 'pais:ES': 'sim', [`liga:${LA_LIGA}`]: 'sim' }), 'clube', cat);
    expect(clubes).toContain(`clube:${REAL_MADRID}`);
  });
  it('ano, nacionalidade, posição e número exato abrem com o nível de cima', () => {
    expect(P.disponivel(ficha(), 'ano:1995', cat)).toBe(false);
    expect(P.disponivel(ficha({ 'decada:1990': 'sim' }), 'ano:1995', cat)).toBe(true);
    expect(P.disponivel(ficha({ 'conf:UEFA': 'sim' }), 'nac:PT', cat)).toBe(true);
    expect(P.disponivel(ficha({ 'conf:UEFA': 'sim' }), 'nac:BR', cat)).toBe(false);
    expect(P.disponivel(ficha({ 'setor:medio': 'sim' }), 'pos:MO', cat)).toBe(true);
    expect(P.disponivel(ficha({ 'faixa:0': 'sim' }), 'num:7', cat)).toBe(true);
    expect(P.disponivel(ficha({ 'faixa:0': 'sim' }), 'num:17', cat)).toBe(false);
    expect(P.avaliar(ficha({ 'faixa:0': 'sem_registo' }), 'num:7', cat)).toMatchObject({ estado: 'bloqueada', fechada: true });
  });
  it('o Treinador só abre com "é ou foi treinador?" ✓, e o clube treinado com o país', () => {
    expect(P.disponivel(ficha(), 't_atual', cat)).toBe(false);
    expect(P.disponivel(ficha({ foi_treinador: 'sim' }), 't_atual', cat)).toBe(true);
    expect(P.disponivel(ficha({ foi_treinador: 'sim' }), `t_clube:${REAL_MADRID}`, cat)).toBe(false);
    expect(P.disponivel(ficha({ foi_treinador: 'sim', 't_pais:ES': 'sim' }), `t_clube:${REAL_MADRID}`, cat)).toBe(true);
    expect(P.comTreinador(ficha({ foi_treinador: 'nao' }))).toBe(false);
  });
  it('o Físico e os Prémios não dependem de nada', () => {
    expect(P.disponivel(ficha(), 'pe:esquerdo', cat)).toBe(true);
    expect(P.disponivel(ficha(), 'altura:190', cat)).toBe(true);
    expect(P.disponivel(ficha(), 'premio:mundial', cat)).toBe(true);
  });
});

describe('deduções', () => {
  it('limiares do mesmo número', () => {
    expect(P.avaliar(ficha({ 'jogos:300': 'sim' }), 'jogos:200', cat)).toMatchObject({ estado: 'deduzida', r: 'sim', de: 'jogos:300' });
    expect(P.avaliar(ficha({ 'jogos:300': 'sim' }), 'jogos:500', cat).estado).toBe('aberta');
    expect(P.avaliar(ficha({ 'jogos:300': 'nao' }), 'jogos:500', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ 'altura:185': 'sim' }), 'altura:175', cat)).toMatchObject({ estado: 'deduzida', r: 'sim' });
    expect(P.avaliar(ficha({ 't_premio:mundial': 'sim', foi_treinador: 'sim' }), 't_titulos:0', cat))
      .toMatchObject({ estado: 'deduzida', r: 'sim' });
  });
  it('década, ano e pé excluem-se', () => {
    expect(P.avaliar(ficha({ 'decada:1990': 'sim' }), 'decada:2000', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ 'decada:1990': 'sim', 'ano:1995': 'sim' }), 'ano:1996', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ 'pe:esquerdo': 'sim' }), 'pe:direito', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ 'pe:esquerdo': 'nao' }), 'pe:direito', cat).estado).toBe('aberta');
  });
  it('ativo e retirado, e as perguntas "atualmente"', () => {
    expect(P.avaliar(ficha({ ativo: 'sim' }), 'retirado', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ retirado: 'sim' }), 'pais_atual:ES', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    const f = ficha({ 'pais:ES': 'sim', [`liga:${LA_LIGA}`]: 'sim', [`clube_atual:${REAL_MADRID}`]: 'sim' });
    expect(P.avaliar(f, `clube:${REAL_MADRID}`, cat)).toMatchObject({ estado: 'deduzida', r: 'sim' });
    expect(P.avaliar(f, 'ativo', cat)).toMatchObject({ estado: 'deduzida', r: 'sim' });
    expect(P.avaliar(f, 'clube_atual:Q8687', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    // A liga atual pode ser mais do que uma (subidas a meio da época): não se fecha.
    const g = ficha({ 'pais:ES': 'sim', [`liga_atual:${LA_LIGA}`]: 'sim' });
    expect(P.avaliar(g, 'liga_atual:Q35615', cat).estado).toBe('aberta');
    expect(P.avaliar(g, `liga:${LA_LIGA}`, cat)).toMatchObject({ estado: 'deduzida', r: 'sim' });
  });
  it('prémios independentes: confirmar um não fecha nenhum outro', () => {
    const f = ficha({ 'premio:liga_campeoes': 'sim' });
    for (const k of P.candidatas(f, 'premio', cat)) if (k !== 'premio:liga_campeoes') expect(P.avaliar(f, k, cat).estado).toBe('aberta');
  });
  it('nacionalidades e posições podem ter vários ✓', () => {
    const f = ficha({ 'conf:UEFA': 'sim', 'nac:PT': 'sim', 'conf:CONMEBOL': 'sim', 'setor:medio': 'sim', 'pos:MO': 'sim' });
    expect(P.avaliar(f, 'nac:BR', cat).estado).toBe('aberta');
    expect(P.avaliar(f, 'pos:MC', cat).estado).toBe('aberta');
  });
});

describe('palpite final', () => {
  it('pede 6 "sim" (estruturados e livres, sem deduções) e um clube confirmado', () => {
    const cinco = { 'conf:UEFA': 'sim', 'pais:ES': 'sim', [`liga:${LA_LIGA}`]: 'sim', 'jogos:300': 'sim', 'setor:medio': 'sim' };
    expect(P.contarSim(ficha({ ...cinco, 'jogos:500': 'nao' }))).toBe(5);
    expect(P.palpiteDesbloqueado(ficha(cinco, ['sim']))).toBe(false); // falta o clube
    expect(P.faltaParaPalpite(ficha(cinco))).toEqual({ sim: 1, clube: true });
    expect(P.palpiteDesbloqueado(ficha({ ...cinco, [`clube:${REAL_MADRID}`]: 'sim' }))).toBe(true);
    expect(P.palpiteDesbloqueado(ficha({ ...cinco, [`clube_atual:${REAL_MADRID}`]: 'sim' }))).toBe(true);
  });
});

describe('pontos', () => {
  it('3/6/9 por nível, físico 3, metade arredondada para cima para quem foi identificado', () => {
    expect(P.pontos('pais:ES')).toBe(3);
    expect(P.pontos(`liga:${LA_LIGA}`)).toBe(6);
    expect(P.pontos(`clube:${REAL_MADRID}`)).toBe(9);
    expect(P.pontos('num:7')).toBe(9);
    expect(P.pontos('pe:esquerdo')).toBe(3);
    expect(P.comFator(9, true)).toBe(5);
    expect(P.comFator(30, true)).toBe(15);
    expect(P.comFator(3, true)).toBe(2);
    expect(P.comFator(6, false)).toBe(6);
  });
});

describe('cada jogador da base pode ser identificado', () => {
  it('há um caminho país → liga → clube até um clube da carreira', () => {
    for (const reg of todos()) {
      const ok = reg.carreira.some((c) => c.paises_liga.some((pais) => {
        const f = ficha({ [`pais:${pais}`]: 'sim' });
        return c.ligas.some((l) => {
          if (!P.disponivel(f, `liga:${l}`, cat)) return false;
          const g = ficha({ [`pais:${pais}`]: 'sim', [`liga:${l}`]: 'sim' });
          return P.candidatas(g, 'clube', cat).includes(`clube:${c.clube}`) && P.disponivel(g, `clube:${c.clube}`, cat);
        });
      }));
      expect(ok, reg.nome).toBe(true);
    }
  });
});
