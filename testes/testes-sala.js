// Testes da sala online. Mesmo relatório dos testes do motor: registram-se em
// `teste()` e rodam na mesma página.

import { cartas, criarShoeFixo, criarShoe, rngSemeado } from '../src/motor/baralho.js';
import { ACOES, STATUS_MAO } from '../src/motor/regras.js';
import {
  STATUS_SALA, acoesDe, agir, ajustarConfig, apostar, assumirCrupie, campeoes, criarSala,
  definirPronto, entrar, gerarCodigo, iniciar, jogadorDe, normalizarConfig,
  problemasNaConfig, ranking, recomprar, sair, tique, visaoPara,
} from '../src/motor/sala.js';
import { dealerDevePedir } from '../src/motor/assento.js';
import { igual, teste, verdade } from './testes.js';

const HOST = { id: 'p1', nome: 'Mayk', avatar: '🂡' };

function salaCom(quantos, { cartasDoShoe, config } = {}) {
  const shoe = cartasDoShoe ? criarShoeFixo(cartas(cartasDoShoe)) : criarShoe({ rng: rngSemeado(5) });
  const sala = criarSala({
    codigo: 'BX72K9',
    nome: 'Mesa do Mayk',
    host: HOST,
    config: { fichasIniciais: 10000, apostaMin: 500, apostaMax: 5000, limiteRodadas: 10,
      tempoAposta: 20, tempoTurno: 15, maxJogadores: 10, ...config },
    agora: 1000,
    shoe,
  });
  const nomes = ['João', 'Pedro', 'Lucas', 'Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fabi'];
  for (let i = 1; i < quantos; i++) {
    entrar(sala, { id: `p${i + 1}`, nome: nomes[i - 1] }, 1000 + i);
  }
  return sala;
}

function erroDe(fn) {
  try { fn(); return null; } catch (e) { return e.motivo ?? e.message; }
}

// ------------------------------------------------------------------ sala

teste('Código da sala tem 6 caracteres sem letra ambígua', () => {
  const codigo = gerarCodigo(rngSemeado(3));
  igual(codigo.length, 6, 'tamanho');
  verdade(!/[IO01]/.test(codigo), 'sem I, O, 0 ou 1');
});

teste('ADM define fichas iniciais e todos entram com elas', () => {
  const sala = salaCom(4, { config: { fichasIniciais: 50000 } });
  igual(sala.jogadores.length, 4, 'quatro na sala');
  verdade(sala.jogadores.every((j) => j.fichas === 50000), 'todos com 50.000');
});

teste('Aposta mínima não pode passar das fichas iniciais', () => {
  const config = normalizarConfig({ fichasIniciais: 10000, apostaMin: 20000, apostaMax: 30000 });
  igual(config.apostaMin, 10000, 'mínima cai para o saldo inicial');
  verdade(config.apostaMax >= config.apostaMin, 'máxima acima da mínima');
  igual(problemasNaConfig({ fichasIniciais: 10000, apostaMin: 20000, apostaMax: 30000, maxJogadores: 6 }).length, 1);
});

teste('Sala aceita de 2 a 10 jogadores', () => {
  igual(normalizarConfig({ maxJogadores: 40 }).maxJogadores, 10, 'teto');
  igual(normalizarConfig({ maxJogadores: 1 }).maxJogadores, 2, 'piso');
});

teste('Sala cheia recusa quem chega', () => {
  const sala = salaCom(6, { config: { maxJogadores: 6 } });
  igual(erroDe(() => entrar(sala, { id: 'px', nome: 'Tarde' }, 2000)), 'sala-cheia');
});

teste('Regras travam depois que a partida começa', () => {
  const sala = salaCom(2);
  iniciar(sala, 'p1', 2000);
  igual(erroDe(() => ajustarConfig(sala, 'p1', { fichasIniciais: 999 })), 'fase');
});

teste('Só o ADM muda as regras e inicia', () => {
  const sala = salaCom(2);
  igual(erroDe(() => ajustarConfig(sala, 'p2', { fichasIniciais: 999 })), 'sem-permissao');
  igual(erroDe(() => iniciar(sala, 'p2', 2000)), 'sem-permissao');
});

teste('Pronto só vale no lobby', () => {
  const sala = salaCom(2);
  definirPronto(sala, 'p2', true);
  verdade(jogadorDe(sala, 'p2').pronto, 'marcou pronto');
  iniciar(sala, 'p1', 2000);
  igual(erroDe(() => definirPronto(sala, 'p2', true)), 'fase');
});

// ---------------------------------------------------------------- apostas

teste('Partida começa na fase de apostas com prazo', () => {
  const sala = salaCom(3);
  iniciar(sala, 'p1', 5000);
  igual(sala.status, STATUS_SALA.APOSTAS, 'status');
  igual(sala.rodada, 1, 'primeira rodada');
  igual(sala.prazo, 5000 + 20 * 1000, 'prazo de 20 segundos');
});

