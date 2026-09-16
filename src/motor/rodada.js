// Uma rodada da carreira: um jogador contra o dealer.
//
// As regras de mão (pedir, dobrar, dividir, pagar) moram em `assento.js`, que
// a sala online também usa. Aqui fica só o que é próprio do modo solo: o
// estado da rodada, o seguro, o dealer e a fila de eventos para a tela.
//
// Regra da casa: este módulo não toca em DOM, timer nem armazenamento.

import { criarShoe, precisaEmbaralhar, reembaralhar, comprar } from './baralho.js';
import {
  acoesDaMao, avancarMao, executarNoAssento, marcarBlackjack, novaMao,
  precisaDoDealer, resolverAssento, resumoDoDealer, temBlackjackNatural,
} from './assento.js';
import { valorDaMao } from './mao.js';
import { ACOES, ESTADOS, PAGAMENTO_SEGURO, STATUS_MAO } from './regras.js';

export function criarJogo({ shoe = criarShoe(), saldo = 0, mesa = null } = {}) {
  const jogo = {
    estado: ESTADOS.AGUARDANDO_APOSTA,
    shoe,
    mesa,
    saldo,
    apostaBase: 0,
    ultimaAposta: 0,
    maos: [],
    maoAtual: 0,
    dealer: { cartas: [], revelado: false },
    seguro: { disponivel: false, valor: 0, pago: 0, decidido: false },
    resultado: null,
    numeroRodada: 0,
    eventos: [],   // fila para a interface animar; ela consome com `drenarEventos`
  };
  // `assento.js` fala em fichas; aqui o nome é saldo. O apelido deixa o jogo
  // ser usado como assento sem cópia nenhuma no meio.
  Object.defineProperty(jogo, 'fichas', {
    get() { return this.saldo; },
    set(v) { this.saldo = v; },
    enumerable: false,
  });
  return jogo;
}

function emitir(jogo, tipo, dados = {}) {
  jogo.eventos.push({ tipo, ...dados });
}

export function drenarEventos(jogo) {
  return jogo.eventos.splice(0, jogo.eventos.length);
}

function apostaTotalNaMesa(jogo) {
  return jogo.maos.reduce((t, m) => t + m.aposta, 0) + jogo.seguro.valor;
}

// ---------------------------------------------------------------- apostas

export function podeApostar(jogo, valor) {
  if (jogo.estado !== ESTADOS.AGUARDANDO_APOSTA) return false;
  if (!Number.isFinite(valor) || valor <= 0) return false;
  if (valor > jogo.saldo) return false;
  if (jogo.mesa && (valor < jogo.mesa.min || valor > jogo.mesa.max)) return false;
  return true;
}

export function apostar(jogo, valor) {
  if (!podeApostar(jogo, valor)) throw new Error('Aposta inválida');
  jogo.apostaBase = valor;
  jogo.saldo -= valor;
  jogo.ultimaAposta = valor;
  return jogo;
}

// ------------------------------------------------------------ distribuição

export function distribuir(jogo) {
  if (jogo.estado !== ESTADOS.AGUARDANDO_APOSTA) throw new Error('Rodada já começou');
  if (jogo.apostaBase <= 0) throw new Error('Sem aposta');

  if (precisaEmbaralhar(jogo.shoe)) {
    reembaralhar(jogo.shoe);
    emitir(jogo, 'embaralhou');
  }

  jogo.estado = ESTADOS.DISTRIBUINDO;
  jogo.numeroRodada++;
  jogo.resultado = null;
  jogo.dealer = { cartas: [], revelado: false };
  jogo.seguro = { disponivel: false, valor: 0, pago: 0, decidido: false };

  const mao = novaMao(jogo.apostaBase);
  jogo.maos = [mao];
  jogo.maoAtual = 0;

  mao.cartas.push(comprar(jogo.shoe));
  jogo.dealer.cartas.push(comprar(jogo.shoe));
  mao.cartas.push(comprar(jogo.shoe));
  jogo.dealer.cartas.push(comprar(jogo.shoe));
  emitir(jogo, 'distribuiu');

  jogo.estado = ESTADOS.TURNO_JOGADOR;

  const aberta = jogo.dealer.cartas[0];
  if (aberta.valor === 'A' && jogo.apostaBase >= 2 && jogo.saldo >= 1) {
    jogo.seguro.disponivel = true;
    emitir(jogo, 'seguro-oferecido');
    return jogo;              // espera a decisão de seguro antes de espiar
  }

  if (espiarDealer(jogo)) return jogo;
  marcarBlackjack(jogo);
  if (temBlackjackNatural(jogo)) return encerrar(jogo);
  return jogo;
}

// Verifica a carta escondida quando a aberta é Ás ou vale 10 (§20).
function espiarDealer(jogo) {
  const aberta = jogo.dealer.cartas[0];
  const vale10ouAs = aberta.valor === 'A' || ['10', 'J', 'Q', 'K'].includes(aberta.valor);
  if (!vale10ouAs) return false;
  if (!resumoDoDealer(jogo.dealer.cartas).blackjack) return false;

  jogo.dealer.revelado = true;
  emitir(jogo, 'dealer-blackjack');
  marcarBlackjack(jogo);
  for (const m of jogo.maos) {
    if (m.status === STATUS_MAO.PLAYING) m.status = STATUS_MAO.STAND;
  }
  encerrar(jogo);
  return true;
}

