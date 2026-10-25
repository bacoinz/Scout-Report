import { describe, it, expect } from 'vitest';
import * as L from '../src/sala-logica.js';
import * as partida from '../src/partida.js';
import { estadoPublico, privado } from '../src/vista.js';
import * as P from '../public/js/comum/perguntas.js';
import { REGRAS } from '../src/regras.js';
import { todos, catalogoDeTeste, porNome } from './apoio.js';

const cat = catalogoDeTeste();

/**
 * Uma sala com `n` jogadores e a partida começada no modo Aleatório. O jogador i recebe o registo i de `nomes`
 * (aleatorio = 0 tira sempre o primeiro da reserva). Devolve { sala, ctx, t } com `t(ms)` para avançar o relógio.
 */
function montar(n, { nomes = null, config = {}, modo = 'aleatorio' } = {}) {
  const base = nomes ? nomes.map(porNome) : todos().filter((r) => r.fama.conhecido).slice(0, n + 8);
  const registos = new Map(base.map((r) => [r.id, r]));
  const ctx = { agora: 1_000_000, aleatorio: () => 0, registos, catalogo: cat };
  const sala = L.novaSala({ codigo: 'TEST', agora: ctx.agora });
  for (let i = 0; i < n; i++) L.entrar(sala, { token: `token-${i + 1}-abcdef`, nome: `J${i + 1}` }, ctx);
  L.configurar(sala, 'j1', { modo, ...config });
  const r = L.comecar(sala, 'j1', ctx, base.map((x) => x.id));
  expect(r).toEqual({ ok: true });
  const t = (ms) => {
    ctx.agora += ms;
    L.avancar(sala, ctx);
  };
  return { sala, ctx, t, p: sala.partida, base };
}
const vez = (sala) => sala.partida.vez;
const ficha = (sala, id) => partida.fichaDe(sala, id);
const jogador = (sala, id) => sala.jogadores.find((j) => j.id === id);
/** Uma pergunta aberta na ficha do alvo da vez com esta resposta, das fáceis (país da liga, prémios, estado…). */
function perguntaCom(sala, ctx, resposta) {
  const v = vez(sala);
  const reg = ctx.registos.get(sala.partida.segredos[v.alvo].registo);
  const f = sala.partida.fichas[v.ficha];
  const tipos = ['pais', 'premio', 'conf', 'setor', 'jogos', 'golos', 'assist', 'faixa', 'pe', 'altura', 'ativo', 'retirado', 'decada'];
  for (const tipo of tipos) {
    for (const k of P.candidatas(f, tipo, cat)) {
      if (P.disponivel(f, k, cat) && P.responder(reg, k) === resposta) return k;
    }
  }
  return null;
}
/** Deixa a ficha de `dono` com o palpite final desbloqueado (10 "sim" e um clube). */
function desbloquear(sala, ctx, dono) {
  const f = ficha(sala, dono);
  const reg = ctx.registos.get(sala.partida.segredos[dono].registo);
  const c = reg.carreira[0];
  f.respostas[`clube:${c.clube}`] = { r: 'sim', autor: 'jx', ronda: 1 };
  const tipos = ['conf', 'setor', 'decada', 'pais', 'jogos', 'golos', 'premio', 'ativo', 'retirado', 'pe', 'altura', 'faixa', 'inter'];
  for (const k of tipos.flatMap((t) => P.candidatas(f, t, cat))) {
    if (P.contarSim(f) >= P.SIM_MINIMOS) break;
    if (P.responder(reg, k) === 'sim') f.respostas[k] = { r: 'sim', autor: 'jx', ronda: 1 };
  }
  // Se ainda faltar, com perguntas livres respondidas "sim" (também contam).
  while (P.contarSim(f) < P.SIM_MINIMOS) f.livres.push({ texto: '?', r: 'sim', autor: 'jx', ronda: 1 });
  expect(P.palpiteDesbloqueado(f)).toBe(true);
}