teste('Quando todos apostam, distribui na hora', () => {
  const sala = salaCom(2);
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  igual(sala.status, STATUS_SALA.APOSTAS, 'ainda falta um');
  apostar(sala, 'p2', 500, 5200);
  igual(sala.status, STATUS_SALA.TURNO_JOGADORES, 'distribuiu');
  verdade(sala.jogadores.every((j) => j.maos[0].cartas.length === 2), 'duas cartas cada');
  igual(sala.dealer.cartas.length, 2, 'dealer com duas');
});

teste('Aposta fora dos limites e sem fichas é recusada', () => {
  const sala = salaCom(2);
  iniciar(sala, 'p1', 5000);
  igual(erroDe(() => apostar(sala, 'p1', 100, 5100)), 'aposta', 'abaixo da mínima');
  igual(erroDe(() => apostar(sala, 'p1', 99999, 5100)), 'aposta', 'acima da máxima');
  jogadorDe(sala, 'p1').fichas = 400;
  igual(erroDe(() => apostar(sala, 'p1', 500, 5100)), 'fichas', 'sem fichas');
});

teste('Ninguém aposta duas vezes na mesma rodada', () => {
  const sala = salaCom(2);
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  igual(erroDe(() => apostar(sala, 'p1', 500, 5150)), 'ja-apostou');
});

teste('Quem não apostou fica de fora da rodada, mas continua na sala', () => {
  const sala = salaCom(3);
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  tique(sala, 5000 + 21 * 1000);       // prazo das apostas venceu
  igual(sala.status, STATUS_SALA.TURNO_JOGADORES, 'a rodada seguiu');
  igual(jogadorDe(sala, 'p2').maos.length, 0, 'p2 sem mão');
  igual(sala.jogadores.length, 3, 'ninguém saiu da sala');
  igual(sala.vezDe, 'p1', 'só p1 joga');
});

// ------------------------------------------------------------------ turno

teste('Joga um por vez, na ordem dos assentos', () => {
  //            p1   p2   D    p1   p2   D
  const sala = salaCom(2, { cartasDoShoe: '5♠ 9♦ 6♣ 6♥ 9♣ 7♦ 4♦ 5♥ 8♠' });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);

  igual(sala.vezDe, 'p1', 'começa no p1');
  igual(erroDe(() => agir(sala, 'p2', ACOES.PARAR, 5300)), 'fora-da-vez', 'p2 não joga fora da vez');
  igual(acoesDe(sala, 'p2').length, 0, 'p2 não tem ação nenhuma');

  agir(sala, 'p1', ACOES.PARAR, 5300);
  igual(sala.vezDe, 'p2', 'passou para o p2');
  igual(erroDe(() => agir(sala, 'p1', ACOES.PEDIR, 5400)), 'fora-da-vez', 'p1 não volta');
});

teste('Cada ação renova o tempo da vez', () => {
  const sala = salaCom(2, { cartasDoShoe: '5♠ 9♦ 6♣ 6♥ 9♣ 7♦ 4♦ 5♥ 8♠ 2♣' });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);
  const prazo1 = sala.prazo;
  agir(sala, 'p1', ACOES.PEDIR, 8000);
  verdade(sala.prazo > prazo1, 'prazo renovado');
  igual(sala.prazo, 8000 + 15 * 1000, 'quinze segundos a partir da jogada');
});

teste('Tempo esgotado para a mão; nunca pede carta', () => {
  const sala = salaCom(2, { cartasDoShoe: '5♠ 9♦ 6♣ 6♥ 9♣ 7♦ 4♦ 5♥ 8♠' });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);
  const cartasAntes = jogadorDe(sala, 'p1').maos[0].cartas.length;

  tique(sala, sala.prazo + 1);
  igual(jogadorDe(sala, 'p1').maos[0].cartas.length, cartasAntes, 'não recebeu carta');
  igual(jogadorDe(sala, 'p1').maos[0].status, STATUS_MAO.STAND, 'parou sozinho');
  igual(sala.vezDe, 'p2', 'passou a vez');
});

teste('Split online dá duas mãos só para quem dividiu', () => {
  //            p1   p2   D    p1   p2   D   split p1  split p1  p2...
  const sala = salaCom(2, { cartasDoShoe: '8♠ 9♦ 6♣ 8♥ 9♣ 7♦ 3♠ 2♥ 5♦ 4♣ 10♥' });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);
  verdade(acoesDe(sala, 'p1').includes(ACOES.DIVIDIR), 'dividir disponível');
  agir(sala, 'p1', ACOES.DIVIDIR, 5300);
  igual(jogadorDe(sala, 'p1').maos.length, 2, 'p1 com duas mãos');
  igual(jogadorDe(sala, 'p2').maos.length, 1, 'p2 segue com uma');
  igual(sala.vezDe, 'p1', 'ainda é a vez do p1');
  igual(jogadorDe(sala, 'p1').fichas, 9000, 'segunda aposta descontada');
});

