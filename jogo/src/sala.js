// Durable Object de uma sala: WebSockets (com hibernação), persistência, alarmes e D1.
// Toda a lógica está em sala-logica.js e partida.js; aqui só há I/O. (Adaptado do Guess The Kit.)
// Os registos sorteados ficam no armazenamento do DO, um por chave ("reg:Q11571"), e em memória num Map.
import { DurableObject } from 'cloudflare:workers';
import * as L from './sala-logica.js';
import * as partida from './partida.js';
import { REGRAS } from './regras.js';
import { estadoPublico, privado } from './vista.js';
import { contar, sortear, catalogoPreparado, lerVersao } from './catalogo.js';

const PREFIXO = 'reg:';

export class Sala extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sala = null;
    this.registos = new Map();
    this.aSortear = false;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.sala = (await ctx.storage.get('sala')) ?? null;
      for (const [chave, reg] of await ctx.storage.list({ prefix: PREFIXO })) this.registos.set(chave.slice(PREFIXO.length), reg);
    });
  }

  contexto(catalogo = null) {
    return { agora: Date.now(), aleatorio: Math.random, registos: this.registos, catalogo };
  }

  // --- RPC chamado pelo Worker ---

  async criar({ codigo, anfitriaoToken }) {
    if (this.sala) return { ok: false };
    this.sala = L.novaSala({ codigo, anfitriaoToken, agora: Date.now() });
    this.sala.disponiveis = await contar(this.env.DB, this.sala.config);
    await this.guardar();
    await this.agendar();
    return { ok: true };
  }

  async info() {
    if (!this.sala) return { existe: false };
    const ativos = this.sala.jogadores.filter((j) => !j.saiu && !j.espectador).length;
    return { existe: true, jogadores: ativos, cheia: ativos >= REGRAS.maxJogadores, fase: this.sala.fase };
  }

  // --- WebSockets ---

  async fetch() {
    const [cliente, servidor] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(servidor);
    servidor.serializeAttachment({ jogadorId: null });
    if (!this.sala) {
      this.enviar(servidor, { t: 'erro', msg: 'Esta sala não existe ou já expirou.', fatal: true });
      servidor.close(4004, 'sala inexistente');
    }
    return new Response(null, { status: 101, webSocket: cliente });
  }

  async webSocketMessage(ws, mensagem) {
    if (!this.sala || typeof mensagem !== 'string' || mensagem.length > 2000) return;
    let msg;
    try {
      msg = JSON.parse(mensagem);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const id = ws.deserializeAttachment()?.jogadorId ?? null;
    const sala = this.sala;

    if (msg.t === 'entrar') {
      const r = L.entrar(sala, { token: msg.token, nome: msg.nome }, this.contexto());
      if (r.erro) {
        this.enviar(ws, { t: 'erro', msg: r.erro, fatal: true });
        ws.close(4003, 'recusado');
        return;
      }
      ws.serializeAttachment({ jogadorId: r.jogador.id });
      this.enviar(ws, { t: 'bemvindo', eu: r.jogador.id, versao: await lerVersao(this.env.DB) });
      L.avancar(sala, this.contexto());
      await this.publicar();
      return;
    }
    if (!id) return;

    if (msg.t === 'comecar') return this.comecar(ws, id);

    // As perguntas validam-se com o catálogo (que clubes tem cada país).
    const jogo = ['pergunta', 'livre', 'responder_livre', 'palpite', 'carta'].includes(msg.t);
    const ctx = this.contexto(jogo ? await catalogoPreparado(this.env.DB) : null);
    let mudou = L.avancar(sala, ctx);
    let r = null;
    switch (msg.t) {
      case 'pergunta':
        r = partida.perguntar(sala, id, { vez: msg.vez, chave: msg.chave }, ctx);
        break;
      case 'livre':
        r = partida.perguntaLivre(sala, id, { vez: msg.vez, texto: msg.texto }, ctx);
        break;
      case 'responder_livre':
        r = partida.responderLivre(sala, id, { resposta: msg.resposta }, ctx);
        break;
      case 'palpite':
        r = partida.palpitar(sala, id, { vez: msg.vez, ficha: msg.ficha, jogador: msg.jogador, nome: msg.nome }, ctx);
        break;
      case 'lance':
        r = partida.lance(sala, id, { valor: msg.valor }, ctx);
        break;
      case 'carta':
        r = partida.escolherCarta(sala, id, msg.jogador, ctx);
        break;
      case 'sair':
        r = { ok: L.sair(sala, id, ctx) };
        break;
      case 'config':
        r = L.configurar(sala, id, msg);
        if (!r.erro) sala.disponiveis = await contar(this.env.DB, sala.config, sala.usados);
        break;
      case 'novo_jogo':
        r = L.novoJogo(sala, id);
        if (!r.erro) {
          await this.limparRegistos();
          sala.disponiveis = await contar(this.env.DB, sala.config, sala.usados);
        }
        break;
      case 'repor':
        r = L.reporUsados(sala, id);
        if (!r.erro) sala.disponiveis = await contar(this.env.DB, sala.config, sala.usados);
        break;
      default:
        return;
    }
    // Uma ação de uma vez que já passou não é um erro a mostrar: o cliente só precisa do estado atual.
    if (r?.erro && !r.antiga) this.enviar(ws, { t: 'erro', msg: r.erro });
    if (r?.r) this.enviar(ws, { t: 'resposta', r: r.r });
    mudou = mudou || !r?.erro || Boolean(r?.antiga);
    if (mudou) await this.publicar();
  }

  /** Sorteia os jogadores secretos no D1, guarda-os e começa. */
  async comecar(ws, id) {
    const sala = this.sala;
    if (id !== sala.anfitriao) return this.enviar(ws, { t: 'erro', msg: 'Só o anfitrião pode começar.' });
    if (this.aSortear || sala.fase !== 'lobby') return;
    this.aSortear = true;
    try {
      const regs = await sortear(this.env.DB, sala.config, sala.usados, L.quantosSortear(sala));
      await this.guardarRegistos(regs);
      const r = L.comecar(sala, id, this.contexto(), regs.map((x) => x.id));
      if (r.erro) {
        this.enviar(ws, { t: 'erro', msg: r.erro });
        await this.limparRegistos();
        return;
      }
      await this.publicar();
    } finally {
      this.aSortear = false;
    }
  }

  /** Quem entrou a meio precisa de jogador (ou de cartas): sorteia mais para a reserva. */
  async reporReserva() {
    const falta = this.sala ? partida.faltamNaReserva(this.sala) : 0;
    if (!falta || this.aSortear) return;
    this.aSortear = true;
    try {
      const sala = this.sala;
      const regs = await sortear(this.env.DB, sala.config, [...sala.usados], falta);
      if (!regs.length) return;
      await this.guardarRegistos(regs);
      if (L.acrescentarReserva(sala, regs.map((x) => x.id), this.contexto())) await this.publicar(false);
    } finally {
      this.aSortear = false;
    }
  }

  async guardarRegistos(regs) {
    for (const r of regs) this.registos.set(r.id, r);
    for (let i = 0; i < regs.length; i += 100) {
      await this.ctx.storage.put(Object.fromEntries(regs.slice(i, i + 100).map((r) => [PREFIXO + r.id, r])));
    }
  }

  /** Apaga os registos de que a sala já não precisa (todos, no lobby). */
  async limparRegistos() {
    const usar = L.registosEmUso(this.sala);
    const apagar = [...this.registos.keys()].filter((id) => !usar.has(id));
    for (const id of apagar) this.registos.delete(id);
    for (let i = 0; i < apagar.length; i += 100) await this.ctx.storage.delete(apagar.slice(i, i + 100).map((id) => PREFIXO + id));
  }

  async webSocketClose(ws) {
    await this.saiu(ws);
  }

  async webSocketError(ws) {
    await this.saiu(ws);
  }

  async saiu(ws) {
    const id = ws.deserializeAttachment()?.jogadorId;
    if (!id || !this.sala) return;
    const outros = this.ctx.getWebSockets().filter((w) => w !== ws && w.deserializeAttachment()?.jogadorId === id);
    if (outros.length) return; // ainda tem outro separador aberto
    if (L.desligar(this.sala, id, this.contexto())) await this.publicar();
  }

  // --- Alarmes ---

  async alarm() {
    if (!this.sala) return;
    const agora = Date.now();
    if (L.deveLimpar(this.sala, agora)) {
      await this.ctx.storage.deleteAll();
      this.sala = null;
      this.registos.clear();
      return;
    }
    if (L.avancar(this.sala, this.contexto())) await this.publicar();
    else await this.agendar();
  }

  // --- utilitários ---

  async publicar(repor = true) {
    await this.guardar();
    this.difundir();
    await this.agendar();
    if (repor) await this.reporReserva();
  }

  async guardar() {
    await this.ctx.storage.put('sala', this.sala);
  }

  async agendar() {
    const prazo = this.sala ? L.proximoPrazo(this.sala) : null;
    if (prazo == null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const quando = Math.max(prazo, Date.now() + 50);
    if ((await this.ctx.storage.getAlarm()) !== quando) await this.ctx.storage.setAlarm(quando);
  }

  /** Cada socket recebe o estado público e a sua parte privada (dossier, cartas). */
  difundir() {
    const publico = JSON.stringify(estadoPublico(this.sala, Date.now()));
    for (const ws of this.ctx.getWebSockets()) {
      const id = ws.deserializeAttachment()?.jogadorId;
      if (!id) continue;
      try {
        ws.send(`{"t":"estado","sala":${publico},"eu":${JSON.stringify(privado(this.sala, id, this.registos))}}`);
      } catch {
        // socket a fechar; o webSocketClose trata do resto
      }
    }
  }

  enviar(ws, dados) {
    try {
      ws.send(JSON.stringify({ agora: Date.now(), ...dados }));
    } catch {
      // ignorado
    }
  }
}