describe('rotação dos alvos', () => {
  for (let n = 2; n <= 8; n++) {
    it(`com ${n} jogadores, em ${n - 1} rondas cada um pergunta a todos os outros, um de cada vez`, () => {
      const { sala, p } = montar(n);
      const vistos = new Map(sala.jogadores.map((j) => [j.id, new Set()]));
      for (let v = 1; v <= n - 1; v++) {
        p.ronda = p.cicloInicio + v - 1;
        const alvos = partida.calcularAlvos(sala);
        const ids = sala.jogadores.map((j) => j.id);
        for (const [i, id] of ids.entries()) {
          const d = ((v - 1) % (n - 1)) + 1;
          expect(alvos[id]).toBe(ids[(i + d) % n]);
          vistos.get(id).add(alvos[id]);
        }
        // Cada um é alvo de exatamente um.
        expect(new Set(Object.values(alvos)).size).toBe(n);
      }
      for (const [id, s] of vistos) expect(s.size, id).toBe(n - 1);
    });
  }

  it('quem já foi identificado continua a perguntar e deixa de ser alvo', () => {
    const { sala, ctx, p } = montar(4);
    ficha(sala, 'j2').identificada = { por: 'j1', ronda: 1 };
    p.ronda = 1;
    p.cicloInicio = 1;
    const alvos = partida.calcularAlvos(sala);
    expect(Object.values(alvos)).not.toContain('j2');
    expect(alvos.j2).toBeDefined();
    expect(alvos.j1).toBe('j3');
    void ctx;
  });

  it('a primeira ronda começa com a vez do primeiro, a perguntar ao seguinte', () => {
    const { sala } = montar(3);
    expect(sala.partida.fase).toBe('vez');
    expect(vez(sala)).toMatchObject({ jogador: 'j1', alvo: 'j2' });
    expect(vez(sala).prazo - vez(sala).inicio).toBe(REGRAS.vezMs);
  });
});

describe('perguntas da lista', () => {
  it('um "sim" dá os pontos do nível e passa a vez; um "não" só passa a vez', () => {
    const { sala, ctx } = montar(3);
    const k = perguntaCom(sala, ctx, 'sim');
    const r = partida.perguntar(sala, 'j1', { vez: vez(sala).seq, chave: k }, ctx);
    expect(r).toMatchObject({ ok: true, r: 'sim' });
    expect(jogador(sala, 'j1').total).toBe(P.pontos(k));
    expect(ficha(sala, 'j2').respostas[k]).toMatchObject({ r: 'sim', autor: 'j1' });
    expect(vez(sala)).toMatchObject({ jogador: 'j2', alvo: 'j3' });
    const n = perguntaCom(sala, ctx, 'nao');
    partida.perguntar(sala, 'j2', { vez: vez(sala).seq, chave: n }, ctx);
    expect(jogador(sala, 'j2').total).toBe(0);
    expect(vez(sala).jogador).toBe('j3');
  });

  it('SEM REGISTO não gasta a vez e fecha a pergunta nessa ficha', () => {
    // Um jogador com assistências por registar em várias épocas.
    const semRegisto = todos().find((r) => P.responder(r, 'assist:25') === 'sem_registo');
    const { sala, ctx } = montar(2, { nomes: ['Luís Figo', semRegisto.nome] });
    const f = ficha(sala, 'j2');
    const reg = ctx.registos.get(sala.partida.segredos.j2.registo);
    const k = ['assist:25', 'assist:50', 'assist:100', 'faixa:0', 'faixa:1', 'faixa:2', 'pe:direito', 'altura:180']
      .find((x) => P.responder(reg, x) === 'sem_registo');
    expect(k).toBeTruthy();
    const antes = vez(sala);
    ctx.agora += 40_000; // quase no fim da vez
    const r = partida.perguntar(sala, 'j1', { vez: antes.seq, chave: k }, ctx);
    expect(r.r).toBe('sem_registo');
    expect(vez(sala).seq).toBe(antes.seq);
    expect(vez(sala).prazo).toBeGreaterThanOrEqual(ctx.agora + REGRAS.vezMinimaMs);
    expect(P.avaliar(f, k, cat).estado).toBe('respondida');
    expect(partida.perguntar(sala, 'j1', { vez: antes.seq, chave: k }, ctx).erro).toBeTruthy();
  });

  it('recusa perguntas fechadas, inválidas, fora da vez ou de uma vez que já passou (sem gastar a vez)', () => {
    const { sala, ctx } = montar(3);
    const seq = vez(sala).seq;
    expect(partida.perguntar(sala, 'j1', { vez: seq, chave: 'clube:Q8682' }, ctx).erro).toMatch(/aberta/);
    expect(partida.perguntar(sala, 'j1', { vez: seq, chave: 'liga:Q324867' }, ctx).erro).toMatch(/não existe/);
    expect(partida.perguntar(sala, 'j1', { vez: seq, chave: 'jogos:150' }, ctx).erro).toMatch(/não existe/);
    expect(partida.perguntar(sala, 'j2', { vez: seq, chave: 'ativo' }, ctx)).toMatchObject({ antiga: true });
    expect(partida.perguntar(sala, 'j1', { vez: seq - 1, chave: 'ativo' }, ctx)).toMatchObject({ antiga: true });
    expect(vez(sala).seq).toBe(seq);
  });

  it('quem já foi identificado recebe metade dos pontos, arredondada para cima', () => {
    const { sala, ctx } = montar(3);
    jogador(sala, 'j1').identificado = true;
    const k = perguntaCom(sala, ctx, 'sim');
    partida.perguntar(sala, 'j1', { vez: vez(sala).seq, chave: k }, ctx);
    expect(jogador(sala, 'j1').total).toBe(Math.ceil(P.pontos(k) / 2));
  });
});

