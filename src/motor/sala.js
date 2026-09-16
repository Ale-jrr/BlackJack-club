// Sala do modo "jogar com amigos": vários jogadores, um dealer só, jogando
// um por vez na ordem dos assentos.
//
// Este módulo roda no servidor (Edge Function). O navegador só o importa para
// entender o estado que recebe — quem decide carta, ficha e tempo é o servidor.
// As regras de mão vêm de `assento.js`, as mesmas da carreira.
//
// Tudo aqui é função pura sobre o estado: entra sala, sai sala. Sem relógio
// próprio (o tempo chega como `agora`), sem rede, sem armazenamento.

import { criarShoe, precisaEmbaralhar, reembaralhar, comprar } from './baralho.js';
import {
  acoesDaMao, avancarMao, executarNoAssento, marcarBlackjack, novaMao,
  precisaDoDealer, resolverAssento, resumoDoDealer,
} from './assento.js';
import { valorDaMao } from './mao.js';
import { ACOES, STATUS_MAO } from './regras.js';

export const STATUS_SALA = Object.freeze({
  LOBBY: 'LOBBY',
  APOSTAS: 'APOSTAS',
  TURNO_JOGADORES: 'TURNO_JOGADORES',
  TURNO_DEALER: 'TURNO_DEALER',
  RESULTADO: 'RESULTADO',
  PARTIDA_FINALIZADA: 'PARTIDA_FINALIZADA',
});

export const LIMITES = Object.freeze({
  jogadores: { min: 2, max: 10 },
  tempoAposta: { min: 5, max: 120, padrao: 20 },
  tempoTurno: { min: 5, max: 120, padrao: 15 },
  fichas: { min: 100, max: 100000000 },
  rodadas: { min: 1, max: 500 },
});

export const PAUSA_RESULTADO = 6;   // segundos entre o resultado e a próxima rodada

// Sem I, O, 0 e 1: código é para ler em voz alta e digitar errado o mínimo.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function gerarCodigo(sorteio = Math.random) {
  let codigo = '';
  for (let i = 0; i < 6; i++) codigo += ALFABETO[Math.floor(sorteio() * ALFABETO.length)];
  return codigo;
}

class ErroDeSala extends Error {
  constructor(motivo, mensagem) {
    super(mensagem);
    this.motivo = motivo;
  }
}

function recusar(motivo, mensagem) {
  throw new ErroDeSala(motivo, mensagem);
}

// ------------------------------------------------------------ configuração

export function normalizarConfig(bruta = {}) {
  const inteiro = (valor, padrao) => {
    const n = Math.floor(Number(valor));
    return Number.isFinite(n) ? n : padrao;
  };
  const entre = (n, { min, max }) => Math.min(max, Math.max(min, n));

  const config = {
    maxJogadores: entre(inteiro(bruta.maxJogadores, 6), LIMITES.jogadores),
    fichasIniciais: entre(inteiro(bruta.fichasIniciais, 10000), LIMITES.fichas),
    apostaMin: Math.max(1, inteiro(bruta.apostaMin, 500)),
    apostaMax: Math.max(1, inteiro(bruta.apostaMax, 10000)),
    limiteRodadas: bruta.limiteRodadas === null || bruta.limiteRodadas === 'ilimitado'
      ? null
      : entre(inteiro(bruta.limiteRodadas, 10), LIMITES.rodadas),
    tempoAposta: entre(inteiro(bruta.tempoAposta, LIMITES.tempoAposta.padrao), LIMITES.tempoAposta),
    tempoTurno: entre(inteiro(bruta.tempoTurno, LIMITES.tempoTurno.padrao), LIMITES.tempoTurno),
    publica: Boolean(bruta.publica),
    permitirRecompra: Boolean(bruta.permitirRecompra),
    permitirEntradaDurante: Boolean(bruta.permitirEntradaDurante),
    permitirDesistir: bruta.permitirDesistir !== false,
  };

  // §45: a aposta mínima não pode ser maior que o saldo com que todo mundo começa,
  // senão a sala nasce impossível de jogar.
  config.apostaMin = Math.min(config.apostaMin, config.fichasIniciais);
  config.apostaMax = Math.max(config.apostaMax, config.apostaMin);
  return config;
}

