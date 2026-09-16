// Testes do motor. Rodam no navegador porque esta máquina não tem Node.
// Abra testes/index.html pelo servidor (`py servidor.py`) e veja o relatório.

import { cartas, criarShoe, criarShoeFixo, restantes, rngSemeado } from '../src/motor/baralho.js';
import { ehBlackjack, textoValor, valorDaMao } from '../src/motor/mao.js';
import { ACOES, ESTADOS, STATUS_MAO } from '../src/motor/regras.js';
import {
  acoesDisponiveis, apostar, criarJogo, distribuir, executar, novaRodada,
} from '../src/motor/rodada.js';
import { resumoDaRodada } from '../src/dados/perfil.js';
import { xpDaRodada, xpDoNivel } from '../src/dados/progressao.js';

const casos = [];
export function teste(nome, fn) { casos.push({ nome, fn }); }

function igual(obtido, esperado, oque = '') {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a !== b) throw new Error(`${oque || 'valor'}: obtido ${a}, esperado ${b}`);
}
function verdade(cond, oque) { if (!cond) throw new Error(`falhou: ${oque}`); }

// Monta um jogo com as cartas na ordem exata em que serão dadas.
// Ordem da distribuição: jogador, dealer, jogador, dealer.
function jogoComCartas(texto, { saldo = 10000, aposta = 100 } = {}) {
  const jogo = criarJogo({ shoe: criarShoeFixo(cartas(texto)), saldo });
  apostar(jogo, aposta);
  distribuir(jogo);
  return jogo;
}

// ------------------------------------------------------------------ mão

teste('Ás vale 11 quando cabe', () => {
  igual(valorDaMao(cartas('A♠ 7♥')).total, 18);
  igual(valorDaMao(cartas('A♠ 7♥')).macia, true);
});

teste('Ás cai para 1 quando estoura', () => {
  igual(valorDaMao(cartas('A♠ 7♥ 8♦')).total, 16);
  igual(valorDaMao(cartas('A♠ 7♥ 8♦')).macia, false);
});

teste('Dois Áses somam 21 com um nove', () => {
  igual(valorDaMao(cartas('A♠ A♥ 9♦')).total, 21);
});

teste('Figuras valem 10', () => {
  igual(valorDaMao(cartas('K♠ Q♥')).total, 20);
  igual(valorDaMao(cartas('10♠ J♥ 7♦')).total, 27);
});

teste('Blackjack só com duas cartas', () => {
  verdade(ehBlackjack(cartas('A♠ K♥')), 'A+K é blackjack');
  verdade(!ehBlackjack(cartas('7♠ 7♥ 7♦')), '21 em três cartas não é blackjack');
});

teste('Texto da mão mostra os dois valores quando é macia', () => {
  igual(textoValor(cartas('A♠ 7♥')), '8/18');
  igual(textoValor(cartas('10♠ 8♥')), '18');
});

// -------------------------------------------------------------- pagamentos

teste('Blackjack paga 3:2', () => {
  const jogo = jogoComCartas('A♠ 9♦ K♥ 7♣', { saldo: 10000, aposta: 1000 });
  igual(jogo.estado, ESTADOS.RESULTADO, 'estado');
  igual(jogo.maos[0].status, STATUS_MAO.BLACKJACK, 'status');
  igual(jogo.resultado.lucro, 1500, 'lucro');
  igual(jogo.saldo, 11500, 'saldo final');
});

teste('Vitória normal paga 1:1', () => {
  // Jogador 20, dealer 18.
  const jogo = jogoComCartas('K♠ 9♦ Q♥ 9♣', { saldo: 10000, aposta: 1000 });
  executar(jogo, ACOES.PARAR);
  igual(jogo.resultado.maos[0].resultado, STATUS_MAO.WIN, 'resultado');
  igual(jogo.resultado.lucro, 1000, 'lucro');
  igual(jogo.saldo, 11000, 'saldo final');
});

teste('Empate devolve a aposta', () => {
  // Jogador 20, dealer 15 + 5 = 20.
  const jogo = jogoComCartas('K♠ 9♦ Q♥ 6♣ 5♠', { saldo: 10000, aposta: 1000 });
  executar(jogo, ACOES.PARAR);
  igual(jogo.resultado.maos[0].resultado, STATUS_MAO.PUSH, 'resultado');
  igual(jogo.resultado.lucro, 0, 'lucro');
  igual(jogo.saldo, 10000, 'saldo final');
});

