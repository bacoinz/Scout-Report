// Ligação WebSocket à sala: reconecta sozinha e mantém o desvio do relógio do servidor.

export class Ligacao {
  /**
   * @param {object} o
   * @param {string} o.codigo
   * @param {() => {token: string, nome: string}} o.identidade
   * @param {(msg: object) => void} o.aoMensagem
   * @param {(ligado: boolean) => void} o.aoEstado
   */
  constructor({ codigo, identidade, aoMensagem, aoEstado }) {
    this.codigo = codigo;
    this.identidade = identidade;
    this.aoMensagem = aoMensagem;
    this.aoEstado = aoEstado;
    this.desvio = 0;
    this.tentativas = 0;
    this.fechada = false;
    this.ws = null;
    this.ping = null;
  }

  ligar() {
    if (this.fechada) return;
    const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocolo}//${location.host}/ws/${this.codigo}`);
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.tentativas = 0;
      this.enviar({ t: 'entrar', ...this.identidade() });
      this.aoEstado(true);
      clearInterval(this.ping);
      this.ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), 25_000);
    });
    ws.addEventListener('message', (ev) => {
      if (ev.data === 'pong') return;
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const agora = msg.agora ?? msg.sala?.agora;
      if (typeof agora === 'number') this.desvio = agora - Date.now();
      if (msg.t === 'erro' && msg.fatal) this.fechada = true;
      this.aoMensagem(msg);
    });
    ws.addEventListener('close', () => {
      clearInterval(this.ping);
      if (this.ws !== ws || this.fechada) return;
      this.aoEstado(false);
      const espera = Math.min(5000, 400 * 2 ** this.tentativas++);
      setTimeout(() => this.ligar(), espera);
    });
  }

  enviar(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  /** Hora do servidor, estimada. */
  agora() {
    return Date.now() + this.desvio;
  }

  fechar() {
    this.fechada = true;
    clearInterval(this.ping);
    this.ws?.close();
  }
}