teste('A vez só passa quando todas as mãos do jogador terminam', () => {
  const sala = salaCom(2, { cartasDoShoe: '8♠ 9♦ 6♣ 8♥ 9♣ 7♦ 3♠ 2♥ 5♦ 4♣ 10♥ 9♠ 8♦' });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);
  agir(sala, 'p1', ACOES.DIVIDIR, 5300);
  agir(sala, 'p1', ACOES.PARAR, 5400);
  igual(sala.vezDe, 'p1', 'falta a segunda mão');
  agir(sala, 'p1', ACOES.PARAR, 5500);
  igual(sala.vezDe, 'p2', 'agora sim');
});

// ----------------------------------------------------------------- dealer

teste('Dealer joga depois de todo mundo e paga cada um', () => {
  // p1 20, p2 12, dealer 16 + 5 = 21
  const sala = salaCom(2, { cartasDoShoe: '10♠ 5♦ 9♣ Q♥ 7♣ 7♦ 5♥' });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);
  agir(sala, 'p1', ACOES.PARAR, 5300);
  agir(sala, 'p2', ACOES.PARAR, 5400);

  igual(sala.status, STATUS_SALA.RESULTADO, 'rodada fechada');
  verdade(sala.dealer.revelado, 'carta revelada');
  igual(sala.historico[0].dealer, 21, 'dealer fez 21');
  igual(jogadorDe(sala, 'p1').fichas, 9500, 'p1 perdeu 500');
  igual(jogadorDe(sala, 'p2').fichas, 9500, 'p2 perdeu 500');
});

teste('Blackjack na sala paga 3:2', () => {
  // p1 A+K, p2 9+8, dealer 9+7 (sem espiada, carta aberta é 9)
  const sala = salaCom(2, { cartasDoShoe: 'A♠ 9♦ 9♣ K♥ 8♣ 7♦ 5♥' });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 1000, 5100);
  apostar(sala, 'p2', 1000, 5200);
  igual(jogadorDe(sala, 'p1').maos[0].status, STATUS_MAO.BLACKJACK, 'blackjack marcado');
  igual(sala.vezDe, 'p2', 'quem tem blackjack não joga a vez');
  agir(sala, 'p2', ACOES.PARAR, 5300);
  igual(jogadorDe(sala, 'p1').fichas, 11500, 'lucro de 1.500 sobre a aposta de 1.000');
});

teste('Blackjack do dealer encerra a rodada na hora', () => {
  // dealer A + K: a carta aberta é Ás, então espia
  const sala = salaCom(2, { cartasDoShoe: '10♠ 9♦ A♣ 7♥ 8♣ K♦' });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);
  igual(sala.status, STATUS_SALA.RESULTADO, 'resolveu sem ninguém jogar');
  igual(jogadorDe(sala, 'p1').fichas, 9500, 'p1 perdeu');
  igual(jogadorDe(sala, 'p2').fichas, 9500, 'p2 perdeu');
});

// --------------------------------------------------------------- partida

teste('Resultado espera e abre a próxima rodada', () => {
  const sala = salaCom(2, { cartasDoShoe: '10♠ 5♦ 9♣ Q♥ 7♣ 7♦ 5♥' });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);
  agir(sala, 'p1', ACOES.PARAR, 5300);
  agir(sala, 'p2', ACOES.PARAR, 5400);
  igual(sala.rodada, 1, 'ainda na primeira');
  tique(sala, sala.prazo + 1);
  igual(sala.status, STATUS_SALA.APOSTAS, 'abriu apostas');
  igual(sala.rodada, 2, 'segunda rodada');
});

teste('Partida acaba no limite de rodadas e aponta o campeão', () => {
  const sala = salaCom(2, { config: { limiteRodadas: 1 } });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);
  let guarda = 0;
  while (sala.status === STATUS_SALA.TURNO_JOGADORES && guarda++ < 20) {
    agir(sala, sala.vezDe, ACOES.PARAR, 5300 + guarda);
  }
  tique(sala, sala.prazo + 1);
  igual(sala.status, STATUS_SALA.PARTIDA_FINALIZADA, 'partida encerrada');
  const lista = ranking(sala);
  igual(lista.length, 2, 'dois no ranking');
  verdade(lista[0].fichas >= lista[1].fichas, 'ordenado por fichas');
  verdade(campeoes(sala).length >= 1, 'tem campeão');
});