describe('pergunta livre', () => {
  it('o relógio para, o dono responde, e um "sim" dá 3 pontos', () => {
    const { sala, ctx, t } = montar(3);
    const seq = vez(sala).seq;
    expect(partida.perguntaLivre(sala, 'j1', { vez: seq, texto: '  Jogou com o irmão?  ' }, ctx)).toEqual({ ok: true });
    expect(sala.partida.fase).toBe('livre');
    expect(sala.partida.livre).toMatchObject({ autor: 'j1', alvo: 'j2', texto: 'Jogou com o irmão?' });
    t(20_000);
    expect(sala.partida.fase).toBe('livre');
    expect(partida.responderLivre(sala, 'j3', { resposta: 'sim' }, ctx).erro).toBeTruthy();
    expect(partida.responderLivre(sala, 'j2', { resposta: 'sim' }, ctx)).toEqual({ ok: true });
    expect(jogador(sala, 'j1').total).toBe(3);
    expect(ficha(sala, 'j2').livres).toEqual([expect.objectContaining({ texto: 'Jogou com o irmão?', r: 'sim', autor: 'j1' })]);
    expect(P.contarSim(ficha(sala, 'j2'))).toBe(1);
    expect(vez(sala).jogador).toBe('j2');
  });

  it('sem resposta em 30 s cai, e quem perguntou recupera a vez com pelo menos 15 s', () => {
    const { sala, ctx, t } = montar(3);
    const seq = vez(sala).seq;
    t(REGRAS.vezMs - 10_000);
    partida.perguntaLivre(sala, 'j1', { vez: seq, texto: 'É canhoto?' }, ctx);
    t(REGRAS.livreMs);
    expect(sala.partida.fase).toBe('vez');
    expect(vez(sala)).toMatchObject({ seq, jogador: 'j1' });
    expect(vez(sala).prazo - ctx.agora).toBe(REGRAS.vezMinimaMs);
    expect(sala.feed.at(-1).tipo).toBe('livre_cancelada');
  });

  it('cai logo se o dono se desligar, e não se pode fazer a quem está desligado', () => {
    const { sala, ctx } = montar(3);
    const seq = vez(sala).seq;
    partida.perguntaLivre(sala, 'j1', { vez: seq, texto: 'É canhoto?' }, ctx);
    L.desligar(sala, 'j2', ctx);
    expect(sala.partida.fase).toBe('vez');
    expect(partida.perguntaLivre(sala, 'j1', { vez: seq, texto: 'É canhoto?' }, ctx).erro).toMatch(/não está ligado/);
  });
});

