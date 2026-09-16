// Tabelas de progresso: XP, níveis, missões, conquistas e bônus diário.
// Todo número de progressão mora aqui — quem mexe em balanço mexe neste arquivo.

export const NIVEL_MAXIMO = 100;

// O exemplo do projeto é "Nível 12 — 2.450 / 3.000 XP", então cada nível custa
// 250 × o número do nível.
export function xpDoNivel(nivel) {
  return 250 * Math.min(nivel, NIVEL_MAXIMO);
}

export function xpTotalAte(nivel) {
  let total = 0;
  for (let n = 1; n < nivel; n++) total += xpDoNivel(n);
  return total;
}

export const XP = {
  rodada: 5,
  vitoria: 10,
  blackjack: 20,
  doubleVencedor: 20,
  sequencia: 5,      // por vitória a partir da terceira seguida
};

export function xpDaRodada(resumo) {
  let ganho = XP.rodada;
  if (resumo.vitorias > 0) ganho += XP.vitoria * resumo.vitorias;
  if (resumo.blackjacks > 0) ganho += XP.blackjack * resumo.blackjacks;
  if (resumo.doublesVencedores > 0) ganho += XP.doubleVencedor * resumo.doublesVencedores;
  if (resumo.sequencia >= 3) ganho += XP.sequencia * (resumo.sequencia - 2);
  return ganho;
}

export const BONUS_DIARIO = [500, 750, 1000, 1250, 1500, 2000, 5000];

// --------------------------------------------------------------- missões

// `progresso(resumo)` devolve quanto a rodada somou naquela missão.
export const MISSOES_DIARIAS = [
  { id: 'd-vitorias',   texto: 'Ganhe 3 rodadas',     alvo: 3,  premio: 1500, progresso: (r) => (r.vitorias > 0 ? 1 : 0) },
  { id: 'd-blackjack',  texto: 'Consiga um Blackjack', alvo: 1,  premio: 2000, progresso: (r) => r.blackjacks },
  { id: 'd-double',     texto: 'Faça um Double',       alvo: 1,  premio: 1000, progresso: (r) => r.doubles },
  { id: 'd-maos',       texto: 'Jogue 10 mãos',        alvo: 10, premio: 1200, progresso: (r) => r.maos },
  { id: 'd-vinteum',    texto: 'Consiga 21',           alvo: 1,  premio: 1000, progresso: (r) => r.vinteUns },
  { id: 'd-split',      texto: 'Faça um Split',        alvo: 1,  premio: 1000, progresso: (r) => r.splits },
];

export const MISSOES_SEMANAIS = [
  { id: 's-maos',       texto: 'Jogue 100 mãos',       alvo: 100,   premio: 10000, progresso: (r) => r.maos },
  { id: 's-vitorias',   texto: 'Ganhe 30 partidas',    alvo: 30,    premio: 12000, progresso: (r) => r.vitorias },
  { id: 's-blackjacks', texto: 'Faça 10 Blackjacks',   alvo: 10,    premio: 15000, progresso: (r) => r.blackjacks },
  { id: 's-fichas',     texto: 'Ganhe 25.000 fichas',  alvo: 25000, premio: 20000, progresso: (r) => Math.max(0, r.lucro) },
];

// --------------------------------------------------------------- conquistas

// `alcancada(e)` lê as estatísticas acumuladas do perfil.
export const CONQUISTAS = [
  { id: 'primeira-vitoria', nome: 'Primeira vitória',     premio: 500,   alcancada: (e) => e.vitorias >= 1 },
  { id: 'primeiro-bj',      nome: 'Primeiro Blackjack',   premio: 1000,  alcancada: (e) => e.blackjacks >= 1 },
  { id: 'primeiro-split',   nome: 'Primeiro Split',       premio: 750,   alcancada: (e) => e.splits >= 1 },
  { id: 'double-perfeito',  nome: 'Double perfeito',      premio: 1500,  alcancada: (e) => e.doublesVencedores >= 1 },
  { id: 'cem-vitorias',     nome: '100 vitórias',         premio: 5000,  alcancada: (e) => e.vitorias >= 100 },
  { id: 'mil-maos',         nome: '1.000 mãos jogadas',   premio: 8000,  alcancada: (e) => e.maos >= 1000 },
  { id: 'sequencia-5',      nome: '5 vitórias seguidas',  premio: 2000,  alcancada: (e) => e.maiorSequencia >= 5 },
  { id: 'sequencia-10',     nome: '10 vitórias seguidas', premio: 6000,  alcancada: (e) => e.maiorSequencia >= 10 },
  { id: 'saldo-100k',       nome: 'Saldo de 100.000',     premio: 10000, alcancada: (e) => e.maiorSaldo >= 100000 },
  { id: 'saldo-1m',         nome: 'Saldo de 1.000.000',   premio: 50000, alcancada: (e) => e.maiorSaldo >= 1000000 },
];