export function problemasNaConfig(bruta = {}) {
  const problemas = [];
  const n = (v) => Math.floor(Number(v));
  if (!(n(bruta.fichasIniciais) >= LIMITES.fichas.min)) {
    problemas.push(`As fichas iniciais precisam ser pelo menos ${LIMITES.fichas.min}.`);
  }
  if (n(bruta.apostaMin) > n(bruta.fichasIniciais)) {
    problemas.push('A aposta mínima não pode passar das fichas iniciais.');
  }
  if (n(bruta.apostaMax) < n(bruta.apostaMin)) {
    problemas.push('A aposta máxima não pode ser menor que a mínima.');
  }
  if (n(bruta.maxJogadores) < LIMITES.jogadores.min || n(bruta.maxJogadores) > LIMITES.jogadores.max) {
    problemas.push(`A sala aceita de ${LIMITES.jogadores.min} a ${LIMITES.jogadores.max} jogadores.`);
  }
  return problemas;
}

// ------------------------------------------------------------------- sala

function novoJogador({ id, nome, avatar, fichas, agora, espectador = false }) {
  return {
    id,
    nome: String(nome ?? 'Jogador').trim().slice(0, 18) || 'Jogador',
    avatar: avatar ?? '🂡',
    fichas,
    // O jogador É um assento (`assento.js` mexe em maos/maoAtual/fichas).
    maos: [],
    maoAtual: 0,
    apostaPendente: 0,
    pronto: false,
    conectado: true,
    espectador,
    entrouEm: agora,
    fichasIniciaisRecebidas: fichas,
    estatisticas: { rodadas: 0, vitorias: 0, derrotas: 0, empates: 0, blackjacks: 0, busts: 0 },
  };
}

export function criarSala({
  codigo, nome, host, config: bruta, agora = Date.now(), shoe = criarShoe(),
}) {
  const config = normalizarConfig(bruta);
  const sala = {
    codigo: codigo ?? gerarCodigo(),
    nome: String(nome ?? 'Sala').trim().slice(0, 28) || 'Sala',
    hostId: host.id,
    config,
    status: STATUS_SALA.LOBBY,
    rodada: 0,
    jogadores: [novoJogador({ ...host, fichas: config.fichasIniciais, agora })],
    vezDe: null,
    prazo: null,
    dealer: { cartas: [], revelado: false },
    shoe,
    historico: [],
    criadaEm: agora,
    versao: 1,
  };
  return sala;
}

export function jogadorDe(sala, id) {
  return sala.jogadores.find((j) => j.id === id) ?? null;
}

function exigirJogador(sala, id) {
  const jogador = jogadorDe(sala, id);
  if (!jogador) recusar('sem-assento', 'Você não está nesta sala.');
  return jogador;
}

function exigirHost(sala, id) {
  if (sala.hostId !== id) recusar('sem-permissao', 'Só quem criou a sala pode fazer isso.');
}

export function entrar(sala, { id, nome, avatar, senha }, agora = Date.now()) {
  const jaEsta = jogadorDe(sala, id);
  if (jaEsta) {                       // voltou: a vaga estava reservada (§66)
    jaEsta.conectado = true;
    jaEsta.nome = String(nome ?? jaEsta.nome).trim().slice(0, 18) || jaEsta.nome;
    return sala;
  }
  if (sala.senha && sala.senha !== senha) recusar('senha', 'Senha da sala incorreta.');

  const naMesa = sala.jogadores.filter((j) => !j.espectador).length;
  const emPartida = sala.status !== STATUS_SALA.LOBBY && sala.status !== STATUS_SALA.PARTIDA_FINALIZADA;

  // §64: quem chega com a partida rolando assiste, a não ser que o ADM libere.
  const espectador = (emPartida && !sala.config.permitirEntradaDurante) || naMesa >= sala.config.maxJogadores;
  if (espectador && naMesa >= sala.config.maxJogadores && !emPartida) {
    recusar('sala-cheia', 'A sala está cheia.');
  }

  sala.jogadores.push(novoJogador({
    id, nome, avatar, fichas: espectador ? 0 : sala.config.fichasIniciais, agora, espectador,
  }));
  return sala;
}