describe('palpite final e identificação', () => {
  it('fechado sem 6 "sim" e um clube; um palpite errado fica descartado e passa a vez', () => {
    const { sala, ctx, base } = montar(3);
    const seq = vez(sala).seq;
    const n = ficha(sala, 'j2').n;
    expect(partida.palpitar(sala, 'j1', { vez: seq, ficha: n, jogador: base[1].id }, ctx).erro).toMatch(/desbloqueado/);
    desbloquear(sala, ctx, 'j2');
    expect(partida.palpitar(sala, 'j1', { vez: seq, ficha: ficha(sala, 'j1').n, jogador: base[0].id }, ctx).erro).toMatch(/própria/);
    const errado = base[5];
    expect(partida.palpitar(sala, 'j1', { vez: seq, ficha: n, jogador: errado.id, nome: errado.nome }, ctx)).toEqual({ ok: true, certo: false });
    expect(ficha(sala, 'j2').palpites).toEqual([expect.objectContaining({ id: errado.id, nome: errado.nome, autor: 'j1' })]);
    expect(vez(sala).jogador).toBe('j2');
  });

  it('pode dar-se a qualquer ficha desbloqueada (não só à do alvo); o certo vale 30 e identifica', () => {
    const { sala, ctx, t, base } = montar(3);
    desbloquear(sala, ctx, 'j3');
    const n = ficha(sala, 'j3').n;
    const r = partida.palpitar(sala, 'j1', { vez: vez(sala).seq, ficha: n, jogador: base[2].id, nome: 'x' }, ctx);
    expect(r).toEqual({ ok: true, certo: true });
    expect(jogador(sala, 'j1').total).toBe(30);
    expect(jogador(sala, 'j3').identificado).toBe(true);
    expect(ficha(sala, 'j3').identificada).toMatchObject({ por: 'j1' });
    expect(ficha(sala, 'j3').revelada.nome).toBe(base[2].nome);
    expect(sala.partida.fase).toBe('identificado');
    t(REGRAS.identificadoMs);
    // Ficaram 2 alvos: a partida continua, com a vez do seguinte.
    expect(sala.fase).toBe('jogo');
    expect(vez(sala).jogador).toBe('j2');
    expect(vez(sala).alvo).toBe('j1'); // o alvo dele (j3) foi identificado: passa ao seguinte
  });

  it('quem foi identificado recebe 15 por um palpite certo; a partida só acaba quando todos forem identificados', () => {
    const { sala, ctx, t, base } = montar(3);
    jogador(sala, 'j1').identificado = true;
    ficha(sala, 'j1').identificada = { por: 'j2', ronda: 1 };
    desbloquear(sala, ctx, 'j2');
    partida.palpitar(sala, 'j1', { vez: vez(sala).seq, ficha: ficha(sala, 'j2').n, jogador: base[1].id }, ctx);
    expect(jogador(sala, 'j1').total).toBe(15);
    t(REGRAS.identificadoMs);
    // Falta o do j3: os outros perguntam-lhe, e o j3, que já não tem a quem perguntar, não joga.
    expect(sala.fase).toBe('jogo');
    expect(vez(sala)).toMatchObject({ jogador: 'j2', alvo: 'j3' });
    t(REGRAS.vezMs);
    expect(vez(sala)).toMatchObject({ jogador: 'j1', alvo: 'j3' });
    desbloquear(sala, ctx, 'j3');
    partida.palpitar(sala, 'j1', { vez: vez(sala).seq, ficha: ficha(sala, 'j3').n, jogador: base[2].id }, ctx);
    t(REGRAS.identificadoMs);
    expect(sala.fase).toBe('final');
    for (const f of Object.values(sala.partida.fichas)) expect(f.revelada?.nome).toBeTruthy();
  });

  it('não aceita um jogador já descartado nessa ficha (sem gastar a vez)', () => {
    const { sala, ctx, base } = montar(3);
    desbloquear(sala, ctx, 'j2');
    const n = ficha(sala, 'j2').n;
    partida.palpitar(sala, 'j1', { vez: vez(sala).seq, ficha: n, jogador: base[6].id }, ctx);
    desbloquear(sala, ctx, 'j3');
    const seq = vez(sala).seq;
    expect(partida.palpitar(sala, 'j2', { vez: seq, ficha: ficha(sala, 'j3').n, jogador: base[6].id }, ctx)).toEqual({ ok: true, certo: false });
    void seq;
  });
});

