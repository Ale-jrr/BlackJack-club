// Perfil do jogador: saldo, XP, estatísticas, histórico, missões, conquistas
// e bônus. É o único módulo que fala com o armazenamento do navegador.

import { BONUS_RECUPERACAO, MESAS, SALDO_INICIAL, STATUS_MAO } from '../motor/regras.js';
import {
  BONUS_DIARIO, CONQUISTAS, MISSOES_DIARIAS, MISSOES_SEMANAIS,
  NIVEL_MAXIMO, xpDaRodada, xpDoNivel,
} from './progressao.js';

const CHAVE = 'blackjack-club:perfil:v1';
const MAX_HISTORICO = 200;

export function estatisticasZeradas() {
  return {
    rodadas: 0, maos: 0, vitorias: 0, derrotas: 0, empates: 0,
    blackjacks: 0, busts: 0, splits: 0, doubles: 0, doublesVencedores: 0,
    surrenders: 0, vinteUns: 0, segurosGanhos: 0,
    maiorAposta: 0, maiorVitoria: 0, maiorSaldo: SALDO_INICIAL,
    totalApostado: 0, totalGanho: 0,
    sequencia: 0, maiorSequencia: 0,
  };
}

export function perfilNovo(nome = 'Jogador') {
  return {
    versao: 1,
    nome,
    avatar: '🂡',
    criadoEm: hoje(),
    saldo: SALDO_INICIAL,
    xp: 0,
    nivel: 1,
    mesaId: 'iniciante',
    estatisticas: estatisticasZeradas(),
    historico: [],
    conquistas: [],
    missoes: { dia: null, semana: null, diarias: [], semanais: [] },
    bonusDiario: { ultimoDia: null, ciclo: 0 },
    recuperacao: { ultimoEm: 0 },
    tutorialVisto: false,
    som: { musica: true, efeitos: true },
  };
}

export function hoje(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function semanaDe(d = new Date()) {
  // Semana ISO: a quinta-feira da semana decide o ano e o número.
  const data = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const diaSemana = data.getUTCDay() || 7;
  data.setUTCDate(data.getUTCDate() + 4 - diaSemana);
  const inicioAno = new Date(Date.UTC(data.getUTCFullYear(), 0, 1));
  const numero = Math.ceil(((data - inicioAno) / 86400000 + 1) / 7);
  return `${data.getUTCFullYear()}-S${String(numero).padStart(2, '0')}`;
}

// ------------------------------------------------------------ persistência

export function carregar() {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return perfilNovo();
    const salvo = JSON.parse(cru);
    const perfil = { ...perfilNovo(salvo.nome ?? 'Jogador'), ...salvo };
    perfil.estatisticas = { ...estatisticasZeradas(), ...(salvo.estatisticas ?? {}) };
    return perfil;
  } catch {
    return perfilNovo();
  }
}

export function salvar(perfil) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(perfil));
  } catch {
    // Sem armazenamento (aba anônima, cota cheia): o jogo continua na memória.
  }
}

export function apagar() {
  try { localStorage.removeItem(CHAVE); } catch { /* idem */ }
}

// -------------------------------------------------------------- nível e XP

export function faltaParaSubir(perfil) {
  return xpDoNivel(perfil.nivel);
}

export function darXP(perfil, quanto) {
  const subiu = [];
  perfil.xp += quanto;
  while (perfil.nivel < NIVEL_MAXIMO && perfil.xp >= xpDoNivel(perfil.nivel)) {
    perfil.xp -= xpDoNivel(perfil.nivel);
    perfil.nivel++;
    subiu.push(perfil.nivel);
  }
  if (perfil.nivel >= NIVEL_MAXIMO) perfil.xp = Math.min(perfil.xp, xpDoNivel(NIVEL_MAXIMO));
  return subiu;
}

// ----------------------------------------------------------- fim de rodada