teste('Empate no ranking mantém a mesma posição', () => {
  const sala = salaCom(3);
  const lista = ranking(sala);   // ninguém jogou: todos com as mesmas fichas
  igual(lista.map((l) => l.posicao), [1, 1, 1], 'todos em primeiro');
});

teste('Sem ninguém com fichas, a partida encerra', () => {
  const sala = salaCom(2, { config: { limiteRodadas: null } });
  iniciar(sala, 'p1', 5000);
  for (const j of sala.jogadores) j.fichas = 100;    // abaixo da aposta mínima
  tique(sala, sala.prazo + 1);
  igual(sala.status, STATUS_SALA.PARTIDA_FINALIZADA, 'acabou por falta de fichas');
});

teste('Recompra só quando o ADM libera', () => {
  const sala = salaCom(2, { config: { permitirRecompra: false } });
  iniciar(sala, 'p1', 5000);
  jogadorDe(sala, 'p1').fichas = 0;
  igual(erroDe(() => recomprar(sala, 'p1')), 'sem-recompra');

  const outra = salaCom(2, { config: { permitirRecompra: true } });
  iniciar(outra, 'p1', 5000);
  jogadorDe(outra, 'p1').fichas = 0;
  recomprar(outra, 'p1');
  igual(jogadorDe(outra, 'p1').fichas, 10000, 'voltou ao saldo inicial');
});

// ------------------------------------------------------- entrar e sair

teste('Quem chega no meio da partida assiste', () => {
  const sala = salaCom(2);
  iniciar(sala, 'p1', 5000);
  entrar(sala, { id: 'p9', nome: 'Atrasado' }, 6000);
  verdade(jogadorDe(sala, 'p9').espectador, 'entrou como espectador');
  igual(jogadorDe(sala, 'p9').fichas, 0, 'sem fichas na partida em andamento');
});

teste('Com entrada liberada, o novo jogador senta na hora e joga na rodada seguinte', () => {
  const sala = salaCom(2, { config: { permitirEntradaDurante: true } });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);          // rodada já em andamento
  igual(sala.status, STATUS_SALA.TURNO_JOGADORES, 'cartas na mesa');

  entrar(sala, { id: 'p9', nome: 'Atrasado' }, 6000);
  igual(jogadorDe(sala, 'p9').espectador, false, 'senta na mesa (§64)');
  igual(jogadorDe(sala, 'p9').fichas, 10000, 'recebeu as fichas iniciais');
  igual(jogadorDe(sala, 'p9').maos.length, 0, 'sem mão na rodada que já começou');

  let guarda = 0;
  while (sala.status === STATUS_SALA.TURNO_JOGADORES && guarda++ < 20) {
    agir(sala, sala.vezDe, ACOES.PARAR, 6300 + guarda);
  }
  tique(sala, sala.prazo + 1);
  igual(sala.status, STATUS_SALA.APOSTAS, 'nova rodada');
  apostar(sala, 'p9', 500, 7000);
  igual(jogadorDe(sala, 'p9').apostaPendente, 500, 'agora aposta normalmente');
});

teste('A rodada só distribui quando todos os que podem apostar apostaram', () => {
  const sala = salaCom(3);
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);
  igual(sala.status, STATUS_SALA.APOSTAS, 'espera o terceiro');
  apostar(sala, 'p3', 500, 5300);
  igual(sala.status, STATUS_SALA.TURNO_JOGADORES, 'agora distribui');
});

teste('Reconexão mantém a vaga, as fichas e a mão', () => {
  const sala = salaCom(2);
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  const fichas = jogadorDe(sala, 'p1').fichas;
  entrar(sala, { id: 'p1', nome: 'Mayk' }, 5200);   // voltou
  igual(sala.jogadores.length, 2, 'não duplicou');
  igual(jogadorDe(sala, 'p1').fichas, fichas, 'fichas intactas');
  igual(jogadorDe(sala, 'p1').apostaPendente, 500, 'aposta continua na mesa');
});

teste('ADM saindo passa o comando para quem está há mais tempo', () => {
  const sala = salaCom(3);
  sair(sala, 'p1', 7000);
  igual(sala.hostId, 'p2', 'p2 assumiu');
  igual(sala.jogadores.length, 2, 'dois na sala');
});

teste('Quem sai no meio da vez não trava a sala', () => {
  const sala = salaCom(2, { cartasDoShoe: '5♠ 9♦ 6♣ 6♥ 9♣ 7♦ 4♦ 5♥ 8♠' });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);
  igual(sala.vezDe, 'p1', 'era a vez do p1');
  sair(sala, 'p1', 5300);
  igual(sala.vezDe, 'p2', 'a vez andou');
});

// ------------------------------------------------------------------ senha