teste('Estouro perde na hora, sem o dealer comprar', () => {
  const jogo = jogoComCartas('10♠ 9♦ 8♥ 7♣ 9♠', { saldo: 10000, aposta: 500 });
  executar(jogo, ACOES.PEDIR);   // 10+8+9 = 27
  igual(jogo.maos[0].status, STATUS_MAO.BUST, 'status');
  igual(jogo.dealer.cartas.length, 2, 'dealer não compra quando todas as mãos estouraram');
  igual(jogo.saldo, 9500, 'saldo final');
});

teste('Dealer estourado paga todo mundo que parou', () => {
  const jogo = jogoComCartas('10♠ 6♦ 5♥ 9♣ K♠', { saldo: 10000, aposta: 500 });
  executar(jogo, ACOES.PARAR);   // jogador 15, dealer 15 + K = 25
  verdade(jogo.resultado.dealerEstourou, 'dealer estourou');
  igual(jogo.saldo, 10500, 'saldo final');
});

// ------------------------------------------------------------------ dealer

teste('Dealer para no Soft 17', () => {
  const jogo = jogoComCartas('10♠ A♦ 8♥ 6♣ 9♠', { saldo: 10000, aposta: 100 });
  executar(jogo, ACOES.RECUSAR_SEGURO);
  executar(jogo, ACOES.PARAR);   // jogador 18, dealer A+6 = 17 macio
  igual(jogo.dealer.cartas.length, 2, 'não comprou');
  igual(jogo.resultado.dealer, 17, 'valor do dealer');
  igual(jogo.resultado.maos[0].resultado, STATUS_MAO.WIN, '18 vence 17');
});

teste('Dealer compra com 16', () => {
  const jogo = jogoComCartas('10♠ 10♦ 8♥ 6♣ 5♠', { saldo: 10000, aposta: 100 });
  executar(jogo, ACOES.PARAR);   // dealer 16 + 5 = 21
  igual(jogo.resultado.dealer, 21, 'valor do dealer');
  igual(jogo.resultado.maos[0].resultado, STATUS_MAO.LOSE, 'perde para 21');
});

// ------------------------------------------------------------------ double

teste('Double dobra a aposta e dá uma carta só', () => {
  // Jogador 6+5 = 11, dobra e recebe 9 (20). Dealer 9+7 = 16, compra 2 e para em 18.
  const jogo = jogoComCartas('6♠ 9♦ 5♥ 7♣ 9♠ 2♦', { saldo: 10000, aposta: 500 });
  verdade(acoesDisponiveis(jogo).includes(ACOES.DOBRAR), 'dobrar disponível');
  executar(jogo, ACOES.DOBRAR);
  igual(jogo.maos[0].cartas.length, 3, 'uma carta só');
  igual(jogo.maos[0].aposta, 1000, 'aposta dobrada');
  igual(jogo.resultado.lucro, 1000, 'ganha o dobro');
  igual(jogo.saldo, 11000, 'saldo final');
});

teste('Double sem saldo fica indisponível', () => {
  const jogo = jogoComCartas('6♠ 9♦ 5♥ 7♣ 9♠', { saldo: 500, aposta: 500 });
  verdade(!acoesDisponiveis(jogo).includes(ACOES.DOBRAR), 'sem saldo, sem double');
});

teste('Double só nas duas primeiras cartas', () => {
  const jogo = jogoComCartas('2♠ 9♦ 3♥ 7♣ 4♠ 9♥', { saldo: 10000, aposta: 100 });
  executar(jogo, ACOES.PEDIR);
  verdade(!acoesDisponiveis(jogo).includes(ACOES.DOBRAR), 'não dobra com três cartas');
});

// ------------------------------------------------------------------- split

teste('Split cria duas mãos e desconta a segunda aposta', () => {
  const jogo = jogoComCartas('8♠ 9♦ 8♥ 7♣ 3♠ 2♥ 5♦ 4♣', { saldo: 10000, aposta: 500 });
  verdade(acoesDisponiveis(jogo).includes(ACOES.DIVIDIR), 'dividir disponível');
  executar(jogo, ACOES.DIVIDIR);
  igual(jogo.maos.length, 2, 'duas mãos');
  igual(jogo.maos[0].cartas.length, 2, 'primeira mão recebeu carta');
  igual(jogo.maos[1].cartas.length, 2, 'segunda mão recebeu carta');
  igual(jogo.saldo, 9000, 'duas apostas de 500 descontadas');
});