describe('tempo, desligados e fim', () => {
  it('a vez acaba quando o tempo acaba', () => {
    const { sala, t } = montar(3);
    t(REGRAS.vezMs);
    expect(vez(sala).jogador).toBe('j2');
    expect(sala.feed.some((e) => e.tipo === 'tempo' && e.jogador === 'j1')).toBe(true);
  });

  it('quem se desliga na sua vez fica com 10 s; na ronda seguinte, desligado há 10 s, a vez salta', () => {
    const { sala, ctx, t } = montar(3);
    L.desligar(sala, 'j1', ctx);
    expect(vez(sala).prazo).toBe(ctx.agora + REGRAS.desligadoSaltaMs);
    t(REGRAS.desligadoSaltaMs);
    expect(vez(sala).jogador).toBe('j2');
    t(REGRAS.vezMs);
    t(REGRAS.vezMs);
    // Ronda 2: a vez do j1 salta.
    expect(sala.partida.ronda).toBe(2);
    expect(vez(sala).jogador).toBe('j2');
    expect(sala.feed.some((e) => e.tipo === 'saltou' && e.jogador === 'j1')).toBe(true);
  });

  it('sem ninguém ligado a partida congela; quando alguém volta, continua de onde estava', () => {
    const { sala, ctx, t } = montar(2);
    t(5_000);
    const falta = vez(sala).prazo - ctx.agora;
    L.desligar(sala, 'j2', ctx);
    L.desligar(sala, 'j1', ctx);
    expect(sala.partida.congelada).toBeTruthy();
    expect(L.proximoPrazo(sala)).toBeGreaterThan(ctx.agora + 60 * 60_000); // só a limpeza da sala vazia
    ctx.agora += 60 * 60_000;
    L.entrar(sala, { token: 'token-2-abcdef' }, ctx);
    L.entrar(sala, { token: 'token-1-abcdef' }, ctx);
    expect(sala.partida.congelada).toBeNull();
    expect(vez(sala).jogador).toBe('j1');
    expect(vez(sala).prazo - ctx.agora).toBeLessThanOrEqual(Math.min(falta, REGRAS.desligadoSaltaMs));
  });

  it('não há limite de rondas nem de tempo', () => {
    const { sala, t } = montar(2);
    for (let i = 0; i < 60; i++) t(REGRAS.vezMs);
    expect(sala.fase).toBe('jogo');
    expect(sala.partida.ronda).toBeGreaterThan(25);
    expect(sala.partida.joker.feita).toBe(true);
  });

  it('se só estiver ligado o dono do último secreto (que não tem a quem perguntar), a partida congela', () => {
    const { sala, ctx, t, base } = montar(2);
    desbloquear(sala, ctx, 'j2');
    partida.palpitar(sala, 'j1', { vez: vez(sala).seq, ficha: ficha(sala, 'j2').n, jogador: base[1].id }, ctx);
    t(REGRAS.identificadoMs);
    expect(vez(sala)).toMatchObject({ jogador: 'j2', alvo: 'j1' });
    L.desligar(sala, 'j2', ctx);
    t(REGRAS.vezMs);
    t(REGRAS.vezMs);
    expect(sala.partida.congelada).toBeTruthy();
    expect(sala.fase).toBe('jogo');
    L.entrar(sala, { token: 'token-2-abcdef' }, ctx);
    expect(sala.partida.congelada).toBeNull();
    expect(vez(sala)).toMatchObject({ jogador: 'j2', alvo: 'j1' });
  });

  it('quem sai a meio: a ficha fica até ao fim da ronda e depois é revelada e sai da rotação', () => {
    const { sala, ctx, t } = montar(4);
    L.sair(sala, 'j3', ctx);
    expect(jogador(sala, 'j3').saindo).toBe(true);
    t(REGRAS.vezMs);
    t(REGRAS.vezMs);
    expect(vez(sala).jogador).toBe('j4'); // a vez do j3 salta
    t(REGRAS.vezMs);
    expect(sala.partida.ronda).toBe(2);
    expect(jogador(sala, 'j3').saiu).toBe(true);
    expect(ficha(sala, 'j3').revelada).toBeTruthy();
    expect(Object.values(sala.partida.alvos)).not.toContain('j3');
  });

  it('quem entra a meio fica a ver e joga a partir da ronda seguinte, com um jogador secreto', () => {
    const { sala, ctx, t } = montar(2);
    const r = L.entrar(sala, { token: 'token-novo-abcdef', nome: 'Novo' }, ctx);
    expect(r.jogador.espectador).toBe(true);
    t(REGRAS.vezMs);
    t(REGRAS.vezMs);
    expect(sala.partida.ronda).toBe(2);
    expect(jogador(sala, r.jogador.id).espectador).toBe(false);
    expect(ficha(sala, r.jogador.id)).toBeTruthy();
    expect(Object.values(sala.partida.alvos)).toContain(r.jogador.id);
  });
});