teste('Sala com senha barra quem não tem a senha', () => {
  const sala = criarSala({ codigo: 'SENHA1', nome: 'Fechada', host: HOST, senha: 'hash-da-senha',
    config: { fichasIniciais: 10000, apostaMin: 500, apostaMax: 5000 }, agora: 1000 });
  igual(erroDe(() => entrar(sala, { id: 'p2', nome: 'Sem senha' }, 1100)), 'senha', 'sem senha');
  igual(erroDe(() => entrar(sala, { id: 'p2', nome: 'Errou', senha: 'outra' }, 1100)), 'senha', 'senha errada');
  entrar(sala, { id: 'p2', nome: 'Acertou', senha: 'hash-da-senha' }, 1200);
  igual(sala.jogadores.length, 2, 'com a senha certa entra');
});

teste('Quem já está na sala volta sem digitar a senha de novo', () => {
  const sala = criarSala({ codigo: 'SENHA2', nome: 'Fechada', host: HOST, senha: 'hash',
    config: { fichasIniciais: 10000 }, agora: 1000 });
  entrar(sala, { id: 'p2', nome: 'João', senha: 'hash' }, 1100);
  entrar(sala, { id: 'p2', nome: 'João' }, 1200);          // reconectou
  igual(sala.jogadores.length, 2, 'não duplicou');
});

teste('A visão avisa que tem senha, mas nunca mostra qual é', () => {
  const sala = criarSala({ codigo: 'SENHA3', nome: 'Fechada', host: HOST, senha: 'hash-secreto',
    config: { fichasIniciais: 10000 }, agora: 1000 });
  const visao = visaoPara(sala, 'p1');
  igual(visao.temSenha, true, 'sabe que tem');
  verdade(!JSON.stringify(visao).includes('hash-secreto'), 'a senha não vaza');
  igual(visaoPara(salaCom(2), 'p1').temSenha, false, 'sala sem senha');
});

// ------------------------------------------------------------------ visão

teste('A visão do jogador não mostra o shoe nem a carta escondida', () => {
  const sala = salaCom(2, { cartasDoShoe: '10♠ 5♦ 9♣ Q♥ 7♣ 7♦ 5♥' });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);

  const visao = visaoPara(sala, 'p1');
  igual(visao.dealer.cartas.length, 1, 'só a carta aberta');
  igual(visao.dealer.escondidas, 1, 'uma escondida');
  verdade(!JSON.stringify(visao).includes('indice'), 'o shoe não vai junto');
  verdade(visao.cartasNoShoe > 0, 'só a contagem de cartas');
  igual(visao.minhaVez, true, 'p1 sabe que é a vez dele');
  igual(visaoPara(sala, 'p2').minhaVez, false, 'p2 sabe que não é');
});

teste('Todo mundo vê as cartas dos outros', () => {
  const sala = salaCom(2, { cartasDoShoe: '10♠ 5♦ 9♣ Q♥ 7♣ 7♦ 5♥' });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);
  const visao = visaoPara(sala, 'p1');
  const outro = visao.jogadores.find((j) => j.id === 'p2');
  igual(outro.maos[0].cartas.length, 2, 'cartas do outro à vista');
  igual(outro.maos[0].valor, 12, 'e o valor também');
});

teste('Fichas da sala não encostam no saldo da carreira', () => {
  const sala = salaCom(2, { config: { fichasIniciais: 10000 } });
  // A sala só conhece o que está dentro dela: nada de perfil, saldo ou XP.
  const texto = JSON.stringify(sala);
  verdade(!texto.includes('"saldo"'), 'sem saldo de carreira');
  verdade(!texto.includes('"xp"'), 'sem XP');
});

teste('Ação inválida é recusada mesmo dentro da vez', () => {
  const sala = salaCom(2, { cartasDoShoe: '10♠ 5♦ 9♣ Q♥ 7♣ 7♦ 5♥ 2♠' });
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5100);
  apostar(sala, 'p2', 500, 5200);
  agir(sala, 'p1', ACOES.PARAR, 5300);
  // p2 tem 5 e 7: não há par, então dividir não está na mesa.
  igual(erroDe(() => agir(sala, 'p2', ACOES.DIVIDIR, 5400)), 'acao', 'sem par, sem split');
});

teste('Quem não está na sala não age', () => {
  const sala = salaCom(2);
  iniciar(sala, 'p1', 5000);
  igual(erroDe(() => apostar(sala, 'intruso', 500, 5100)), 'sem-assento');
  igual(erroDe(() => agir(sala, 'intruso', ACOES.PEDIR, 5100)), 'sem-assento');
});