teste('Split de dez e valete é permitido (mesmo valor)', () => {
  const jogo = jogoComCartas('10♠ 9♦ J♥ 7♣ 3♠ 2♥', { saldo: 10000, aposta: 100 });
  verdade(acoesDisponiveis(jogo).includes(ACOES.DIVIDIR), '10 e J têm o mesmo valor');
});

teste('Split de Áses dá uma carta em cada e para', () => {
  // Dealer 10+8 = 18 e para; cada Ás recebe uma figura e faz 21.
  const jogo = jogoComCartas('A♠ 10♦ A♥ 8♣ K♠ Q♥', { saldo: 10000, aposta: 500 });
  executar(jogo, ACOES.DIVIDIR);
  igual(jogo.estado, ESTADOS.RESULTADO, 'rodada resolvida sem mais ações');
  igual(jogo.maos[0].cartas.length, 2, 'primeira mão parou em duas cartas');
  igual(jogo.maos[1].cartas.length, 2, 'segunda mão parou em duas cartas');
  verdade(jogo.maos.every((m) => m.status !== STATUS_MAO.BLACKJACK), '21 pós-split não é Blackjack');
  igual(jogo.resultado.maos[0].pagamento, 1000, 'paga 1:1, não 3:2');
});

teste('Limite de quatro mãos', () => {
  const jogo = jogoComCartas('8♠ 9♦ 8♥ 7♣ 8♦ 8♣ 8♥ 8♠ 2♠ 3♥ 4♦ 5♣ 6♠ 7♥',
    { saldo: 10000, aposta: 100 });
  executar(jogo, ACOES.DIVIDIR);
  executar(jogo, ACOES.DIVIDIR);
  executar(jogo, ACOES.DIVIDIR);
  igual(jogo.maos.length, 4, 'quatro mãos');
  verdade(!acoesDisponiveis(jogo).includes(ACOES.DIVIDIR), 'não divide a quinta');
});

// --------------------------------------------------------------- surrender

teste('Desistir devolve metade', () => {
  const jogo = jogoComCartas('10♠ 9♦ 6♥ 7♣', { saldo: 10000, aposta: 1000 });
  verdade(acoesDisponiveis(jogo).includes(ACOES.DESISTIR), 'desistir disponível');
  executar(jogo, ACOES.DESISTIR);
  igual(jogo.resultado.lucro, -500, 'perde metade');
  igual(jogo.saldo, 9500, 'saldo final');
});

teste('Não dá para desistir depois de pedir', () => {
  const jogo = jogoComCartas('2♠ 9♦ 3♥ 7♣ 4♠ 8♥', { saldo: 10000, aposta: 100 });
  executar(jogo, ACOES.PEDIR);
  verdade(!acoesDisponiveis(jogo).includes(ACOES.DESISTIR), 'tarde demais');
});

// ------------------------------------------------------------------ seguro

teste('Seguro paga 2:1 quando o dealer tem Blackjack', () => {
  const jogo = jogoComCartas('10♠ A♦ 9♥ K♣', { saldo: 10000, aposta: 1000 });
  verdade(jogo.seguro.disponivel, 'seguro oferecido');
  igual(acoesDisponiveis(jogo), [ACOES.SEGURO, ACOES.RECUSAR_SEGURO], 'só decide o seguro');
  executar(jogo, ACOES.SEGURO, { valor: 500 });
  igual(jogo.estado, ESTADOS.RESULTADO, 'dealer tinha Blackjack');
  igual(jogo.resultado.seguro.pago, 1500, 'seguro devolve 1500');
  igual(jogo.saldo, 10000, 'mão perdida e seguro pago se anulam');
});

teste('Seguro recusado perde a mão para o Blackjack do dealer', () => {
  const jogo = jogoComCartas('10♠ A♦ 9♥ K♣', { saldo: 10000, aposta: 1000 });
  executar(jogo, ACOES.RECUSAR_SEGURO);
  igual(jogo.saldo, 9000, 'perde a aposta');
});