export function sair(sala, id, agora = Date.now()) {
  const jogador = jogadorDe(sala, id);
  if (!jogador) return sala;

  const jogando = sala.status === STATUS_SALA.TURNO_JOGADORES && sala.vezDe === id;
  sala.jogadores = sala.jogadores.filter((j) => j.id !== id);

  if (sala.jogadores.length === 0) {
    sala.status = STATUS_SALA.PARTIDA_FINALIZADA;
    return sala;
  }
  // §68: o ADM sair não fecha a sala; assume quem está há mais tempo.
  if (sala.hostId === id) {
    const maisAntigo = [...sala.jogadores].sort((a, b) => a.entrouEm - b.entrouEm)[0];
    sala.hostId = maisAntigo.id;
  }
  if (jogando) passarAVez(sala, agora);
  return sala;
}

export function definirConexao(sala, id, conectado) {
  const jogador = jogadorDe(sala, id);
  if (jogador) jogador.conectado = Boolean(conectado);
  return sala;
}

export function definirPronto(sala, id, valor = true) {
  const jogador = exigirJogador(sala, id);
  if (sala.status !== STATUS_SALA.LOBBY) recusar('fase', 'A partida já começou.');
  jogador.pronto = Boolean(valor);
  return sala;
}

export function ajustarConfig(sala, id, bruta) {
  exigirHost(sala, id);
  // §51: depois que a partida começa, as regras ficam travadas.
  if (sala.status !== STATUS_SALA.LOBBY) recusar('fase', 'As regras travam quando a partida começa.');
  const antes = sala.config;
  sala.config = normalizarConfig({ ...antes, ...bruta });
  for (const j of sala.jogadores) {
    if (!j.espectador) j.fichas = sala.config.fichasIniciais;
  }
  return sala;
}

// --------------------------------------------------------------- partida

export function iniciar(sala, id, agora = Date.now()) {
  exigirHost(sala, id);
  if (sala.status !== STATUS_SALA.LOBBY && sala.status !== STATUS_SALA.PARTIDA_FINALIZADA) {
    recusar('fase', 'A partida já está em andamento.');
  }
  const naMesa = sala.jogadores.filter((j) => !j.espectador);
  if (naMesa.length === 0) recusar('sem-jogadores', 'Ninguém na mesa.');

  sala.rodada = 0;
  sala.historico = [];
  for (const j of sala.jogadores) {
    j.fichas = j.espectador ? 0 : sala.config.fichasIniciais;
    j.fichasIniciaisRecebidas = j.fichas;
    j.estatisticas = { rodadas: 0, vitorias: 0, derrotas: 0, empates: 0, blackjacks: 0, busts: 0 };
  }
  return abrirApostas(sala, agora);
}

function abrirApostas(sala, agora) {
  sala.rodada++;
  sala.status = STATUS_SALA.APOSTAS;
  sala.dealer = { cartas: [], revelado: false };
  sala.vezDe = null;
  sala.prazo = agora + sala.config.tempoAposta * 1000;

  for (const j of sala.jogadores) {
    j.maos = [];
    j.maoAtual = 0;
    j.apostaPendente = 0;
    // Quem entrou no meio vira jogador de verdade na virada da rodada (§64).
    if (j.espectador && sala.config.permitirEntradaDurante
        && sala.jogadores.filter((x) => !x.espectador).length < sala.config.maxJogadores) {
      j.espectador = false;
      j.fichas = sala.config.fichasIniciais;
      j.fichasIniciaisRecebidas = j.fichas;
    }
  }
  return sala;
}

export function podeApostar(sala, jogador) {
  return sala.status === STATUS_SALA.APOSTAS
    && !jogador.espectador
    && jogador.apostaPendente === 0
    && jogador.fichas >= sala.config.apostaMin;
}

export function apostar(sala, id, valor, agora = Date.now()) {
  const jogador = exigirJogador(sala, id);
  if (sala.status !== STATUS_SALA.APOSTAS) recusar('fase', 'Não é hora de apostar.');
  if (jogador.espectador) recusar('espectador', 'Você está assistindo esta partida.');
  if (jogador.apostaPendente > 0) recusar('ja-apostou', 'Sua aposta já está na mesa.');

  const v = Math.floor(Number(valor));
  if (!Number.isFinite(v) || v <= 0) recusar('aposta', 'Aposta inválida.');
  if (v < sala.config.apostaMin) recusar('aposta', `A aposta mínima é ${sala.config.apostaMin}.`);
  if (v > sala.config.apostaMax) recusar('aposta', `A aposta máxima é ${sala.config.apostaMax}.`);
  if (v > jogador.fichas) recusar('fichas', 'Você não tem fichas suficientes.');

  jogador.fichas -= v;
  jogador.apostaPendente = v;

  if (todosApostaram(sala)) return distribuir(sala, agora);
  return sala;
}