teste('Cem rodadas seguidas sem travar e com as fichas fechando', () => {
  const sala = salaCom(4, { config: { limiteRodadas: null, permitirRecompra: false } });
  iniciar(sala, 'p1', 10000);
  const totalInicial = sala.jogadores.reduce((t, j) => t + j.fichas, 0);
  let agora = 10000;
  let rodadas = 0;

  while (sala.status !== STATUS_SALA.PARTIDA_FINALIZADA && rodadas < 100) {
    agora += 100;
    if (sala.status === STATUS_SALA.APOSTAS) {
      for (const j of sala.jogadores) {
        if (j.fichas >= sala.config.apostaMin) {
          try { apostar(sala, j.id, sala.config.apostaMin, agora); } catch { /* já apostou */ }
        }
      }
      if (sala.status === STATUS_SALA.APOSTAS) tique(sala, sala.prazo + 1);
    } else if (sala.status === STATUS_SALA.TURNO_JOGADORES) {
      const acoes = acoesDe(sala, sala.vezDe);
      agir(sala, sala.vezDe, acoes.includes(ACOES.PARAR) ? ACOES.PARAR : acoes[0], agora);
    } else if (sala.status === STATUS_SALA.RESULTADO) {
      rodadas++;
      tique(sala, sala.prazo + 1);
    }
    // Ninguém pode ficar com ficha negativa em nenhum momento.
    verdade(sala.jogadores.every((j) => j.fichas >= 0), `fichas negativas na rodada ${rodadas}`);
  }

  verdade(rodadas > 0, 'jogou alguma rodada');
  const totalFinal = sala.jogadores.reduce((t, j) => t + j.fichas, 0);
  verdade(totalFinal !== totalInicial || rodadas === 0, 'as fichas circularam');
  verdade(sala.shoe.indice <= sala.shoe.cartas.length, 'shoe não estourou');
});

// ---------------------------------------------------------- crupiê humano

// Mayk (p1, ADM) é o crupiê; João (p2) e Pedro (p3) apostam.
// Ordem da distribuição: p2, p3, dealer, p2, p3, dealer — o crupiê não recebe mão.
function salaComCrupie(cartasDoShoe, { config } = {}) {
  const sala = criarSala({
    codigo: 'CRUP01', nome: 'Com crupiê', host: HOST, agora: 1000,
    config: { fichasIniciais: 10000, apostaMin: 500, apostaMax: 5000, tempoTurno: 15,
      tempoAposta: 20, limiteRodadas: 10, crupieHumano: true, ...config },
    shoe: cartasDoShoe ? criarShoeFixo(cartas(cartasDoShoe)) : criarShoe({ rng: rngSemeado(9) }),
  });
  entrar(sala, { id: 'p2', nome: 'João' }, 1001);
  entrar(sala, { id: 'p3', nome: 'Pedro' }, 1002);
  assumirCrupie(sala, 'p1');
  return sala;
}

function ateAVezDoCrupie(sala) {
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p2', 500, 5100);
  apostar(sala, 'p3', 500, 5200);
  agir(sala, 'p2', ACOES.PARAR, 5300);
  agir(sala, 'p3', ACOES.PARAR, 5400);
}

teste('Crupiê humano só existe quando quem cria a sala liga a opção', () => {
  const sala = salaCom(2);
  igual(erroDe(() => assumirCrupie(sala, 'p2')), 'sem-crupie');
});

teste('Um crupiê por vez, e ele pode largar o lugar', () => {
  const sala = salaComCrupie();
  igual(sala.crupieId, 'p1', 'Mayk assumiu');
  igual(erroDe(() => assumirCrupie(sala, 'p2')), 'crupie-ocupado', 'lugar ocupado');
  assumirCrupie(sala, 'p1', false);
  igual(sala.crupieId, null, 'largou');
  assumirCrupie(sala, 'p2');
  igual(sala.crupieId, 'p2', 'João assumiu');
});

teste('O crupiê não troca no meio da partida', () => {
  const sala = salaComCrupie();
  iniciar(sala, 'p1', 5000);
  igual(erroDe(() => assumirCrupie(sala, 'p1', false)), 'fase');
});

teste('Só com o crupiê na mesa não dá para começar', () => {
  const sala = criarSala({ codigo: 'CRUP02', nome: 'Sozinho', host: HOST, agora: 1000,
    config: { fichasIniciais: 10000, crupieHumano: true } });
  assumirCrupie(sala, 'p1');
  igual(erroDe(() => iniciar(sala, 'p1', 2000)), 'sem-jogadores');
});

teste('O crupiê não aposta, e a rodada sai quando os outros apostam', () => {
  const sala = salaComCrupie('9♥ 7♠ 10♠ 9♣ 6♦ 2♦ 3♣ 4♥');
  iniciar(sala, 'p1', 5000);
  igual(erroDe(() => apostar(sala, 'p1', 500, 5050)), 'crupie', 'crupiê não aposta');
  apostar(sala, 'p2', 500, 5100);
  apostar(sala, 'p3', 500, 5200);
  igual(sala.status, STATUS_SALA.TURNO_JOGADORES, 'distribuiu sem esperar o crupiê');
  igual(jogadorDe(sala, 'p1').maos.length, 0, 'crupiê sem mão');
  igual(sala.vezDe, 'p2', 'joga primeiro quem apostou');
});