teste('Seguro perdido quando o dealer não tem Blackjack', () => {
  const jogo = jogoComCartas('10♠ A♦ 9♥ 5♣ 4♦', { saldo: 10000, aposta: 1000 });
  executar(jogo, ACOES.SEGURO, { valor: 500 });
  igual(jogo.estado, ESTADOS.TURNO_JOGADOR, 'rodada continua');
  executar(jogo, ACOES.PARAR);          // jogador 19, dealer A+5+4 = 20
  igual(jogo.resultado.seguro.pago, 0, 'seguro perdido');
  igual(jogo.saldo, 8500, 'perde aposta e seguro');
});

teste('Seguro no máximo metade da aposta', () => {
  const jogo = jogoComCartas('10♠ A♦ 9♥ K♣', { saldo: 10000, aposta: 1000 });
  executar(jogo, ACOES.SEGURO, { valor: 999999 });
  igual(jogo.resultado.seguro.valor, 500, 'limitado a metade');
});

// ------------------------------------------------- blackjack dos dois lados

teste('Blackjack contra Blackjack é push', () => {
  const jogo = jogoComCartas('A♠ A♦ K♥ Q♣', { saldo: 10000, aposta: 1000 });
  executar(jogo, ACOES.RECUSAR_SEGURO);
  igual(jogo.resultado.maos[0].resultado, STATUS_MAO.PUSH, 'push');
  igual(jogo.saldo, 10000, 'saldo intacto');
});

teste('Dealer com 10 aberta espia e resolve na hora', () => {
  const jogo = jogoComCartas('9♠ K♦ 8♥ A♣', { saldo: 10000, aposta: 1000 });
  igual(jogo.estado, ESTADOS.RESULTADO, 'resolvida sem jogar');
  verdade(jogo.dealer.revelado, 'carta revelada');
  igual(jogo.saldo, 9000, 'perdeu a aposta');
});

teste('Dealer com 10 aberta e sem Blackjack não revela', () => {
  const jogo = jogoComCartas('9♠ K♦ 8♥ 5♣ 4♦', { saldo: 10000, aposta: 100 });
  igual(jogo.estado, ESTADOS.TURNO_JOGADOR, 'rodada segue');
  verdade(!jogo.dealer.revelado, 'carta escondida continua escondida');
});

// -------------------------------------------------------------- 21 e turnos

teste('21 na mão encerra sem precisar parar', () => {
  const jogo = jogoComCartas('7♠ 9♦ 4♥ 7♣ 10♠ 5♥', { saldo: 10000, aposta: 100 });
  executar(jogo, ACOES.PEDIR);   // 7+4+10 = 21
  igual(jogo.estado, ESTADOS.RESULTADO, 'foi direto para o resultado');
});

teste('Ação fora do turno é recusada', () => {
  const jogo = jogoComCartas('10♠ 9♦ 9♥ 7♣ 4♦', { saldo: 10000, aposta: 100 });
  executar(jogo, ACOES.PARAR);
  let deuErro = false;
  try { executar(jogo, ACOES.PEDIR); } catch { deuErro = true; }
  verdade(deuErro, 'pedir depois do resultado joga erro');
});

teste('Apostar mais do que tem é recusado', () => {
  const jogo = criarJogo({ shoe: criarShoeFixo(cartas('10♠ 9♦ 9♥ 7♣')), saldo: 100 });
  let deuErro = false;
  try { apostar(jogo, 500); } catch { deuErro = true; }
  verdade(deuErro, 'aposta maior que o saldo');
});

teste('Aposta fora dos limites da mesa é recusada', () => {
  const jogo = criarJogo({
    shoe: criarShoeFixo(cartas('10♠ 9♦ 9♥ 7♣')),
    saldo: 100000,
    mesa: { id: 'bronze', min: 100, max: 1000, nivel: 3 },
  });
  let erros = 0;
  try { apostar(jogo, 50); } catch { erros++; }
  try { apostar(jogo, 5000); } catch { erros++; }
  igual(erros, 2, 'abaixo do mínimo e acima do máximo');
});

// -------------------------------------------------------------------- shoe

teste('Shoe tem 312 cartas com 6 baralhos', () => {
  const shoe = criarShoe({ rng: rngSemeado(7) });
  igual(shoe.cartas.length, 312);
});