describe('modo Escolha', () => {
  it('cada um escolhe uma de três cartas; quando todos escolhem, começa', () => {
    const { sala, ctx } = montar(2, { modo: 'escolha' });
    const p = sala.partida;
    expect(p.fase).toBe('escolha');
    const c1 = p.cartas.j1.ids;
    const c2 = p.cartas.j2.ids;
    expect(c1).toHaveLength(3);
    expect(new Set([...c1, ...c2]).size).toBe(6);
    expect(partida.escolherCarta(sala, 'j1', c2[0], ctx).erro).toBeTruthy();
    partida.escolherCarta(sala, 'j1', c1[1], ctx);
    expect(p.fase).toBe('escolha');
    partida.escolherCarta(sala, 'j2', c2[2], ctx);
    expect(p.fase).toBe('vez');
    expect(p.segredos.j1.registo).toBe(c1[1]);
    expect(p.segredos.j2.registo).toBe(c2[2]);
  });

  it('quem não escolhe em 30 s recebe uma das suas cartas', () => {
    const { sala, t } = montar(2, { modo: 'escolha' });
    const c1 = sala.partida.cartas.j1.ids;
    t(REGRAS.escolhaMs);
    expect(sala.partida.fase).toBe('vez');
    expect(c1).toContain(sala.partida.segredos.j1.registo);
  });
});

describe('vista', () => {
  it('nenhum jogador secreto por identificar aparece fora do dossier do próprio', () => {
    const { sala, ctx, t, base } = montar(3, { modo: 'escolha' });
    const textoPublico = () => JSON.stringify(estadoPublico(sala, ctx.agora));
    const segredos = () => base.filter((r) => sala.usados.includes(r.id));
    for (const r of segredos()) {
      expect(textoPublico()).not.toContain(r.id);
      expect(textoPublico()).not.toContain(`"${r.nome}"`);
    }
    // As cartas só chegam a quem as recebeu.
    const eu1 = privado(sala, 'j1', ctx.registos);
    expect(eu1.cartas.resumos).toHaveLength(3);
    expect(JSON.stringify(privado(sala, 'j2', ctx.registos))).not.toContain(eu1.cartas.ids[0]);
    t(REGRAS.escolhaMs);
    const meu = sala.partida.segredos.j1.registo;
    expect(privado(sala, 'j1', ctx.registos).dossier.id).toBe(meu);
    expect(JSON.stringify(privado(sala, 'j2', ctx.registos))).not.toContain(meu);
    for (const id of Object.values(sala.partida.segredos).map((s) => s.registo)) expect(textoPublico()).not.toContain(id);
    // Os palpites errados mostram o nome, mas não o id.
    desbloquear(sala, ctx, 'j2');
    const errado = todos().find((r) => !sala.usados.includes(r.id));
    partida.palpitar(sala, 'j1', { vez: vez(sala).seq, ficha: ficha(sala, 'j2').n, jogador: errado.id, nome: errado.nome }, ctx);
    expect(textoPublico()).toContain(errado.nome);
    expect(textoPublico()).not.toContain(`"${errado.id}"`);
  });
});