teste('Depois dos jogadores, a vez é do crupiê, com a carta virada', () => {
  const sala = salaComCrupie('9♥ 7♠ 10♠ 9♣ 6♦ 2♦ 3♣ 4♥');
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p2', 500, 5100);
  apostar(sala, 'p3', 500, 5200);
  igual(visaoPara(sala, 'p1').dealer.cartas.length, 1, 'nem o crupiê vê a escondida antes da vez');
  agir(sala, 'p2', ACOES.PARAR, 5300);
  agir(sala, 'p3', ACOES.PARAR, 5400);
  igual(sala.status, STATUS_SALA.TURNO_DEALER, 'vez do dealer');
  igual(sala.vezDe, 'p1', 'nas mãos do crupiê');
  verdade(sala.dealer.revelado, 'carta escondida virou');
  igual(acoesDe(sala, 'p1'), [ACOES.PEDIR, ACOES.PARAR], 'pedir ou parar');
  igual(acoesDe(sala, 'p2'), [], 'jogador não mexe no dealer');
});

teste('O crupiê joga livre: pode parar com 12', () => {
  // João 18, Pedro 13, dealer 10 + 2 = 12. Parar com 12 é ruim para a casa, e é permitido.
  const sala = salaComCrupie('9♥ 7♠ 10♠ 9♣ 6♦ 2♦');
  ateAVezDoCrupie(sala);
  agir(sala, 'p1', ACOES.PARAR, 5500);
  igual(sala.status, STATUS_SALA.RESULTADO, 'rodada fechada');
  igual(sala.historico[0].dealer, 12, 'dealer parou em 12');
  igual(jogadorDe(sala, 'p2').fichas, 10500, 'João ganhou');
  igual(jogadorDe(sala, 'p3').fichas, 10500, 'Pedro ganhou com 13');
});

teste('O crupiê joga livre: pode pedir com 18', () => {
  // Dealer 10 + 8 = 18, o automático pararia. O crupiê pede, vem 2 e fica 20.
  const sala = salaComCrupie('9♥ 7♠ 10♠ 9♣ 6♦ 8♦ 2♥');
  ateAVezDoCrupie(sala);
  agir(sala, 'p1', ACOES.PEDIR, 5500);
  igual(sala.status, STATUS_SALA.TURNO_DEALER, 'continua decidindo');
  agir(sala, 'p1', ACOES.PARAR, 5600);
  igual(sala.historico[0].dealer, 20, 'dealer com 20');
  igual(jogadorDe(sala, 'p2').fichas, 9500, 'João perdeu com 18');
});

teste('Crupiê que estoura fecha a rodada e paga a mesa', () => {
  const sala = salaComCrupie('9♥ 7♠ 10♠ 9♣ 6♥ 6♦ K♣');
  ateAVezDoCrupie(sala);
  agir(sala, 'p1', ACOES.PEDIR, 5500);        // 16 + K = 26
  igual(sala.status, STATUS_SALA.RESULTADO, 'fechou sozinho');
  verdade(sala.historico[0].dealerEstourou, 'estourou');
  igual(jogadorDe(sala, 'p2').fichas, 10500, 'João recebeu');
  igual(jogadorDe(sala, 'p3').fichas, 10500, 'Pedro recebeu');
});

teste('Tempo do crupiê acabou: o dealer termina pela regra da casa', () => {
  // Dealer 12 e o crupiê some. Pela regra: compra 3 (15), compra 4 (19), para.
  const sala = salaComCrupie('9♥ 7♠ 10♠ 9♣ 6♦ 2♦ 3♣ 4♥');
  ateAVezDoCrupie(sala);
  tique(sala, sala.prazo + 1);
  igual(sala.status, STATUS_SALA.RESULTADO, 'mesa andou');
  igual(sala.historico[0].dealer, 19, 'comprou até passar de 16');
});

teste('Quem não é o crupiê não joga a vez do dealer', () => {
  const sala = salaComCrupie('9♥ 7♠ 10♠ 9♣ 6♦ 2♦');
  ateAVezDoCrupie(sala);
  igual(erroDe(() => agir(sala, 'p2', ACOES.PEDIR, 5500)), 'fora-da-vez');
});

