// Regras e constantes do BlackJack Club. Todo número de regra mora aqui —
// nada de repetir 3:2 ou "6 baralhos" espalhado pelo código.

export const NUM_BARALHOS = 6;
export const PENETRACAO = 0.75;       // embaralha novo shoe com ~75% das cartas usadas
export const SALDO_INICIAL = 10000;
export const MAX_MAOS = 4;            // máximo de mãos simultâneas por Split
export const PAGAMENTO_BLACKJACK = 1.5; // 3:2 sobre a aposta
export const PAGAMENTO_SEGURO = 2;      // 2:1 sobre o valor do seguro

export const BONUS_RECUPERACAO = { valor: 2000, intervaloMs: 10 * 60 * 1000 };

export const FICHAS_RAPIDAS = [50, 100, 500, 1000, 5000, 10000];

export const MESAS = [
  { id: 'iniciante',  nome: 'Iniciante',   min: 50,    max: 500,    nivel: 1 },
  { id: 'bronze',     nome: 'Bronze',      min: 100,   max: 1000,   nivel: 3 },
  { id: 'prata',      nome: 'Prata',       min: 500,   max: 5000,   nivel: 8 },
  { id: 'ouro',       nome: 'Ouro',        min: 1000,  max: 10000,  nivel: 15 },
  { id: 'diamante',   nome: 'Diamante',    min: 5000,  max: 50000,  nivel: 25 },
  { id: 'highroller', nome: 'High Roller', min: 10000, max: 250000, nivel: 40 },
];

export const ESTADOS = Object.freeze({
  AGUARDANDO_APOSTA: 'AGUARDANDO_APOSTA',
  DISTRIBUINDO: 'DISTRIBUINDO',
  TURNO_JOGADOR: 'TURNO_JOGADOR',
  TURNO_DEALER: 'TURNO_DEALER',
  CALCULANDO_RESULTADO: 'CALCULANDO_RESULTADO',
  RESULTADO: 'RESULTADO',
  FINALIZADA: 'FINALIZADA',
});

export const STATUS_MAO = Object.freeze({
  PLAYING: 'PLAYING',
  STAND: 'STAND',
  BLACKJACK: 'BLACKJACK',
  BUST: 'BUST',
  SURRENDER: 'SURRENDER',
  WIN: 'WIN',
  LOSE: 'LOSE',
  PUSH: 'PUSH',
});

export const ACOES = Object.freeze({
  PEDIR: 'PEDIR',
  PARAR: 'PARAR',
  DOBRAR: 'DOBRAR',
  DIVIDIR: 'DIVIDIR',
  DESISTIR: 'DESISTIR',
  SEGURO: 'SEGURO',
  RECUSAR_SEGURO: 'RECUSAR_SEGURO',
});
