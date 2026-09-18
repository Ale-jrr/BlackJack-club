// Um assento na mesa: as mãos de UM jogador e o que ele pode fazer com elas.
//
// Existe porque a carreira e a sala online precisam obedecer exatamente as
// mesmas regras de mão. Duplicar "dobrar dá uma carta só" em dois lugares é o
// jeito garantido de a regra divergir em silêncio — quem muda regra de mão
// muda aqui, e os dois modos mudam juntos.
//
// Um assento é `{ maos, maoAtual, fichas }`. Quem cuida de shoe, dealer e
// estado da rodada é quem chama.

import { comprar } from './baralho.js';
import { ehBlackjack, estourou, mesmoValor, valorDaMao } from './mao.js';
import { ACOES, MAX_MAOS, PAGAMENTO_BLACKJACK, STATUS_MAO } from './regras.js';

export function novaMao(aposta) {
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

export function novoAssento(aposta) {
  return { maos: [novaMao(aposta)], maoAtual: 0, fichas: 0 };
}

export function maoAtiva(assento) {
  return assento.maos[assento.maoAtual] ?? null;
}

export function terminou(assento) {
  return assento.maos.every((m) => m.status !== STATUS_MAO.PLAYING);
}

// `permiteDesistir` é falso na sala quando o ADM desliga a desistência.
export function acoesDaMao(assento, { permiteDesistir = true, maxMaos = MAX_MAOS } = {}) {
  const mao = maoAtiva(assento);
  if (!mao || mao.status !== STATUS_MAO.PLAYING) return [];

  const lista = [ACOES.PEDIR, ACOES.PARAR];
  const inicial = mao.cartas.length === 2;
  const temFichas = assento.fichas >= mao.aposta;

  if (inicial && !mao.deSplitDeAses && temFichas) lista.push(ACOES.DOBRAR);

  if (inicial && !mao.deSplitDeAses && temFichas && assento.maos.length < maxMaos
      && mesmoValor(mao.cartas[0], mao.cartas[1])) {
    lista.push(ACOES.DIVIDIR);
  }

  if (permiteDesistir && inicial && !mao.deSplit && assento.maos.length === 1) {
    lista.push(ACOES.DESISTIR);
  }

  return lista;
}

// Cada ação devolve o que aconteceu, para quem chama animar ou registrar.
// Nenhuma delas avança de mão sozinha: isso é `avancarMao`.

export function pedir(assento, shoe) {
  const mao = maoAtiva(assento);
  const carta = comprar(shoe);
  mao.cartas.push(carta);

  if (estourou(mao.cartas)) {
    mao.status = STATUS_MAO.BUST;
    return { carta, fim: 'BUST' };
  }
  if (valorDaMao(mao.cartas).total === 21) {
    mao.status = STATUS_MAO.STAND;   // 21 encerra a mão automaticamente (§12)
    return { carta, fim: 'VINTE_UM' };
  }
  return { carta, fim: null };
}

export function parar(assento) {
  maoAtiva(assento).status = STATUS_MAO.STAND;
  return { fim: 'STAND' };
}

export function dobrar(assento, shoe) {
  const mao = maoAtiva(assento);
  assento.fichas -= mao.aposta;
  mao.aposta *= 2;
  mao.dobrada = true;
  const carta = comprar(shoe);
  mao.cartas.push(carta);
  mao.status = estourou(mao.cartas) ? STATUS_MAO.BUST : STATUS_MAO.STAND;
  return { carta, fim: mao.status === STATUS_MAO.BUST ? 'BUST' : 'STAND' };
}

export function dividir(assento, shoe) {
  const mao = maoAtiva(assento);
  const deAses = mao.cartas[0].valor === 'A';

  const nova = novaMao(mao.aposta);
  assento.fichas -= mao.aposta;
  nova.cartas.push(mao.cartas.pop());
  mao.deSplit = true;
  nova.deSplit = true;
  mao.deSplitDeAses = deAses;
  nova.deSplitDeAses = deAses;

  assento.maos.splice(assento.maoAtual + 1, 0, nova);
  mao.cartas.push(comprar(shoe));
  nova.cartas.push(comprar(shoe));

  if (deAses) {
    // Cada Ás recebe uma carta só; 21 aqui não é Blackjack natural (§16).
    mao.status = STATUS_MAO.STAND;
    nova.status = STATUS_MAO.STAND;
    return { fim: 'STAND' };
  }
  if (valorDaMao(mao.cartas).total === 21) {
    mao.status = STATUS_MAO.STAND;
    return { fim: 'VINTE_UM' };
  }
  return { fim: null };
}

export function desistir(assento) {
  maoAtiva(assento).status = STATUS_MAO.SURRENDER;
  return { fim: 'SURRENDER' };
}

export function executarNoAssento(assento, acao, shoe) {
  switch (acao) {
    case ACOES.PEDIR: return pedir(assento, shoe);
    case ACOES.PARAR: return parar(assento);
    case ACOES.DOBRAR: return dobrar(assento, shoe);
    case ACOES.DIVIDIR: return dividir(assento, shoe);
    case ACOES.DESISTIR: return desistir(assento);
    default: throw new Error(`Ação desconhecida: ${acao}`);
  }
}

// Anda até a próxima mão que ainda joga. Devolve true se sobrou alguma.
export function avancarMao(assento) {
  while (assento.maoAtual < assento.maos.length
         && assento.maos[assento.maoAtual].status !== STATUS_MAO.PLAYING) {
    assento.maoAtual++;
  }
  if (assento.maoAtual < assento.maos.length) return true;
  assento.maoAtual = Math.max(0, assento.maos.length - 1);
  return false;
}

// Marca como Blackjack as mãos de duas cartas que somam 21.
export function marcarBlackjack(assento) {
  for (const mao of assento.maos) {
    if (mao.status === STATUS_MAO.PLAYING && !mao.deSplit && ehBlackjack(mao.cartas)) {
      mao.status = STATUS_MAO.BLACKJACK;
    }
  }
}

export function temBlackjackNatural(assento) {
  return assento.maos.some((m) => m.status === STATUS_MAO.BLACKJACK);
}

// Fecha uma mão contra a mão do dealer. `dealer` é
// `{ total, blackjack, estourou }`.
export function resolverMao(mao, dealer) {
  const jogador = valorDaMao(mao.cartas).total;
  const jogadorBJ = mao.status === STATUS_MAO.BLACKJACK;

  if (mao.status === STATUS_MAO.SURRENDER) {
    mao.resultado = STATUS_MAO.LOSE;
    mao.pagamento = Math.floor(mao.aposta / 2);
  } else if (mao.status === STATUS_MAO.BUST) {
    mao.resultado = STATUS_MAO.LOSE;
    mao.pagamento = 0;
  } else if (jogadorBJ && dealer.blackjack) {
    mao.resultado = STATUS_MAO.PUSH;
    mao.pagamento = mao.aposta;
  } else if (jogadorBJ) {
    mao.resultado = STATUS_MAO.WIN;
    mao.pagamento = Math.round(mao.aposta * (1 + PAGAMENTO_BLACKJACK));
  } else if (dealer.blackjack) {
    mao.resultado = STATUS_MAO.LOSE;
    mao.pagamento = 0;
  } else if (dealer.estourou || jogador > dealer.total) {
    mao.resultado = STATUS_MAO.WIN;
    mao.pagamento = mao.aposta * 2;
  } else if (jogador === dealer.total) {
    mao.resultado = STATUS_MAO.PUSH;
    mao.pagamento = mao.aposta;
  } else {
    mao.resultado = STATUS_MAO.LOSE;
    mao.pagamento = 0;
  }
  return mao;
}

// Fecha o assento inteiro e devolve quanto volta para as fichas dele.
export function resolverAssento(assento, dealer) {
  let devolvido = 0;
  for (const mao of assento.maos) {
    resolverMao(mao, dealer);
    devolvido += mao.pagamento;
  }
  assento.fichas += devolvido;
  return devolvido;
}

// O dealer desta casa joga para ganhar (decisão do Mayk, contra a regra fixa de
// cassino). Com 16 ou menos ele pede, como sempre. Com 17 ou mais ele olha a mesa
// e faz a conta: quanto a casa leva se parar agora, contra quanto espera levar se
// pedir — pesando o total e a aposta de cada mão parada. Só pede se for vantagem.
//
// As chances são as do baralho "infinito" (1/13 por valor, 4/13 para o dez): o
// dealer não espia o shoe, senão saberia a próxima carta. Blackjack, estouro e
// desistência dos jogadores já estão decididos e não entram na conta.
const CHANCE_DAS_CARTAS = [
  [2, 1 / 13], [3, 1 / 13], [4, 1 / 13], [5, 1 / 13], [6, 1 / 13], [7, 1 / 13],
  [8, 1 / 13], [9, 1 / 13], [10, 4 / 13], [11, 1 / 13],   // 11 é o Ás
];

// Quanto a casa ganha (positivo) ou perde (negativo) parando com `total`.
function saldoDaCasaParando(total, maos) {
  let saldo = 0;
  for (const { total: t, aposta } of maos) {
    if (total > 21 || total < t) saldo -= aposta;
    else if (total > t) saldo += aposta;
  }
  return saldo;
}

// Melhor resultado esperado para a casa a partir de (total, macia), escolhendo
// parar ou pedir em cada passo. `memoria` evita refazer a mesma conta.
function melhorParaCasa(total, macia, maos, memoria) {
  if (total > 21) return saldoDaCasaParando(total, maos);
  const chave = `${total}${macia ? 'm' : ''}`;
  if (memoria.has(chave)) return memoria.get(chave);
  // A conta obedece a mesma regra da mesa: com 16 ou menos, parar não é opção.
  const parando = total < 17 ? -Infinity : saldoDaCasaParando(total, maos);
  const pedindo = total >= 21 ? -Infinity : esperadoPedindo(total, macia, maos, memoria);
  const melhor = Math.max(parando, pedindo);
  memoria.set(chave, melhor);
  return melhor;
}

function esperadoPedindo(total, macia, maos, memoria) {
  let esperado = 0;
  for (const [valor, chance] of CHANCE_DAS_CARTAS) {
    let t = total + valor;
    let m = macia || valor === 11;
    if (t > 21 && m) { t -= 10; m = valor === 11 && macia; }
    esperado += chance * melhorParaCasa(t, m, maos, memoria);
  }
  return esperado;
}

export function dealerDevePedir(cartasDoDealer, assentos) {
  const { total, macia } = valorDaMao(cartasDoDealer);
  if (total >= 21) return false;
  if (total < 17) return true;

  const maos = [];
  for (const a of assentos) {
    for (const m of a.maos) {
      if (m.status === STATUS_MAO.STAND) maos.push({ total: valorDaMao(m.cartas).total, aposta: m.aposta });
    }
  }
  if (maos.length === 0) return false;

  const memoria = new Map();
  return esperadoPedindo(total, macia, maos, memoria) > saldoDaCasaParando(total, maos);
}

// O dealer só compra se alguém ainda pode ganhar dele.
export function precisaDoDealer(assentos) {
  return assentos.some((a) => a.maos.some((m) => m.status === STATUS_MAO.STAND));
}

export function resumoDoDealer(cartas) {
  const { total } = valorDaMao(cartas);
  return { total, blackjack: ehBlackjack(cartas), estourou: total > 21 };
}