describe('Ronda Joker', () => {
  /** Avança até ao fim da ronda `n` (todas as vezes por tempo). */
  const ateAoFimDaRonda = (sala, t, n) => {
    for (let i = 0; i < 200 && sala.partida.fase === 'vez' && sala.partida.ronda <= n; i++) t(REGRAS.vezMs);
  };

  it('uma por partida, numa ronda ao calhas entre a 3.ª e a 6.ª', () => {
    for (const [sorte, ronda] of [[0, 3], [0.3, 4], [0.6, 5], [0.99, 6]]) {
      const { sala } = montar(2, {}); // a ronda sorteia-se no início
      const p = sala.partida;
      p.joker.ronda = 3 + Math.floor(sorte * 4);
      expect(p.joker.ronda).toBe(ronda);
    }
  });

  it('no fim da ronda: a ficha com menos "sim", palpites escondidos, revelação, pontos e o valor na ficha', () => {
    const { sala, ctx, t } = montar(3);
    const p = sala.partida;
    expect(p.joker.ronda).toBe(3); // aleatorio = 0
    ateAoFimDaRonda(sala, t, 3);
    expect(p.fase).toBe('joker');
    const j = p.joker;
    expect(j.dono).toBe('j1'); // empate a zero "sim": fica a primeira
    expect(j.pergunta).toBe('jogos');
    const publico = estadoPublico(sala, ctx.agora).partida.joker;
    expect(publico).toMatchObject({ fase: 'joker', ficha: j.ficha, dono: 'j1', pergunta: 'jogos', enviados: [] });
    expect(publico.valor).toBeUndefined();
    expect(publico.lances).toBeUndefined();
    // O dono não responde; os outros uma vez só; um número inteiro.
    expect(partida.lance(sala, 'j1', { valor: 10 }, ctx).erro).toBeTruthy();
    expect(partida.lance(sala, 'j2', { valor: 'x' }, ctx).erro).toBeTruthy();
    jogador(sala, 'j3').identificado = true; // recebe metade
    expect(partida.lance(sala, 'j2', { valor: j.valor - 1 }, ctx)).toEqual({ ok: true });
    expect(partida.lance(sala, 'j2', { valor: j.valor }, ctx).erro).toMatch(/Já deste/);
    expect(privado(sala, 'j2', ctx.registos).lance).toBe(j.valor - 1);
    expect(privado(sala, 'j3', ctx.registos).lance).toBeNull();
    expect(estadoPublico(sala, ctx.agora).partida.joker.enviados).toEqual(['j2']);
    // Quando todos os que estão ligados respondem, revela-se logo.
    partida.lance(sala, 'j3', { valor: j.valor }, ctx);
    expect(p.fase).toBe('revelacao');
    expect(j.pontos).toEqual({ j2: 0, j3: 8, j1: 0 });
    expect(jogador(sala, 'j3').total).toBe(8);
    expect(estadoPublico(sala, ctx.agora).partida.joker).toMatchObject({ valor: j.valor, lances: { j2: j.valor - 1, j3: j.valor } });
    // O valor fica na ficha e decide as perguntas dos jogos.
    const f = sala.partida.fichas[j.ficha];
    expect(f.valores).toEqual({ jogos: j.valor });
    expect(P.avaliar(f, 'jogos:100', cat)).toMatchObject({ estado: 'deduzida', de: 'joker:jogos' });
    expect(P.contarSim(f)).toBe(0); // não conta como "sim"
    // Depois da revelação, a ronda seguinte; não volta a haver Joker.
    t(REGRAS.jokerRevelacaoMs);
    expect(p.fase).toBe('vez');
    expect(p.ronda).toBe(4);
    ateAoFimDaRonda(sala, t, 7);
    expect(p.fase).toBe('vez');
    expect(sala.feed.filter((e) => e.tipo === 'joker')).toHaveLength(1);
  });

  it('sem ninguém ligado para responder, passa para o fim da ronda seguinte; acaba por tempo', () => {
    const { sala, ctx, t } = montar(3);
    const p = sala.partida;
    L.desligar(sala, 'j2', ctx);
    L.desligar(sala, 'j3', ctx);
    ateAoFimDaRonda(sala, t, 3);
    expect(p.ronda).toBe(4);
    expect(p.fase).toBe('vez');
    L.entrar(sala, { token: 'token-2-abcdef' }, ctx);
    ateAoFimDaRonda(sala, t, 4);
    expect(p.fase).toBe('joker');
    // Sem palpites: acaba quando o tempo acaba, e o dono ganha os 9 (ninguém ficou abaixo).
    t(REGRAS.jokerAnuncioMs + REGRAS.jokerMs);
    expect(p.fase).toBe('revelacao');
    expect(p.joker.pontos.j1).toBe(9);
  });
});
