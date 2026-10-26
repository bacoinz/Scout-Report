import { describe, it, expect } from 'vitest';
import * as D from '../src/dia.js';
import { registo, catalogoDeTeste } from './apoio.js';

const cat = catalogoDeTeste();
const ZIDANE = 'Q1835';
const REAL_MADRID = 'Q8682';
const LA_LIGA = 'Q324867';
const z = registo(ZIDANE);
const t = (iso) => Date.parse(iso);

describe('data de Lisboa', () => {
  it('muda à meia-noite de Lisboa, com hora de verão e de inverno', () => {
    // 24/10/2026 ainda é hora de verão (UTC+1): 23:30 UTC já é dia 25 em Lisboa.
    expect(D.dataLisboa(t('2026-10-24T22:59:59Z'))).toBe('2026-10-24');
    expect(D.dataLisboa(t('2026-10-24T23:00:00Z'))).toBe('2026-10-25');
    // A hora muda à 01:00 UTC de 25/10: a partir daí Lisboa está a UTC+0.
    expect(D.dataLisboa(t('2026-10-25T23:59:59Z'))).toBe('2026-10-25');
    expect(D.dataLisboa(t('2026-10-26T00:00:00Z'))).toBe('2026-10-26');
    // Em março, ao contrário: até 29/03 está a UTC+0, depois a UTC+1.
    expect(D.dataLisboa(t('2026-03-28T23:30:00Z'))).toBe('2026-03-28');
    expect(D.dataLisboa(t('2026-03-29T23:30:00Z'))).toBe('2026-03-30');
  });

  it('o tempo até ao relatório seguinte conta com a mudança da hora (o dia 25/10 tem 25 horas)', () => {
    const hora = 3_600_000;
    expect(D.faltaParaAmanha(t('2026-10-24T12:00:00Z'))).toBe(11 * hora);
    expect(D.faltaParaAmanha(t('2026-10-24T23:00:00Z'))).toBe(25 * hora);
    expect(D.faltaParaAmanha(t('2026-10-25T12:00:00Z'))).toBe(12 * hora);
    expect(D.faltaParaAmanha(t('2026-03-29T12:00:00Z'))).toBe(11 * hora);
    expect(D.faltaParaAmanha(t('2026-01-10T23:59:59Z'))).toBe(1000);
  });

  it('aceita qualquer dia desde o lançamento até hoje (Lisboa), nunca os que ainda não chegaram', () => {
    const agora = t('2026-11-03T10:00:00Z');
    const valida = (d) => D.dataValida(d, agora, '2026-10-25');
    expect(['2026-11-03', '2026-11-02', '2026-10-30', '2026-10-25'].every(valida)).toBe(true);
    expect(['2026-11-04', '2026-10-24', '2026-02-30', '2026-11-3', '', null, 20261103].some(valida)).toBe(false);
    // Às 23:30 UTC de 3/11 já é dia 4 em Lisboa? Não: em novembro Lisboa está a UTC+0.
    expect(D.dataValida('2026-11-04', t('2026-11-03T23:30:00Z'), '2026-10-25')).toBe(false);
    // Em outubro (UTC+1), sim.
    expect(D.dataValida('2026-10-25', t('2026-10-24T23:30:00Z'), '2026-10-25')).toBe(true);
  });

  it('o número do relatório conta os dias desde o lançamento', () => {
    expect(D.numero('2026-10-25', '2026-10-25')).toBe(1);
    expect(D.numero('2026-12-03', '2026-10-25')).toBe(40);
    expect(D.numero('2027-03-29', '2026-10-25')).toBe(156);
  });
});