export function resumoDaRodada(resultado) {
  const r = {
    maos: resultado.maos.length,
    vitorias: 0, derrotas: 0, empates: 0,
    blackjacks: 0, busts: 0, splits: 0, doubles: 0, doublesVencedores: 0,
    surrenders: 0, vinteUns: 0,
    apostado: resultado.apostado,
    devolvido: resultado.devolvido,
    lucro: resultado.lucro,
    maiorAposta: 0,
    seguroGanho: resultado.seguro.pago > 0 ? 1 : 0,
    sequencia: 0,
  };
  for (const m of resultado.maos) {
    if (m.resultado === STATUS_MAO.WIN) r.vitorias++;
    else if (m.resultado === STATUS_MAO.PUSH) r.empates++;
    else r.derrotas++;

    if (m.status === STATUS_MAO.BLACKJACK) r.blackjacks++;
    if (m.status === STATUS_MAO.BUST) r.busts++;
    if (m.status === STATUS_MAO.SURRENDER) r.surrenders++;
    if (m.deSplit) r.splits++;
    if (m.dobrada) {
      r.doubles++;
      if (m.resultado === STATUS_MAO.WIN) r.doublesVencedores++;
    }
    if (m.valor === 21 && m.status !== STATUS_MAO.BUST) r.vinteUns++;
    r.maiorAposta = Math.max(r.maiorAposta, m.aposta);
  }
  // Split conta como um split por rodada, não uma por mão gerada.
  r.splits = r.splits > 0 ? 1 : 0;
  return r;
}

// Recebe o `resultado` do motor e o saldo já pago por ele. Devolve o que a
// interface precisa anunciar: XP ganho, níveis, missões e conquistas.
export function registrarRodada(perfil, resultado, saldoDepois) {
  const r = resumoDaRodada(resultado);
  const e = perfil.estatisticas;

  if (r.lucro > 0) e.sequencia++;
  else if (r.lucro < 0) e.sequencia = 0;
  e.maiorSequencia = Math.max(e.maiorSequencia, e.sequencia);
  r.sequencia = e.sequencia;

  e.rodadas++;
  e.maos += r.maos;
  e.vitorias += r.vitorias;
  e.derrotas += r.derrotas;
  e.empates += r.empates;
  e.blackjacks += r.blackjacks;
  e.busts += r.busts;
  e.splits += r.splits;
  e.doubles += r.doubles;
  e.doublesVencedores += r.doublesVencedores;
  e.surrenders += r.surrenders;
  e.vinteUns += r.vinteUns;
  e.segurosGanhos += r.seguroGanho;
  e.totalApostado += r.apostado;
  e.totalGanho += Math.max(0, r.lucro);
  e.maiorAposta = Math.max(e.maiorAposta, r.maiorAposta);
  e.maiorVitoria = Math.max(e.maiorVitoria, r.lucro);

  perfil.saldo = saldoDepois;
  e.maiorSaldo = Math.max(e.maiorSaldo, perfil.saldo);

  const ganhoXP = xpDaRodada(r);
  const niveis = darXP(perfil, ganhoXP);

  const missoes = avancarMissoes(perfil, r);
  const conquistas = conferirConquistas(perfil);

  const premio = missoes.reduce((t, m) => t + m.premio, 0)
               + conquistas.reduce((t, c) => t + c.premio, 0);
  if (premio > 0) {
    perfil.saldo += premio;
    e.maiorSaldo = Math.max(e.maiorSaldo, perfil.saldo);
  }

  perfil.historico.unshift(linhaDoHistorico(resultado, r));
  if (perfil.historico.length > MAX_HISTORICO) perfil.historico.length = MAX_HISTORICO;

  salvar(perfil);
  return { resumo: r, ganhoXP, niveis, missoes, conquistas, premio };
}

function linhaDoHistorico(resultado, r) {
  let rotulo = 'DERROTA';
  if (r.blackjacks > 0 && r.lucro > 0) rotulo = 'BLACKJACK';
  else if (r.lucro > 0) rotulo = 'VITÓRIA';
  else if (r.lucro === 0) rotulo = 'EMPATE';
  else if (r.surrenders === r.maos && r.maos > 0) rotulo = 'DESISTÊNCIA';

  return {
    numero: resultado.numero,
    quando: Date.now(),
    aposta: resultado.apostado,
    lucro: resultado.lucro,
    rotulo,
    jogador: resultado.maos.map((m) => m.cartas.map((c) => c.valor + c.naipe).join(' ')),
    dealer: resultado.dealerCartas.map((c) => c.valor + c.naipe).join(' '),
    valorDealer: resultado.dealer,
  };
}

// ---------------------------------------------------------------- missões

