// Cartas e shoe. Puro: sem DOM, sem estado global. O gerador de números pode
// ser injetado (testes usam um semeado; o jogo usa crypto).

import { NUM_BARALHOS, PENETRACAO } from './regras.js';

export const NAIPES = ['♠', '♥', '♦', '♣'];
export const VALORES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function pontos(carta) {
  if (carta.valor === 'A') return 11;
  if (carta.valor === 'J' || carta.valor === 'Q' || carta.valor === 'K') return 10;
  return Number(carta.valor);
}

export function carta(texto) {
  // 'A♠' -> { valor: 'A', naipe: '♠' }; '10♥' -> { valor: '10', naipe: '♥' }
  const naipe = texto.slice(-1);
  const valor = texto.slice(0, -1);
  if (!NAIPES.includes(naipe) || !VALORES.includes(valor)) throw new Error(`Carta inválida: ${texto}`);
  return { valor, naipe };
}

export function cartas(texto) {
  return texto.trim().split(/\s+/).map(carta);
}

export function rngSeguro() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}

export function rngSemeado(semente) {
  // mulberry32 — determinístico, só para testes e simulações.
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function baralhoNovo() {
  const lista = [];
  for (const naipe of NAIPES) for (const valor of VALORES) lista.push({ valor, naipe });
  return lista;
}

export function embaralhar(lista, rng) {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

export function criarShoe({ baralhos = NUM_BARALHOS, rng = rngSeguro } = {}) {
  const lista = [];
  for (let b = 0; b < baralhos; b++) lista.push(...baralhoNovo());
  embaralhar(lista, rng);
  return {
    cartas: lista,
    indice: 0,
    cortada: Math.floor(lista.length * PENETRACAO),
    baralhos,
    rng,
    embaralhamentos: 1,
    fixo: false,
  };
}

// Shoe com ordem conhecida, para testes. Nunca reembaralha: se acabar, é erro.
export function criarShoeFixo(lista) {
  return { cartas: lista.slice(), indice: 0, cortada: Infinity, baralhos: 0, rng: null, embaralhamentos: 0, fixo: true };
}

export function precisaEmbaralhar(shoe) {
  return shoe.indice >= shoe.cortada;
}

export function reembaralhar(shoe) {
  const novo = criarShoe({ baralhos: shoe.baralhos, rng: shoe.rng });
  novo.embaralhamentos = shoe.embaralhamentos + 1;
  Object.assign(shoe, novo);
  return shoe;
}

export function comprar(shoe) {
  if (shoe.indice >= shoe.cartas.length) {
    if (shoe.fixo) throw new Error('Shoe fixo acabou');
    reembaralhar(shoe); // segurança: nunca deixa a rodada sem carta
  }
  return shoe.cartas[shoe.indice++];
}

export function restantes(shoe) {
  return shoe.cartas.length - shoe.indice;
}