describe('perguntas e palpite sem estado no servidor', () => {
  const clube = ['pais:ES', `clube:${REAL_MADRID}`];
  const dezSim = ['decada:1980', 'ano:1989', 'conf:UEFA', 'nac:FR', 'setor:medio', 'pos:MO', 'treinador', 'pais:IT', ...clube];

  it('responde a partir do registo e segue a hierarquia', () => {
    expect(D.perguntar(z, [], 'pais:ES', cat)).toEqual({ r: 'sim', completos: { pais: false, clube: false } });
    expect(D.perguntar(z, ['pais:ES'], `clube:${REAL_MADRID}`, cat).r).toBe('sim');
    expect(D.perguntar(z, [], `clube:${REAL_MADRID}`, cat).erro).toMatch(/não está aberta/);
    expect(D.perguntar(z, [], `liga:${LA_LIGA}`, cat).erro).toMatch(/não existe/);
    expect(D.perguntar(z, ['pais:ES'], 'pais:ES', cat).erro).toMatch(/não está aberta/);
    expect(D.perguntar(z, ['treinador'], 'ativo', cat).erro).toMatch(/não está aberta/); // deduzida
    expect(D.perguntar(z, [], 'inventada:1', cat).erro).toMatch(/não existe/);
  });

  it('recusa um histórico que não bate certo (fora de ordem, repetido, inventado)', () => {
    expect(D.perguntar(z, ['ano:1989', 'decada:1980'], 'pais:ES', cat).erro).toMatch(/histórico/);
    expect(D.perguntar(z, ['pais:ES', 'pais:ES'], 'conf:UEFA', cat).erro).toMatch(/histórico/);
    expect(D.perguntar(z, ['pais:XX'], 'conf:UEFA', cat).erro).toMatch(/histórico/);
    expect(D.perguntar(z, 'pais:ES', 'conf:UEFA', cat).erro).toMatch(/Histórico/);
    expect(D.perguntar(z, Array(D.HISTORICO_MAX + 1).fill('pais:ES'), 'conf:UEFA', cat).erro).toMatch(/Histórico/);
  });

  it('o palpite só abre com 10 "sim" e um clube, contados pelo próprio servidor', () => {
    expect(D.palpitar(z, dezSim.slice(0, -1), ZIDANE, cat).erro).toMatch(/desbloqueado/);
    // Dez perguntas com 'não' não chegam: os "sim" saem do registo, não do cliente.
    const comNaos = ['decada:1990', 'decada:2000', 'conf:CONMEBOL', 'setor:defesa', 'setor:avancado', 'pe:esquerdo', 'ativo', 'retirado', ...clube];
    expect(D.palpitar(z, comNaos, ZIDANE, cat).erro).toMatch(/desbloqueado/);
    const certo = D.palpitar(z, dezSim, ZIDANE, cat);
    expect(certo.certo).toBe(true);
    expect(certo.revelado.nome).toBe(z.nome);
    expect(certo.revelado.fama).toBeUndefined();
    expect(D.palpitar(z, dezSim, 'Q11571', cat)).toEqual({ certo: false });
    expect(D.palpitar(z, dezSim, 'Cristiano', cat).erro).toMatch(/lista/);
  });

  it('diz quando já se encontraram todos os países, e daí em diante os outros estão fechados', () => {
    const paises = [...new Set(z.carreira.flatMap((c) => c.paises_liga))];
    const ultimo = D.perguntar(z, paises.slice(0, -1).map((p) => `pais:${p}`), `pais:${paises.at(-1)}`, cat);
    expect(ultimo.completos.pais).toBe(true);
    expect(D.perguntar(z, paises.map((p) => `pais:${p}`), 'pais:PT', cat).erro).toMatch(/não está aberta/);
  });

  it('desistir revela o jogador', () => {
    expect(D.desistir(z).revelado.id).toBe(ZIDANE);
  });
});

describe('jogador do dia', () => {
  it('a ordem do calendário é a mesma do pipeline (sha1, igual em Python)', async () => {
    expect(await D.ordemDoCalendario(['Q615', 'Q11571', 'Q36488', 'Q1835', 'Q83163'])).toEqual(['Q1835', 'Q83163', 'Q11571', 'Q615', 'Q36488']);
  });

  /** Um D1 de mentira: a linha do calendário (ou nenhuma) e os jogadores do Desafio. */
  const d1 = (calendario, ids) => ({
    prepare: (sql) => ({
      bind: (...args) => ({
        first: async () => {
          if (sql.includes('FROM desafios')) return calendario[args[0]] ? { dados: JSON.stringify({ id: calendario[args[0]] }) } : null;
          return { dados: JSON.stringify({ id: args[0] }) };
        },
      }),
      all: async () => ({ results: ids.map((id) => ({ id })) }),
    }),
  });

  it('usa o calendário e, sem linha, roda pela ordem do calendário', async () => {
    const ids = ['Q615', 'Q11571', 'Q36488', 'Q1835', 'Q83163'];
    expect((await D.jogadorDoDia(d1({ '2026-10-25': 'Q615' }, ids), '2026-10-25')).id).toBe('Q615');
    const dias = await Promise.all(['2026-01-01', '2026-01-02', '2026-01-06'].map((d) => D.jogadorDoDia(d1({}, ids), d)));
    expect(dias.map((r) => r.id)).toEqual(['Q1835', 'Q83163', 'Q1835']);
    expect(await D.jogadorDoDia(d1({}, []), '2026-10-25')).toBeNull();
  });
});