teste('Banca da casa: o crupiê não ganha, não perde e fica fora do ranking', () => {
  const sala = salaComCrupie('9♥ 7♠ 10♠ 9♣ 6♦ 2♦');
  ateAVezDoCrupie(sala);
  agir(sala, 'p1', ACOES.PARAR, 5500);
  igual(jogadorDe(sala, 'p1').fichas, 10000, 'fichas do crupiê intactas');
  verdade(ranking(sala).every((l) => l.id !== 'p1'), 'fora do ranking');
  igual(ranking(sala).length, 2, 'só os dois apostadores');
});

teste('Com a opção ligada e ninguém no lugar, o dealer é o automático', () => {
  // Três apostadores aqui: baralho embaralhado, e não cartas contadas.
  const sala = salaComCrupie();
  assumirCrupie(sala, 'p1', false);
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p1', 500, 5050);
  apostar(sala, 'p2', 500, 5100);
  apostar(sala, 'p3', 500, 5200);
  let guarda = 0;
  while (sala.status === STATUS_SALA.TURNO_JOGADORES && guarda++ < 10) {
    agir(sala, sala.vezDe, ACOES.PARAR, 5300 + guarda);
  }
  igual(sala.status, STATUS_SALA.RESULTADO, 'dealer jogou sozinho');
});

teste('Crupiê que sai no meio da vez dele não trava a mesa', () => {
  const sala = salaComCrupie('9♥ 7♠ 10♠ 9♣ 6♦ 2♦ 3♣ 4♥');
  ateAVezDoCrupie(sala);
  sair(sala, 'p1', 5500);
  igual(sala.status, STATUS_SALA.RESULTADO, 'rodada fechou');
  igual(sala.historico[0].dealer, 19, 'pela regra da casa');
  igual(sala.hostId, 'p2', 'o comando passou adiante');
  igual(sala.crupieId, null, 'lugar vago');
});

teste('Se todo mundo estourou, o crupiê nem chega a jogar', () => {
  // João 16 + K, Pedro 15 + Q: os dois estouram.
  const sala = salaComCrupie('10♥ 10♣ 9♠ 6♣ 5♦ 7♦ K♥ Q♦');
  iniciar(sala, 'p1', 5000);
  apostar(sala, 'p2', 500, 5100);
  apostar(sala, 'p3', 500, 5200);
  agir(sala, 'p2', ACOES.PEDIR, 5300);
  agir(sala, 'p3', ACOES.PEDIR, 5400);
  igual(sala.status, STATUS_SALA.RESULTADO, 'direto para o resultado');
  igual(sala.dealer.cartas.length, 2, 'dealer não comprou');
});

teste('A visão diz quem é o crupiê', () => {
  const sala = salaComCrupie();
  const visao = visaoPara(sala, 'p2');
  igual(visao.crupieId, 'p1');
  igual(visao.jogadores.find((j) => j.id === 'p1').crupie, true);
  igual(visao.jogadores.find((j) => j.id === 'p2').crupie, false);
});

// ------------------------------------------------------- dealer joga para ganhar

teste('Dealer da mesa cheia faz a conta antes de pedir', () => {
  const parada = (texto, aposta = 100) => ({ maos: [{ cartas: cartas(texto), status: STATUS_MAO.STAND, aposta }] });
  const estourada = (texto) => ({ maos: [{ cartas: cartas(texto), status: STATUS_MAO.BUST, aposta: 100 }] });
  const bj = { maos: [{ cartas: cartas('A♠ K♠'), status: STATUS_MAO.BLACKJACK, aposta: 100 }] };

  verdade(!dealerDevePedir(cartas('10♦ 8♣'), [parada('10♠ 7♥'), parada('K♠ Q♥')]),
    '18 contra 17 e 20 de apostas iguais: empata parado, pedir quase sempre estoura; para');
  verdade(dealerDevePedir(cartas('10♦ 8♣'), [parada('10♠ 7♥', 100), parada('K♠ Q♥', 5000)]),
    '18 contra 17 (100) e 20 (5000): a aposta grande está na frente; pede');
  verdade(dealerDevePedir(cartas('10♦ 8♣'), [parada('K♠ Q♥')]),
    'sozinho contra um 20: parado perde certo, pedir é melhor');
  verdade(!dealerDevePedir(cartas('10♦ 8♣'), [parada('10♠ 7♥'), parada('9♠ 9♥')]),
    '18 contra 17 e 18: não perde para ninguém, para');
  verdade(!dealerDevePedir(cartas('10♦ 8♣'), [estourada('K♠ Q♥ 5♣'), bj]),
    'estouro e blackjack não fazem o dealer pedir');
  verdade(dealerDevePedir(cartas('10♦ 6♣'), [estourada('K♠ Q♥ 5♣')]), 'com 16 sempre pede');
  verdade(!dealerDevePedir(cartas('10♦ 5♣ 6♠'), [parada('10♠ Q♥')]), 'com 21 nunca pede');
});