// ------------------------------------------------------------------ ações

export function maoAtiva(jogo) {
  return jogo.maos[jogo.maoAtual] ?? null;
}

export function acoesDisponiveis(jogo) {
  if (jogo.estado !== ESTADOS.TURNO_JOGADOR) return [];
  if (jogo.seguro.disponivel && !jogo.seguro.decidido) return [ACOES.SEGURO, ACOES.RECUSAR_SEGURO];
  return acoesDaMao(jogo);
}

export function executar(jogo, acao, dados = {}) {
  if (!acoesDisponiveis(jogo).includes(acao)) throw new Error(`Ação indisponível: ${acao}`);
  if (acao === ACOES.SEGURO) return fazerSeguro(jogo, dados.valor);
  if (acao === ACOES.RECUSAR_SEGURO) return recusarSeguro(jogo);

  const indice = jogo.maoAtual;
  if (acao === ACOES.DIVIDIR) emitir(jogo, 'dividiu', { mao: indice });

  const efeito = executarNoAssento(jogo, acao, jogo.shoe);

  if (acao === ACOES.PEDIR) emitir(jogo, 'carta-jogador', { mao: indice, carta: efeito.carta });
  if (acao === ACOES.DOBRAR) emitir(jogo, 'dobrou', { mao: indice, carta: efeito.carta });
  if (acao === ACOES.DESISTIR) emitir(jogo, 'desistiu');
  if (efeito.fim === 'BUST') emitir(jogo, 'bust', { mao: indice });

  return proximaMao(jogo);
}

export function seguroMaximo(jogo) {
  return Math.min(Math.floor(jogo.apostaBase / 2), jogo.saldo);
}

function fazerSeguro(jogo, valor) {
  const max = seguroMaximo(jogo);
  const v = Math.max(1, Math.min(Math.floor(valor ?? max), max));
  jogo.saldo -= v;
  jogo.seguro.valor = v;
  jogo.seguro.decidido = true;
  jogo.seguro.disponivel = false;
  emitir(jogo, 'seguro-feito', { valor: v });
  return depoisDoSeguro(jogo);
}

function recusarSeguro(jogo) {
  jogo.seguro.decidido = true;
  jogo.seguro.disponivel = false;
  return depoisDoSeguro(jogo);
}

function depoisDoSeguro(jogo) {
  if (espiarDealer(jogo)) return jogo;
  marcarBlackjack(jogo);
  if (temBlackjackNatural(jogo)) return encerrar(jogo);
  return jogo;
}

function proximaMao(jogo) {
  if (avancarMao(jogo)) {
    emitir(jogo, 'troca-mao', { mao: jogo.maoAtual });
    return jogo;
  }
  return turnoDealer(jogo);
}

// ------------------------------------------------------------------ dealer

function turnoDealer(jogo) {
  jogo.estado = ESTADOS.TURNO_DEALER;
  jogo.dealer.revelado = true;
  emitir(jogo, 'revela-dealer');

  if (precisaDoDealer([jogo])) {
    // Compra com 16 ou menos; para em 17, inclusive Soft 17 (§19).
    while (valorDaMao(jogo.dealer.cartas).total < 17) {
      const carta = comprar(jogo.shoe);
      jogo.dealer.cartas.push(carta);
      emitir(jogo, 'carta-dealer', { carta });
    }
  }
  return encerrar(jogo);
}

// -------------------------------------------------------------- resultado

function encerrar(jogo) {
  jogo.estado = ESTADOS.CALCULANDO_RESULTADO;
  const apostado = apostaTotalNaMesa(jogo);
  const dealer = resumoDoDealer(jogo.dealer.cartas);

  if (jogo.seguro.valor > 0 && dealer.blackjack) {
    jogo.seguro.pago = jogo.seguro.valor * (1 + PAGAMENTO_SEGURO);
    jogo.saldo += jogo.seguro.pago;
  }

  const devolvido = jogo.seguro.pago + resolverAssento(jogo, dealer);

  jogo.resultado = {
    numero: jogo.numeroRodada,
    apostado,
    devolvido,
    lucro: devolvido - apostado,
    dealer: dealer.total,
    dealerBlackjack: dealer.blackjack,
    dealerEstourou: dealer.estourou,
    dealerCartas: jogo.dealer.cartas.slice(),
    maos: jogo.maos.map((m) => ({
      cartas: m.cartas.slice(),
      aposta: m.aposta,
      valor: valorDaMao(m.cartas).total,
      status: m.status,
      resultado: m.resultado,
      pagamento: m.pagamento,
      dobrada: m.dobrada,
      deSplit: m.deSplit,
    })),
    seguro: { valor: jogo.seguro.valor, pago: jogo.seguro.pago },
  };

  jogo.estado = ESTADOS.RESULTADO;
  emitir(jogo, 'resultado', { resultado: jogo.resultado });
  return jogo;
}

export function novaRodada(jogo) {
  if (jogo.estado !== ESTADOS.RESULTADO) throw new Error('Rodada em andamento');
  jogo.estado = ESTADOS.AGUARDANDO_APOSTA;
  jogo.apostaBase = 0;
  jogo.maos = [];
  jogo.maoAtual = 0;
  jogo.dealer = { cartas: [], revelado: false };
  jogo.seguro = { disponivel: false, valor: 0, pago: 0, decidido: false };
  return jogo;
}
