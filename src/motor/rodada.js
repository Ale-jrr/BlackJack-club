// Máquina de estados de uma rodada de Blackjack.
//
// Regra da casa: este módulo não toca em DOM, timer nem armazenamento. Recebe
// um estado, devolve o mesmo estado mutado, e é o único lugar que decide
// cartas, saldo e resultado. A interface só pergunta `acoesDisponiveis` e
// manda `executar`.

import { comprar, criarShoe, precisaEmbaralhar, reembaralhar } from './baralho.js';
import { ehBlackjack, estourou, mesmoValor, valorDaMao } from './mao.js';
import {
  ACOES, ESTADOS, MAX_MAOS, PAGAMENTO_BLACKJACK, PAGAMENTO_SEGURO, STATUS_MAO,
} from './regras.js';

function novaMao(aposta) {
  return {
    cartas: [],
    aposta,
    status: STATUS_MAO.PLAYING,
    dobrada: false,
    deSplit: false,
    deSplitDeAses: false,
    resultado: null,   // WIN | LOSE | PUSH
    pagamento: 0,      // fichas devolvidas (aposta + lucro)
  };
}

export function criarJogo({ shoe = criarShoe(), saldo = 0, mesa = null } = {}) {
  return {
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

function darCarta(jogo, destino) {
  const c = comprar(jogo.shoe);
  destino.push(c);
  return c;
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

  darCarta(jogo, mao.cartas);
  darCarta(jogo, jogo.dealer.cartas);
  darCarta(jogo, mao.cartas);
  darCarta(jogo, jogo.dealer.cartas);
  emitir(jogo, 'distribuiu');

  jogo.estado = ESTADOS.TURNO_JOGADOR;

  const aberta = jogo.dealer.cartas[0];
  if (aberta.valor === 'A' && jogo.apostaBase >= 2 && jogo.saldo >= 1) {
    jogo.seguro.disponivel = true;
    emitir(jogo, 'seguro-oferecido');
    return jogo;              // espera a decisão de seguro antes de espiar
  }

  if (espiarDealer(jogo)) return jogo;
  if (ehBlackjack(mao.cartas)) {
    mao.status = STATUS_MAO.BLACKJACK;
    return encerrar(jogo);
  }
  return jogo;
}

// Verifica a carta escondida quando a aberta é Ás ou vale 10 (§20).
function espiarDealer(jogo) {
  const aberta = jogo.dealer.cartas[0];
  const vale10ouAs = aberta.valor === 'A' || ['10', 'J', 'Q', 'K'].includes(aberta.valor);
  if (!vale10ouAs) return false;
  if (!ehBlackjack(jogo.dealer.cartas)) return false;

  jogo.dealer.revelado = true;
  emitir(jogo, 'dealer-blackjack');
  for (const m of jogo.maos) {
    if (m.status === STATUS_MAO.PLAYING) {
      m.status = ehBlackjack(m.cartas) ? STATUS_MAO.BLACKJACK : STATUS_MAO.STAND;
    }
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

  const mao = maoAtiva(jogo);
  if (!mao || mao.status !== STATUS_MAO.PLAYING) return [];

  const lista = [ACOES.PEDIR, ACOES.PARAR];
  const inicial = mao.cartas.length === 2;
  const temSaldo = jogo.saldo >= mao.aposta;

  if (inicial && !mao.deSplitDeAses && temSaldo) lista.push(ACOES.DOBRAR);

  if (inicial && !mao.deSplitDeAses && temSaldo && jogo.maos.length < MAX_MAOS
      && mesmoValor(mao.cartas[0], mao.cartas[1])) {
    lista.push(ACOES.DIVIDIR);
  }

  if (inicial && !mao.deSplit && jogo.maos.length === 1) lista.push(ACOES.DESISTIR);

  return lista;
}

export function executar(jogo, acao, dados = {}) {
  if (!acoesDisponiveis(jogo).includes(acao)) throw new Error(`Ação indisponível: ${acao}`);
  switch (acao) {
    case ACOES.SEGURO: return fazerSeguro(jogo, dados.valor);
    case ACOES.RECUSAR_SEGURO: return recusarSeguro(jogo);
    case ACOES.PEDIR: return pedir(jogo);
    case ACOES.PARAR: return parar(jogo);
    case ACOES.DOBRAR: return dobrar(jogo);
    case ACOES.DIVIDIR: return dividir(jogo);
    case ACOES.DESISTIR: return desistir(jogo);
    default: throw new Error(`Ação desconhecida: ${acao}`);
  }
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
  const mao = jogo.maos[0];
  if (ehBlackjack(mao.cartas)) {
    mao.status = STATUS_MAO.BLACKJACK;
    return encerrar(jogo);
  }
  return jogo;
}

function pedir(jogo) {
  const mao = maoAtiva(jogo);
  const c = darCarta(jogo, mao.cartas);
  emitir(jogo, 'carta-jogador', { mao: jogo.maoAtual, carta: c });

  if (estourou(mao.cartas)) {
    mao.status = STATUS_MAO.BUST;
    emitir(jogo, 'bust', { mao: jogo.maoAtual });
    return proximaMao(jogo);
  }
  if (valorDaMao(mao.cartas).total === 21) {
    mao.status = STATUS_MAO.STAND;   // 21 encerra a mão automaticamente (§12)
    return proximaMao(jogo);
  }
  return jogo;
}

function parar(jogo) {
  maoAtiva(jogo).status = STATUS_MAO.STAND;
  return proximaMao(jogo);
}

function dobrar(jogo) {
  const mao = maoAtiva(jogo);
  jogo.saldo -= mao.aposta;
  mao.aposta *= 2;
  mao.dobrada = true;
  const c = darCarta(jogo, mao.cartas);
  emitir(jogo, 'dobrou', { mao: jogo.maoAtual, carta: c });
  mao.status = estourou(mao.cartas) ? STATUS_MAO.BUST : STATUS_MAO.STAND;
  if (mao.status === STATUS_MAO.BUST) emitir(jogo, 'bust', { mao: jogo.maoAtual });
  return proximaMao(jogo);
}

function dividir(jogo) {
  const mao = maoAtiva(jogo);
  const deAses = mao.cartas[0].valor === 'A';

  const nova = novaMao(mao.aposta);
  jogo.saldo -= mao.aposta;
  nova.cartas.push(mao.cartas.pop());
  nova.deSplit = true;
  mao.deSplit = true;
  nova.deSplitDeAses = deAses;
  mao.deSplitDeAses = deAses;

  jogo.maos.splice(jogo.maoAtual + 1, 0, nova);
  emitir(jogo, 'dividiu', { mao: jogo.maoAtual });

  darCarta(jogo, mao.cartas);
  darCarta(jogo, nova.cartas);

  if (deAses) {
    // Cada Ás recebe uma carta só; 21 aqui não é Blackjack natural (§16).
    mao.status = STATUS_MAO.STAND;
    nova.status = STATUS_MAO.STAND;
    return proximaMao(jogo);
  }
  if (valorDaMao(mao.cartas).total === 21) {
    mao.status = STATUS_MAO.STAND;
    return proximaMao(jogo);
  }
  return jogo;
}

function desistir(jogo) {
  const mao = maoAtiva(jogo);
  mao.status = STATUS_MAO.SURRENDER;
  emitir(jogo, 'desistiu');
  return proximaMao(jogo);
}

function proximaMao(jogo) {
  while (jogo.maoAtual < jogo.maos.length
         && jogo.maos[jogo.maoAtual].status !== STATUS_MAO.PLAYING) {
    jogo.maoAtual++;
  }
  if (jogo.maoAtual < jogo.maos.length) {
    emitir(jogo, 'troca-mao', { mao: jogo.maoAtual });
    return jogo;
  }
  jogo.maoAtual = jogo.maos.length - 1;
  return turnoDealer(jogo);
}

// ------------------------------------------------------------------ dealer

function precisaDoDealer(jogo) {
  return jogo.maos.some((m) => m.status === STATUS_MAO.STAND);
}

function turnoDealer(jogo) {
  jogo.estado = ESTADOS.TURNO_DEALER;
  jogo.dealer.revelado = true;
  emitir(jogo, 'revela-dealer');

  if (precisaDoDealer(jogo)) {
    // Compra com 16 ou menos; para em 17, inclusive Soft 17 (§19).
    while (valorDaMao(jogo.dealer.cartas).total < 17) {
      const c = darCarta(jogo, jogo.dealer.cartas);
      emitir(jogo, 'carta-dealer', { carta: c });
    }
  }
  return encerrar(jogo);
}

// -------------------------------------------------------------- resultado

function encerrar(jogo) {
  jogo.estado = ESTADOS.CALCULANDO_RESULTADO;
  const apostado = apostaTotalNaMesa(jogo);
  const dealer = valorDaMao(jogo.dealer.cartas);
  const dealerBJ = ehBlackjack(jogo.dealer.cartas);
  const dealerEstourou = dealer.total > 21;

  if (jogo.seguro.valor > 0 && dealerBJ) {
    jogo.seguro.pago = jogo.seguro.valor * (1 + PAGAMENTO_SEGURO);
    jogo.saldo += jogo.seguro.pago;
  }

  let devolvido = jogo.seguro.pago;

  for (const mao of jogo.maos) {
    const jogador = valorDaMao(mao.cartas);
    const jogadorBJ = mao.status === STATUS_MAO.BLACKJACK;

    if (mao.status === STATUS_MAO.SURRENDER) {
      mao.resultado = STATUS_MAO.LOSE;
      mao.pagamento = Math.floor(mao.aposta / 2);
    } else if (mao.status === STATUS_MAO.BUST) {
      mao.resultado = STATUS_MAO.LOSE;
      mao.pagamento = 0;
    } else if (jogadorBJ && dealerBJ) {
      mao.resultado = STATUS_MAO.PUSH;
      mao.pagamento = mao.aposta;
    } else if (jogadorBJ) {
      mao.resultado = STATUS_MAO.WIN;
      mao.pagamento = Math.round(mao.aposta * (1 + PAGAMENTO_BLACKJACK));
    } else if (dealerBJ) {
      mao.resultado = STATUS_MAO.LOSE;
      mao.pagamento = 0;
    } else if (dealerEstourou || jogador.total > dealer.total) {
      mao.resultado = STATUS_MAO.WIN;
      mao.pagamento = mao.aposta * 2;
    } else if (jogador.total === dealer.total) {
      mao.resultado = STATUS_MAO.PUSH;
      mao.pagamento = mao.aposta;
    } else {
      mao.resultado = STATUS_MAO.LOSE;
      mao.pagamento = 0;
    }

    jogo.saldo += mao.pagamento;
    devolvido += mao.pagamento;
  }

  jogo.resultado = {
    numero: jogo.numeroRodada,
    apostado,
    devolvido,
    lucro: devolvido - apostado,
    dealer: dealer.total,
    dealerBlackjack: dealerBJ,
    dealerEstourou,
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