teste('Shoe embaralha ao passar de 75%', () => {
  const shoe = criarShoe({ rng: rngSemeado(7) });
  const jogo = criarJogo({ shoe, saldo: 1000000 });
  let embaralhou = 0;
  for (let i = 0; i < 300 && embaralhou === 0; i++) {
    apostar(jogo, 100);
    distribuir(jogo);
    if (jogo.eventos.some((e) => e.tipo === 'embaralhou')) embaralhou = i;
    jogo.eventos.length = 0;
    while (jogo.estado === ESTADOS.TURNO_JOGADOR) {
      const acoes = acoesDisponiveis(jogo);
      executar(jogo, acoes.includes(ACOES.RECUSAR_SEGURO) ? ACOES.RECUSAR_SEGURO : ACOES.PARAR);
    }
    novaRodada(jogo);
  }
  verdade(embaralhou > 0, 'houve reembaralhamento');
  verdade(shoe.indice < shoe.cortada, 'shoe novo com folga');
  verdade(restantes(shoe) > 0, 'cartas restantes');
});

teste('Baralho não olha saldo nem sequência', () => {
  // Mesma semente, saldos diferentes: as cartas têm que sair iguais.
  const cartasDe = (saldo) => {
    const jogo = criarJogo({ shoe: criarShoe({ rng: rngSemeado(99) }), saldo });
    apostar(jogo, 100);
    distribuir(jogo);
    return jogo.maos[0].cartas.concat(jogo.dealer.cartas).map((c) => c.valor + c.naipe);
  };
  igual(cartasDe(10000), cartasDe(9999999), 'mesma ordem de cartas');
});

// -------------------------------------------------------------- progressão

teste('XP da rodada soma participação, vitória e blackjack', () => {
  igual(xpDaRodada({ vitorias: 1, blackjacks: 1, doublesVencedores: 0, sequencia: 1 }), 35);
  igual(xpDaRodada({ vitorias: 0, blackjacks: 0, doublesVencedores: 0, sequencia: 0 }), 5);
  igual(xpDaRodada({ vitorias: 1, blackjacks: 0, doublesVencedores: 1, sequencia: 4 }), 45);
});

teste('Nível 12 custa 3.000 XP', () => {
  igual(xpDoNivel(12), 3000);
});

teste('Resumo conta split uma vez por rodada', () => {
  const jogo = jogoComCartas('8♠ 9♦ 8♥ 7♣ 3♠ 2♥ 5♦ 4♣', { saldo: 10000, aposta: 500 });
  executar(jogo, ACOES.DIVIDIR);
  while (jogo.estado === ESTADOS.TURNO_JOGADOR) executar(jogo, ACOES.PARAR);
  const r = resumoDaRodada(jogo.resultado);
  igual(r.splits, 1, 'um split');
  igual(r.maos, 2, 'duas mãos');
});

// ------------------------------------------------------------------ saldo

teste('Saldo fecha a conta em cem rodadas aleatórias', () => {
  const jogo = criarJogo({ shoe: criarShoe({ rng: rngSemeado(2026) }), saldo: 1000000 });
  let saldoEsperado = 1000000;
  for (let i = 0; i < 100; i++) {
    const aposta = 100;
    apostar(jogo, aposta);
    saldoEsperado -= aposta;
    distribuir(jogo);
    while (jogo.estado === ESTADOS.TURNO_JOGADOR) {
      const acoes = acoesDisponiveis(jogo);
      if (acoes.includes(ACOES.RECUSAR_SEGURO)) { executar(jogo, ACOES.RECUSAR_SEGURO); continue; }
      const mao = jogo.maos[jogo.maoAtual];
      const valor = valorDaMao(mao.cartas).total;
      executar(jogo, valor < 17 ? ACOES.PEDIR : ACOES.PARAR);
    }
    saldoEsperado += jogo.resultado.devolvido;
    igual(jogo.saldo, saldoEsperado, `saldo na rodada ${i + 1}`);
    novaRodada(jogo);
  }
});

export async function rodar() {
  const resultados = [];
  for (const caso of casos) {
    try {
      await caso.fn();
      resultados.push({ nome: caso.nome, ok: true });
    } catch (erro) {
      resultados.push({ nome: caso.nome, ok: false, erro: erro.message });
    }
  }
  return resultados;
}