function todosApostaram(sala) {
  return sala.jogadores
    .filter((j) => !j.espectador && j.fichas + j.apostaPendente >= sala.config.apostaMin)
    .every((j) => j.apostaPendente > 0);
}

export function recomprar(sala, id) {
  const jogador = exigirJogador(sala, id);
  if (!sala.config.permitirRecompra) recusar('sem-recompra', 'O ADM não liberou recompra nesta sala.');
  if (jogador.espectador) recusar('espectador', 'Você está assistindo esta partida.');
  if (jogador.fichas >= sala.config.apostaMin) recusar('tem-fichas', 'Você ainda tem fichas para jogar.');
  jogador.fichas = sala.config.fichasIniciais;
  return sala;
}

// ---------------------------------------------------------- distribuição

function distribuir(sala, agora) {
  if (precisaEmbaralhar(sala.shoe)) reembaralhar(sala.shoe);

  const naRodada = sala.jogadores.filter((j) => j.apostaPendente > 0);
  if (naRodada.length === 0) return proximaRodada(sala, agora);

  for (const j of naRodada) {
    j.maos = [novaMao(j.apostaPendente)];
    j.maoAtual = 0;
    j.apostaPendente = 0;
  }
  sala.dealer = { cartas: [], revelado: false };

  // Uma carta para cada, uma para o dealer, e de novo — como na mesa de verdade.
  for (const j of naRodada) j.maos[0].cartas.push(comprar(sala.shoe));
  sala.dealer.cartas.push(comprar(sala.shoe));
  for (const j of naRodada) j.maos[0].cartas.push(comprar(sala.shoe));
  sala.dealer.cartas.push(comprar(sala.shoe));

  for (const j of naRodada) marcarBlackjack(j);

  // §20: carta aberta de Ás ou dez manda espiar a escondida.
  const aberta = sala.dealer.cartas[0];
  const espia = aberta.valor === 'A' || ['10', 'J', 'Q', 'K'].includes(aberta.valor);
  if (espia && resumoDoDealer(sala.dealer.cartas).blackjack) {
    for (const j of naRodada) {
      for (const m of j.maos) if (m.status === STATUS_MAO.PLAYING) m.status = STATUS_MAO.STAND;
    }
    return turnoDoDealer(sala, agora);
  }

  sala.status = STATUS_SALA.TURNO_JOGADORES;
  sala.vezDe = null;
  return passarAVez(sala, agora);
}

// ------------------------------------------------------------------ turno

export function jogadoresNaRodada(sala) {
  return sala.jogadores.filter((j) => j.maos.length > 0);
}

function aindaJoga(jogador) {
  return jogador.maos.some((m) => m.status === STATUS_MAO.PLAYING);
}

// Passa para o próximo assento com mão em aberto, na ordem em que sentaram.
function passarAVez(sala, agora) {
  const naRodada = jogadoresNaRodada(sala);
  const atual = sala.vezDe ? naRodada.findIndex((j) => j.id === sala.vezDe) : -1;

  for (let i = atual + 1; i < naRodada.length; i++) {
    if (aindaJoga(naRodada[i])) {
      avancarMao(naRodada[i]);
      sala.vezDe = naRodada[i].id;
      sala.prazo = agora + sala.config.tempoTurno * 1000;
      return sala;
    }
  }
  return turnoDoDealer(sala, agora);
}

export function acoesDe(sala, id) {
  if (sala.status !== STATUS_SALA.TURNO_JOGADORES || sala.vezDe !== id) return [];
  const jogador = jogadorDe(sala, id);
  if (!jogador) return [];
  return acoesDaMao(jogador, { permiteDesistir: sala.config.permitirDesistir });
}