function sorteioDoDia(dia, quantidade) {
  // Mesmo dia, mesmas missões — sem precisar guardar sorteio nenhum.
  let semente = 0;
  for (const ch of dia) semente = (semente * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = MISSOES_DIARIAS.slice();
  const escolhidas = [];
  while (escolhidas.length < quantidade && pool.length) {
    semente = (semente * 1103515245 + 12345) >>> 0;
    escolhidas.push(pool.splice(semente % pool.length, 1)[0]);
  }
  return escolhidas;
}

export function garantirMissoes(perfil, agora = new Date()) {
  const dia = hoje(agora);
  const semana = semanaDe(agora);
  let mudou = false;

  if (perfil.missoes.dia !== dia) {
    perfil.missoes.dia = dia;
    perfil.missoes.diarias = sorteioDoDia(dia, 3)
      .map((m) => ({ id: m.id, feito: 0, resgatada: false }));
    mudou = true;
  }
  if (perfil.missoes.semana !== semana) {
    perfil.missoes.semana = semana;
    perfil.missoes.semanais = MISSOES_SEMANAIS
      .map((m) => ({ id: m.id, feito: 0, resgatada: false }));
    mudou = true;
  }
  if (mudou) salvar(perfil);
  return perfil.missoes;
}

export function definicaoDaMissao(id) {
  return MISSOES_DIARIAS.find((m) => m.id === id) ?? MISSOES_SEMANAIS.find((m) => m.id === id);
}

function avancarMissoes(perfil, resumo) {
  garantirMissoes(perfil);
  const concluidas = [];
  for (const lista of [perfil.missoes.diarias, perfil.missoes.semanais]) {
    for (const item of lista) {
      const def = definicaoDaMissao(item.id);
      if (!def || item.resgatada) continue;
      const antes = item.feito;
      item.feito = Math.min(def.alvo, item.feito + def.progresso(resumo));
      if (antes < def.alvo && item.feito >= def.alvo) {
        item.resgatada = true;
        concluidas.push({ id: def.id, texto: def.texto, premio: def.premio });
      }
    }
  }
  return concluidas;
}

export function missoesParaTela(perfil) {
  garantirMissoes(perfil);
  const monta = (lista) => lista.map((item) => {
    const def = definicaoDaMissao(item.id);
    return {
      id: item.id, texto: def?.texto ?? item.id, alvo: def?.alvo ?? 1,
      premio: def?.premio ?? 0, feito: item.feito, pronta: item.resgatada,
    };
  });
  return { diarias: monta(perfil.missoes.diarias), semanais: monta(perfil.missoes.semanais) };
}

// -------------------------------------------------------------- conquistas

function conferirConquistas(perfil) {
  const novas = [];
  for (const c of CONQUISTAS) {
    if (perfil.conquistas.includes(c.id)) continue;
    if (c.alcancada(perfil.estatisticas)) {
      perfil.conquistas.push(c.id);
      novas.push({ id: c.id, nome: c.nome, premio: c.premio });
    }
  }
  return novas;
}

export function conquistasParaTela(perfil) {
  return CONQUISTAS.map((c) => ({
    id: c.id, nome: c.nome, premio: c.premio,
    feita: perfil.conquistas.includes(c.id),
  }));
}

// ------------------------------------------------------------------ bônus

export function bonusDisponivel(perfil, agora = new Date()) {
  return perfil.bonusDiario.ultimoDia !== hoje(agora);
}

export function valorDoBonus(perfil) {
  return BONUS_DIARIO[perfil.bonusDiario.ciclo % BONUS_DIARIO.length];
}

export function resgatarBonus(perfil, agora = new Date()) {
  if (!bonusDisponivel(perfil, agora)) return 0;
  const valor = valorDoBonus(perfil);
  perfil.saldo += valor;
  perfil.bonusDiario.ultimoDia = hoje(agora);
  perfil.bonusDiario.ciclo = (perfil.bonusDiario.ciclo + 1) % BONUS_DIARIO.length;
  perfil.estatisticas.maiorSaldo = Math.max(perfil.estatisticas.maiorSaldo, perfil.saldo);
  salvar(perfil);
  return valor;
}

// Ajuda de quem zerou (§26): só quando o saldo não paga nem a menor aposta.
export function precisaRecuperacao(perfil) {
  const menor = Math.min(...MESAS.map((m) => m.min));
  return perfil.saldo < menor;
}

export function esperaRecuperacao(perfil, agora = Date.now()) {
  const falta = BONUS_RECUPERACAO.intervaloMs - (agora - perfil.recuperacao.ultimoEm);
  return Math.max(0, falta);
}

export function resgatarRecuperacao(perfil, agora = Date.now()) {
  if (!precisaRecuperacao(perfil) || esperaRecuperacao(perfil, agora) > 0) return 0;
  perfil.saldo += BONUS_RECUPERACAO.valor;
  perfil.recuperacao.ultimoEm = agora;
  salvar(perfil);
  return BONUS_RECUPERACAO.valor;
}

// ---------------------------------------------------------------- resumos

export function winRate(e) {
  const decididas = e.vitorias + e.derrotas + e.empates;
  return decididas === 0 ? 0 : e.vitorias / decididas;
}
