// Constantes do jogo (tempos, limites, opções do lobby). Os pontos estão em partilhado/perguntas.json.

export const REGRAS = {
  maxJogadores: 8,
  maxEspectadores: 6,
  nomeMax: 16,
  /** Resumo da pergunta livre, escrito por quem pergunta. */
  livreMax: 60,
  /** Nome do jogador num palpite (só para mostrar; o servidor compara o id). */
  palpiteNomeMax: 60,
  feedMax: 80,
  anfitriaoAusenteMs: 20_000,
  limpezaSalaVaziaMs: 2 * 60 * 60 * 1000,
  /** Modo Escolha: tempo para escolher uma das cartas no início (depois, ao calhas). */
  escolhaMs: 30_000,
  cartas: 3,
  /** O dono responde à pergunta livre neste tempo; o relógio da vez fica parado. */
  livreMs: 30_000,
  /** Quem perguntou recupera a vez com pelo menos isto (pergunta livre cancelada, SEM REGISTO). */
  vezMinimaMs: 15_000,
  /** O carimbo IDENTIFICADO fica no ecrã antes da vez seguinte. */
  identificadoMs: 4_000,
  /** A vez de quem está desligado há tanto tempo salta. */
  desligadoSaltaMs: 10_000,
  /** Desligado há mais do que isto conta como ter saído da sala. */
  saidaDefinitivaMs: 5 * 60_000,
  /** Registos a mais na reserva da sala (para quem entra a meio). */
  folgaReserva: 4,
  /** Ronda Joker: o anúncio (a carta e o título), o tempo para os palpites e a revelação. */
  jokerAnuncioMs: 3_300,
  jokerMs: 15_000,
  jokerRevelacaoMs: 7_000,
  /** Cada vez dura 1 minuto. A partida não tem limite de rondas: acaba quando todos forem identificados. */
  vezMs: 60_000,
  /** Opções do lobby. */
  modos: ['aleatorio', 'escolha'],
  grupos: ['conhecidos', 'todos'],
  porOmissao: { modo: 'aleatorio', jogadores: 'conhecidos' },
};

// O roxo é a cor de destaque do jogo: na paleta dos jogadores fica um verde-água no lugar dele.
export const PALETA = ['#EF4444', '#22D3EE', '#FACC15', '#F472B6', '#A3E635', '#F97316', '#14B8A6', '#3B82F6', '#F5F5F4', '#D6A46B'];

/** Alfabeto dos códigos de sala: sem I nem O para não confundir com 1 e 0. */
export const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