export function agir(sala, id, acao, agora = Date.now()) {
  const jogador = exigirJogador(sala, id);
  if (sala.status !== STATUS_SALA.TURNO_JOGADORES) recusar('fase', 'Não é hora de jogar.');
  if (sala.vezDe !== id) recusar('fora-da-vez', 'Não é a sua vez.');
  if (!acoesDe(sala, id).includes(acao)) recusar('acao', `Ação indisponível: ${acao}`);

  executarNoAssento(jogador, acao, sala.shoe);

  if (avancarMao(jogador) && aindaJoga(jogador)) {
    sala.prazo = agora + sala.config.tempoTurno * 1000;   // mesma vez, outra mão
    return sala;
  }
  return passarAVez(sala, agora);
}

// ----------------------------------------------------------------- dealer

function turnoDoDealer(sala, agora) {
  sala.status = STATUS_SALA.TURNO_DEALER;
  sala.vezDe = null;
  sala.dealer.revelado = true;

  const naRodada = jogadoresNaRodada(sala);
  if (precisaDoDealer(naRodada)) {
    while (valorDaMao(sala.dealer.cartas).total < 17) {
      sala.dealer.cartas.push(comprar(sala.shoe));
    }
  }
  return encerrarRodada(sala, agora);
}

function encerrarRodada(sala, agora) {
  const dealer = resumoDoDealer(sala.dealer.cartas);
  const naRodada = jogadoresNaRodada(sala);
  const linhas = [];

  for (const j of naRodada) {
    const apostado = j.maos.reduce((t, m) => t + m.aposta, 0);
    const devolvido = resolverAssento(j, dealer);
    const lucro = devolvido - apostado;

    const e = j.estatisticas;
    e.rodadas++;
    for (const m of j.maos) {
      if (m.resultado === STATUS_MAO.WIN) e.vitorias++;
      else if (m.resultado === STATUS_MAO.PUSH) e.empates++;
      else e.derrotas++;
      if (m.status === STATUS_MAO.BLACKJACK) e.blackjacks++;
      if (m.status === STATUS_MAO.BUST) e.busts++;
    }

    linhas.push({
      id: j.id,
      nome: j.nome,
      lucro,
      fichas: j.fichas,
      rotulo: j.maos.some((m) => m.status === STATUS_MAO.BLACKJACK && m.resultado === STATUS_MAO.WIN)
        ? 'BLACKJACK'
        : lucro > 0 ? 'VITÓRIA' : lucro === 0 ? 'EMPATE'
        : j.maos.every((m) => m.status === STATUS_MAO.BUST) ? 'ESTOUROU' : 'DERROTA',
    });
  }

  sala.historico.unshift({
    rodada: sala.rodada,
    dealer: dealer.total,
    dealerEstourou: dealer.estourou,
    dealerCartas: sala.dealer.cartas.map((c) => c.valor + c.naipe),
    jogadores: linhas,
  });
  if (sala.historico.length > 100) sala.historico.length = 100;

  sala.status = STATUS_SALA.RESULTADO;
  sala.prazo = agora + PAUSA_RESULTADO * 1000;
  return sala;
}

function acabou(sala) {
  if (sala.config.limiteRodadas === null) return false;
  return sala.rodada >= sala.config.limiteRodadas;
}

function temQuemJogue(sala) {
  return sala.jogadores.some((j) => !j.espectador
    && (j.fichas >= sala.config.apostaMin || sala.config.permitirRecompra));
}

function proximaRodada(sala, agora) {
  if (acabou(sala) || !temQuemJogue(sala)) {
    sala.status = STATUS_SALA.PARTIDA_FINALIZADA;
    sala.vezDe = null;
    sala.prazo = null;
    return sala;
  }
  return abrirApostas(sala, agora);
}

// ------------------------------------------------------------------ tempo

