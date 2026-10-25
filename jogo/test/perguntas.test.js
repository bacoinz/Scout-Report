import { describe, it, expect } from 'vitest';
import * as P from '../public/js/comum/perguntas.js';
import { registo, todos, catalogoDeTeste, ficha, porNome } from './apoio.js';

const cat = catalogoDeTeste();
const ZIDANE = 'Q1835';
const REAL_MADRID = 'Q8682';

describe('respostas a partir do registo', () => {
  const z = registo(ZIDANE);
  const casos = {
    'decada:1980': 'sim', 'decada:1990': 'nao', 'ano:1989': 'sim',
    'conf:UEFA': 'sim', 'nac:FR': 'sim', 'nac:DZ': 'nao',
    'setor:medio': 'sim', 'pos:MO': 'sim', 'pos:MC': 'nao',
    'pe:direito': 'sim', 'pe:esquerdo': 'nao', 'altura:180': 'sim', 'altura:185': 'nao',
    retirado: 'nao', ativo: 'nao', treinador: 'sim',
    'pais:ES': 'sim', 'pais:GB-ENG': 'nao', 'pais_atual:ES': 'nao',
    [`clube:${REAL_MADRID}`]: 'sim', [`clube_atual:${REAL_MADRID}`]: 'nao',
    'jogos:500': 'sim', 'golos:200': 'nao', 'inter:100': 'sim', 'assist:100': 'sim', 'inter_menos:25': 'nao', 'assist_menos:25': 'nao',
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

  it('menos de 25 assistências: "sim" só com o máximo estimado abaixo de 25 ou a carreira coberta', () => {
    expect(P.respostaAssistenciasMenos({ conhecidas: 30, cobertura: 0.3, maximo: 400 }, 25)).toBe('nao');
    expect(P.respostaAssistenciasMenos({ conhecidas: 10, cobertura: 0.3, maximo: 20 }, 25)).toBe('sim');
    expect(P.respostaAssistenciasMenos({ conhecidas: 10, cobertura: 0.95, maximo: 400 }, 25)).toBe('sim');
    expect(P.respostaAssistenciasMenos({ conhecidas: 10, cobertura: 0.5, maximo: 400 }, 25)).toBe('sem_registo');
  });

  it('no ativo: o clube atual é o do contrato em curso, mesmo com empréstimos antigos listados depois', () => {
    const valverde = porNome('Federico Valverde');
    expect(P.responder(valverde, 'ativo')).toBe('sim');
    expect(P.responder(valverde, `clube_atual:${REAL_MADRID}`)).toBe('sim');
    expect(P.responder(valverde, 'pais_atual:ES')).toBe('sim');
  });

  it('o estado tem uma só resposta certa: no ativo, treinador (já não joga) ou retirado', () => {
    for (const reg of todos()) {
      const certas = ['ativo', 'retirado', 'treinador'].filter((k) => P.responder(reg, k) === 'sim');
      expect(certas, reg.nome).toHaveLength(1);
    }
    expect(P.responder(porNome('Luís Figo'), 'retirado')).toBe('sim');
  });

  it('no ativo e sem clube (contrato acabado): as perguntas "atualmente" dão não', () => {
    const sterling = porNome('Raheem Sterling');
    expect(sterling.clube_atual).toBeNull();
    expect(P.responder(sterling, 'ativo')).toBe('sim');
    expect(P.responder(sterling, 'retirado')).toBe('nao');
    expect(P.responder(sterling, 'pais_atual:GB-ENG')).toBe('nao');
    expect(P.responder(sterling, 'pais_atual:NL')).toBe('nao');
  });

  it('sem pé ou altura no registo dá SEM REGISTO', () => {
    const sem = { ...registo(ZIDANE), perfil: { pe: null, altura_cm: null } };
    expect(P.responder(sem, 'pe:direito')).toBe('sem_registo');
    expect(P.responder(sem, 'altura:175')).toBe('sem_registo');
  });

  it('todas as perguntas candidatas respondem sem erro para todos os jogadores', () => {
    const aberta = ficha({
      'decada:2000': 'sim', 'conf:UEFA': 'sim', 'setor:medio': 'sim', 'faixa:1': 'sim', treinador: 'sim',
      't_pais:PT': 'sim', 'pais:PT': 'sim', 'pais_atual:PT': 'sim',
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
  it('artigos de países e clubes', () => {
    expect(P.texto('pais:BR', cat)).toBe('Jogou no Brasil?');
    expect(P.texto('pais:ES', cat)).toBe('Jogou em Espanha?');
    expect(P.texto('pais_atual:NL', cat)).toBe('Joga atualmente nos Países Baixos?');
    expect(P.texto('treinador', cat)).toBe('É treinador?');
    expect(P.texto('completo:pais', cat)).toBe('Já se encontraram todos os países');
    expect(P.texto('nac:AR', cat)).toBe('É da Argentina?');
    expect(P.texto('nac:PT', cat)).toBe('É de Portugal?');
    expect(P.texto('conf:CAF', cat)).toBe('É de África?');
    expect(P.texto('conf:UEFA', cat)).toBe('É da Europa?');
    expect(P.texto(`clube:${REAL_MADRID}`, cat)).toBe('Jogou no Real Madrid?');
    expect(P.texto('clube:Q1422', cat)).toBe('Jogou na Juventus?');
    expect(P.texto('t_sel:FR', cat)).toBe('Treinou a seleção de França?');
    expect(P.texto('t_pais:BR', cat)).toBe('Treinou no Brasil?');
    expect(P.texto(`t_atual_clube:${REAL_MADRID}`, cat)).toBe('Treina atualmente o Real Madrid?');
  });
  it('números, alturas, décadas e limiares', () => {
    expect(P.texto('faixa:0', cat)).toBe('Usou um número de 1 a 9?');
    expect(P.texto('faixa:1', cat)).toBe('Usou um número de 10 a 19?');
    expect(P.texto('faixa:2', cat)).toBe('Usou um número a partir do 20?');
    expect(P.texto('altura:180', cat)).toBe('Mede mais de 1,80 m?');
    expect(P.texto('baixo:175', cat)).toBe('Mede menos de 1,75 m?');
    expect(P.texto('pe:ambos', cat)).toBe('É ambidestro?');
    expect(P.texto('decada:1990', cat)).toBe('Estreou-se como sénior nos anos 90?');
    expect(P.texto('decada:2010', cat)).toBe('Estreou-se como sénior nos anos 2010?');
    expect(P.texto('t_titulos:0', cat)).toBe('Ganhou algum título como treinador?');
    expect(P.afirmacao('pos:MO', cat)).toBe('É médio ofensivo');
  });
});

describe('validação das chaves', () => {
  it('recusa o que não existe', () => {
    for (const k of ['liga:Q324867', 'liga_atual:Q324867', 'foi_treinador', 'jogos:150', 'num:100', 'num:0', 'premio:melhor_treinador_fifa', 'ativo:1', '__proto__',
      'constructor', 'decada:1950', 'baixo:180', 'nac:XX', 'pais:FO', 'faixa:3', 'clube:', '', null, 'pe:canhoto']) {
      expect(P.valida(k, cat), String(k)).toBe(false);
    }
  });
  it('aceita o que existe', () => {
    for (const k of [`clube:${REAL_MADRID}`, 'jogos:300', 'num:99', 'premio:liga_campeoes', 'ativo', 'treinador', 'decada:1970', 'baixo:175',
      'nac:PT', 'pais:PT', 't_premio:melhor_treinador_fifa']) {
      expect(P.valida(k, cat), k).toBe(true);
    }
  });
});

describe('hierarquia', () => {
  it('o clube abre com o país (da carreira ou o atual) e fecha quando ele é descartado', () => {
    expect(P.avaliar(ficha(), `clube:${REAL_MADRID}`, cat)).toMatchObject({ estado: 'bloqueada', fechada: false });
    expect(P.avaliar(ficha({ 'pais:ES': 'sim' }), `clube:${REAL_MADRID}`, cat).estado).toBe('aberta');
    expect(P.avaliar(ficha({ 'pais_atual:ES': 'sim' }), `clube:${REAL_MADRID}`, cat).estado).toBe('aberta');
    expect(P.avaliar(ficha({ 'pais:ES': 'nao' }), `clube:${REAL_MADRID}`, cat)).toMatchObject({ estado: 'bloqueada', fechada: true });
    expect(P.candidatas(ficha({ 'pais:ES': 'sim' }), 'clube', cat)).toContain(`clube:${REAL_MADRID}`);
    expect(P.candidatas(ficha({ 'pais:ES': 'sim' }), 'clube', cat)).not.toContain('clube:Q1422'); // a Juventus é de Itália
  });
  it('o clube atual só abre com o país atual', () => {
    expect(P.disponivel(ficha({ 'pais:ES': 'sim' }), `clube_atual:${REAL_MADRID}`, cat)).toBe(false);
    expect(P.disponivel(ficha({ 'pais_atual:ES': 'sim' }), `clube_atual:${REAL_MADRID}`, cat)).toBe(true);
    expect(P.candidatas(ficha({ 'pais:ES': 'sim' }), 'clube_atual', cat)).toEqual([]);
  });
  it('depois de um país ou clube certo continua-se a perguntar pelos outros', () => {
    const f = ficha({ 'pais:ES': 'sim', [`clube:${REAL_MADRID}`]: 'sim' });
    expect(P.avaliar(f, 'pais:IT', cat).estado).toBe('aberta');
    expect(P.avaliar(f, 'clube:Q8687', cat).estado).toBe('aberta');
  });
  it('com todos os países (ou clubes) encontrados, os outros ficam "não"', () => {
    const zidane = registo(ZIDANE);
    const paises = [...new Set(zidane.carreira.flatMap((c) => c.paises_liga))];
    const f = ficha(Object.fromEntries(paises.map((p) => [`pais:${p}`, 'sim'])));
    expect(P.completos(zidane, f)).toEqual({ pais: true, clube: false });
    expect(P.completos(zidane, ficha({ 'pais:ES': 'sim' })).pais).toBe(false);
    f.completos = P.completos(zidane, f);
    expect(P.avaliar(f, 'pais:PT', cat)).toMatchObject({ estado: 'deduzida', r: 'nao', de: 'completo:pais' });
    expect(P.avaliar(f, 'pais_atual:PT', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(f, `clube:${REAL_MADRID}`, cat).estado).toBe('aberta');
    const clubes = [...new Set(zidane.carreira.map((c) => c.clube))];
    const g = ficha({ ...Object.fromEntries(paises.map((p) => [`pais:${p}`, 'sim'])), ...Object.fromEntries(clubes.map((c) => [`clube:${c}`, 'sim'])) });
    expect(P.completos(zidane, g)).toEqual({ pais: true, clube: true });
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
  it('o Treinador só abre com "Treinador" ✓ no estado, e o clube treinado com o país', () => {
    expect(P.disponivel(ficha(), 't_atual', cat)).toBe(false);
    expect(P.disponivel(ficha({ treinador: 'sim' }), 't_atual', cat)).toBe(true);
    expect(P.disponivel(ficha({ treinador: 'sim' }), `t_clube:${REAL_MADRID}`, cat)).toBe(false);
    expect(P.disponivel(ficha({ treinador: 'sim', 't_pais:ES': 'sim' }), `t_clube:${REAL_MADRID}`, cat)).toBe(true);
    expect(P.comTreinador(ficha({ treinador: 'nao' }))).toBe(false);
    expect(P.comTreinador(ficha({ ativo: 'nao', retirado: 'nao' }))).toBe(true);   // deduzido
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
    expect(P.avaliar(ficha({ 'altura:175': 'sim' }), 'baixo:175', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ 'baixo:175': 'sim' }), 'altura:190', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ 'altura:175': 'nao' }), 'baixo:175', cat).estado).toBe('aberta'); // pode medir 1,75 certo
    expect(P.avaliar(ficha({ 't_premio:mundial': 'sim', treinador: 'sim' }), 't_titulos:0', cat))
      .toMatchObject({ estado: 'deduzida', r: 'sim' });
  });
  it('"menos de 25" e "mais de 25" excluem-se', () => {
    expect(P.avaliar(ficha({ 'assist:25': 'sim' }), 'assist_menos:25', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ 'inter_menos:25': 'sim' }), 'inter:50', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ 'inter:25': 'nao' }), 'inter_menos:25', cat).estado).toBe('aberta'); // pode ter 25 certas
  });

  it('com a nacionalidade confirmada, os torneios de outras confederações ficam "não"', () => {
    const pt = ficha({ 'conf:UEFA': 'sim', 'nac:PT': 'sim' });
    expect(P.avaliar(pt, 'premio:taca_asia', cat)).toMatchObject({ estado: 'deduzida', r: 'nao', de: 'nac:PT' });
    expect(P.avaliar(pt, 'premio:copa_america', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(pt, 'premio:europeu', cat).estado).toBe('aberta');
    expect(P.avaliar(pt, 'premio:mundial', cat).estado).toBe('aberta');
    expect(P.avaliar(pt, 'premio:liga_campeoes', cat).estado).toBe('aberta');
    // Com duas nacionalidades confirmadas, abrem-se as duas confederações.
    const deco = ficha({ 'conf:UEFA': 'sim', 'conf:CONMEBOL': 'sim', 'nac:PT': 'sim', 'nac:BR': 'sim' });
    expect(P.avaliar(deco, 'premio:copa_america', cat).estado).toBe('aberta');
    // O continente descartado também fecha.
    expect(P.avaliar(ficha({ 'conf:AFC': 'nao' }), 'premio:taca_asia', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    // Os da base batem certo com a regra (ninguém ganhou um torneio de uma confederação que não é a sua).
    for (const reg of todos()) {
      const f = ficha(Object.fromEntries(reg.nacionalidades.map((n) => [`nac:${n}`, 'sim'])));
      for (const p of reg.premios) if (p.id && P.avaliar(f, `premio:${p.id}`, cat).r === 'nao') throw new Error(`${reg.nome}: ${p.id}`);
    }
  });

  it('década, ano e pé excluem-se', () => {
    expect(P.avaliar(ficha({ 'decada:1990': 'sim' }), 'decada:2000', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ 'decada:1990': 'sim', 'ano:1995': 'sim' }), 'ano:1996', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ 'pe:esquerdo': 'sim' }), 'pe:direito', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ 'pe:esquerdo': 'nao' }), 'pe:direito', cat).estado).toBe('aberta');
  });
  it('o estado: um ✓ fecha os outros dois, dois ✗ dão o terceiro, e quem não joga não tem nada "atualmente"', () => {
    expect(P.avaliar(ficha({ ativo: 'sim' }), 'retirado', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ ativo: 'sim' }), 'treinador', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ treinador: 'sim' }), 'retirado', cat)).toMatchObject({ estado: 'deduzida', r: 'nao', de: 'treinador' });
    expect(P.avaliar(ficha({ ativo: 'nao' }), 'retirado', cat).estado).toBe('aberta');
    expect(P.avaliar(ficha({ ativo: 'nao', retirado: 'nao' }), 'treinador', cat)).toMatchObject({ estado: 'deduzida', r: 'sim' });
    expect(P.avaliar(ficha({ retirado: 'sim' }), 'pais_atual:ES', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(ficha({ treinador: 'sim' }), 'pais_atual:ES', cat)).toMatchObject({ estado: 'deduzida', r: 'nao', de: 'treinador' });
    const f = ficha({ 'pais_atual:ES': 'sim', [`clube_atual:${REAL_MADRID}`]: 'sim' });
    expect(P.avaliar(f, `clube:${REAL_MADRID}`, cat)).toMatchObject({ estado: 'deduzida', r: 'sim' });
    expect(P.avaliar(f, 'pais:ES', cat)).toMatchObject({ estado: 'deduzida', r: 'sim' });
    expect(P.avaliar(f, 'ativo', cat)).toMatchObject({ estado: 'deduzida', r: 'sim' });
    expect(P.avaliar(f, 'treinador', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(f, 'clube_atual:Q8687', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
    expect(P.avaliar(f, 'pais_atual:IT', cat)).toMatchObject({ estado: 'deduzida', r: 'nao' });
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
  it('pede 10 "sim" (estruturados e livres, sem deduções) e um clube confirmado', () => {
    expect(P.SIM_MINIMOS).toBe(10);
    const nove = {
      'conf:UEFA': 'sim', 'pais:ES': 'sim', 'pais:IT': 'sim', 'jogos:300': 'sim', 'setor:medio': 'sim',
      'golos:50': 'sim', 'premio:liga_campeoes': 'sim', 'decada:1990': 'sim', 'faixa:0': 'sim',
    };
    expect(P.contarSim(ficha({ ...nove, 'jogos:500': 'nao' }))).toBe(9);
    expect(P.palpiteDesbloqueado(ficha(nove, ['sim']))).toBe(false); // falta o clube
    expect(P.faltaParaPalpite(ficha(nove))).toEqual({ sim: 1, clube: true });
    expect(P.palpiteDesbloqueado(ficha({ ...nove, [`clube:${REAL_MADRID}`]: 'sim' }))).toBe(true);
    expect(P.palpiteDesbloqueado(ficha({ ...nove, [`clube_atual:${REAL_MADRID}`]: 'sim' }))).toBe(true);
  });
});

describe('pontos', () => {
  it('3/6/9 por nível, físico 3, metade arredondada para cima para quem foi identificado', () => {
    expect(P.pontos('pais:ES')).toBe(3);
    expect(P.pontos(`clube:${REAL_MADRID}`)).toBe(6);
    expect(P.pontos(`clube_atual:${REAL_MADRID}`)).toBe(6);
    expect(P.pontos('num:7')).toBe(9);
    expect(P.pontos('pe:esquerdo')).toBe(3);
    expect(P.comFator(9, true)).toBe(5);
    expect(P.comFator(30, true)).toBe(15);
    expect(P.comFator(3, true)).toBe(2);
    expect(P.comFator(6, false)).toBe(6);
  });
});

describe('cada jogador da base pode ser identificado', () => {
  it('há um caminho país → clube até um clube da carreira', () => {
    for (const reg of todos()) {
      const ok = reg.carreira.some((c) => c.paises_liga.some((pais) => {
        const f = ficha({ [`pais:${pais}`]: 'sim' });
        return P.candidatas(f, 'clube', cat).includes(`clube:${c.clube}`) && P.disponivel(f, `clube:${c.clube}`, cat);
      }));
      expect(ok, reg.nome).toBe(true);
    }
  });
});