// Chamada por qualquer cliente; quem decide se o prazo venceu é o servidor,
// comparando com o relógio dele. Sem isto uma sala travaria se alguém sumisse.
export function tique(sala, agora = Date.now()) {
  if (!sala.prazo || agora < sala.prazo) return sala;

  if (sala.status === STATUS_SALA.APOSTAS) {
    // §52: quem não apostou fica de fora da rodada, mas continua na sala.
    const apostou = sala.jogadores.some((j) => j.apostaPendente > 0);
    if (!apostou) return proximaRodada(sala, agora);
    return distribuir(sala, agora);
  }

  if (sala.status === STATUS_SALA.TURNO_JOGADORES) {
    // §56: tempo esgotado é sempre PARAR, nunca PEDIR.
    const jogador = jogadorDe(sala, sala.vezDe);
    if (!jogador) return passarAVez(sala, agora);
    for (const m of jogador.maos) {
      if (m.status === STATUS_MAO.PLAYING) m.status = STATUS_MAO.STAND;
    }
    return passarAVez(sala, agora);
  }

  if (sala.status === STATUS_SALA.RESULTADO) return proximaRodada(sala, agora);

  return sala;
}

// --------------------------------------------------------------- ranking

export function ranking(sala) {
  return sala.jogadores
    .filter((j) => !j.espectador)
    .map((j) => ({
      id: j.id, nome: j.nome, avatar: j.avatar, fichas: j.fichas,
      lucro: j.fichas - j.fichasIniciaisRecebidas,
      estatisticas: j.estatisticas,
    }))
    .sort((a, b) => b.fichas - a.fichas)
    .map((linha, i, lista) => ({
      ...linha,
      // §62: mesmo saldo, mesma posição. Sem desempate inventado.
      // A posição olha as FICHAS do vizinho de cima, nunca a posição dele —
      // dentro do map o vizinho ainda não tem posição nenhuma.
      posicao: primeiroComEssasFichas(lista, linha.fichas, i) + 1,
    }));
}

function primeiroComEssasFichas(lista, fichas, ate) {
  for (let i = 0; i <= ate; i++) if (lista[i].fichas === fichas) return i;
  return ate;
}

export function campeoes(sala) {
  const lista = ranking(sala);
  if (lista.length === 0) return [];
  return lista.filter((j) => j.fichas === lista[0].fichas);
}

// ------------------------------------------------------------------ visão

// O que cada jogador pode ver. O shoe nunca sai daqui, e a carta escondida do
// dealer só aparece depois de revelada — é isto que impede ler o resultado
// antes da hora abrindo o navegador.
export function visaoPara(sala, id) {
  const eu = jogadorDe(sala, id);
  return {
    codigo: sala.codigo,
    nome: sala.nome,
    hostId: sala.hostId,
    souHost: sala.hostId === id,
    config: sala.config,
    status: sala.status,
    rodada: sala.rodada,
    limiteRodadas: sala.config.limiteRodadas,
    vezDe: sala.vezDe,
    minhaVez: sala.vezDe === id,
    prazo: sala.prazo,
    cartasNoShoe: sala.shoe.cartas.length - sala.shoe.indice,
    dealer: {
      revelado: sala.dealer.revelado,
      cartas: sala.dealer.revelado
        ? sala.dealer.cartas.slice()
        : sala.dealer.cartas.slice(0, 1),
      valor: sala.dealer.cartas.length
        ? valorDaMao(sala.dealer.revelado ? sala.dealer.cartas : sala.dealer.cartas.slice(0, 1)).total
        : 0,
      escondidas: sala.dealer.revelado ? 0 : Math.max(0, sala.dealer.cartas.length - 1),
    },
    jogadores: sala.jogadores.map((j) => ({
      id: j.id,
      nome: j.nome,
      avatar: j.avatar,
      fichas: j.fichas,
      apostaPendente: j.apostaPendente,
      pronto: j.pronto,
      conectado: j.conectado,
      espectador: j.espectador,
      souEu: j.id === id,
      ehHost: j.id === sala.hostId,
      maos: j.maos.map((m) => ({
        cartas: m.cartas.slice(),
        aposta: m.aposta,
        valor: valorDaMao(m.cartas).total,
        status: m.status,
        resultado: m.resultado,
        pagamento: m.pagamento,
        dobrada: m.dobrada,
        deSplit: m.deSplit,
      })),
      maoAtual: j.maoAtual,
      estatisticas: j.estatisticas,
    })),
    minhasAcoes: eu ? acoesDe(sala, id) : [],
    ranking: ranking(sala),
    historico: sala.historico.slice(0, 20),
    campeoes: sala.status === STATUS_SALA.PARTIDA_FINALIZADA ? campeoes(sala) : [],
    versao: sala.versao,
  };
}

export { ACOES, ErroDeSala };
