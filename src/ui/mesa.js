// Tela da mesa: aposta, cartas, botões e animação da rodada.
//
// A interface nunca decide resultado — ela pergunta ao motor o que é possível
// (`acoesDisponiveis`) e manda a ação. O que existe aqui é só apresentação:
// quantas cartas já apareceram na tela e em que ritmo.

import { criarShoe, restantes } from '../motor/baralho.js';
import { textoValor, valorDaMao } from '../motor/mao.js';
import { ACOES, ESTADOS, FICHAS_RAPIDAS, STATUS_MAO } from '../motor/regras.js';
import {
  acoesDisponiveis, apostar, criarJogo, distribuir, drenarEventos, executar,
  novaRodada, podeApostar, seguroMaximo,
} from '../motor/rodada.js';
import { registrarRodada } from '../dados/perfil.js';
import { elementoCarta } from './cartas.js';
import { som } from './som.js';

const RITMO = 260;      // ms entre uma carta e outra
const PAUSA_DEALER = 420;

let ctx = null;         // { perfil, atualizarTopo, torrada, anuncio, aoTerminarRodada }
let jogo = null;
let mesa = null;
let apostaMontada = 0;
let ocupado = false;
let vista = { dealer: 0, maos: [], revelado: false };
let sessao = { rodadas: 0, lucro: 0, melhor: 0 };

const $ = (id) => document.getElementById(id);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');

export function prepararMesa(contexto) {
  ctx = contexto;
  montarFichas();
  $('btn-limpar').onclick = () => { apostaMontada = 0; som.botao(); pintarControles(); };
  $('btn-repetir').onclick = () => {
    const alvo = jogo?.ultimaAposta || 0;
    if (alvo && alvo <= ctx.perfil.saldo) { apostaMontada = alvo; som.ficha(); pintarControles(); }
  };
  $('btn-dobrar-aposta').onclick = () => {
    const alvo = apostaMontada * 2;
    if (alvo <= ctx.perfil.saldo && alvo <= mesa.max) { apostaMontada = alvo; som.ficha(); pintarControles(); }
  };
}

export function abrirMesa(novaMesa) {
  mesa = novaMesa;
  jogo = criarJogo({ shoe: criarShoe(), saldo: ctx.perfil.saldo, mesa });
  apostaMontada = 0;
  sessao = { rodadas: 0, lucro: 0, melhor: 0 };
  vista = { dealer: 0, maos: [], revelado: false };
  $('titulo-mesa').textContent = `Mesa ${mesa.nome}`;
  $('faixa-regras').textContent = `APOSTA DE ${fmt(mesa.min)} A ${fmt(mesa.max)}`;
  montarFichas();
  desenhar();
}

// A mesa guarda o saldo em `jogo.saldo`; o perfil é a fonte fora da rodada.
function sincronizarSaldo() {
  jogo.saldo = ctx.perfil.saldo;
}

// ------------------------------------------------------------------ fichas

function montarFichas() {
  const caixa = $('fichas');
  caixa.innerHTML = '';
  for (const valor of FICHAS_RAPIDAS) {
    const b = document.createElement('button');
    b.className = `ficha f${valor}`;
    b.dataset.valor = valor;
    b.textContent = valor >= 1000 ? `${valor / 1000}K` : valor;
    b.onclick = () => adicionarFicha(valor);
    caixa.append(b);
  }
}

function adicionarFicha(valor) {
  if (ocupado || jogo.estado !== ESTADOS.AGUARDANDO_APOSTA) return;
  const alvo = apostaMontada + valor;
  if (alvo > ctx.perfil.saldo || alvo > mesa.max) return;
  apostaMontada = alvo;
  som.ficha();
  pintarControles();
}

// ---------------------------------------------------------------- desenho

export function desenhar() {
  pintarDealer();
  pintarMaos();
  pintarControles();
  pintarLateral();
}

function pintarDealer() {
  const caixa = $('cartas-dealer');
  const lista = jogo.dealer.cartas.slice(0, vista.dealer);
  caixa.innerHTML = '';
  lista.forEach((c, i) => {
    const escondida = i === 1 && !vista.revelado;
    caixa.append(elementoCarta(escondida ? null : c, { virada: escondida }));
  });

  const rotulo = $('valor-dealer');
  if (lista.length === 0) { rotulo.textContent = ''; return; }
  if (!vista.revelado) {
    rotulo.innerHTML = `<span class="valor">${textoValor(lista.slice(0, 1))}</span>`;
    return;
  }
  const { total } = valorDaMao(lista);
  const classe = total > 21 ? 'ruim' : total === 21 ? 'bj' : '';
  rotulo.innerHTML = `<span class="valor ${classe}">${total > 21 ? `${total} · ESTOUROU` : textoValor(lista)}</span>`;
}

function pintarMaos() {
  const caixa = $('maos-jogador');
  caixa.innerHTML = '';

  if (jogo.maos.length === 0) return;

  jogo.maos.forEach((mao, i) => {
    const visiveis = mao.cartas.slice(0, vista.maos[i] ?? 0);
    const el = document.createElement('div');
    el.className = 'mao';
    if (jogo.estado === ESTADOS.TURNO_JOGADOR && i === jogo.maoAtual && jogo.maos.length > 1) {
      el.classList.add('ativa');
    }

    const cartas = document.createElement('div');
    cartas.className = 'cartas';
    visiveis.forEach((c) => cartas.append(elementoCarta(c)));

    const info = document.createElement('div');
    info.className = 'info';
    if (visiveis.length) {
      const { total } = valorDaMao(visiveis);
      let classe = '';
      if (mao.status === STATUS_MAO.BLACKJACK && visiveis.length === mao.cartas.length) classe = 'bj';
      else if (total > 21) classe = 'ruim';
      else if (total === 21) classe = 'bom';
      const texto = mao.status === STATUS_MAO.BLACKJACK && visiveis.length === mao.cartas.length
        ? 'BLACKJACK' : (total > 21 ? `${total}` : textoValor(visiveis));
      info.innerHTML = `<span class="valor ${classe}">${texto}</span>`;
      info.innerHTML += `<span class="aposta-na-mesa"><span class="moeda"></span> ${fmt(mao.aposta)}${mao.dobrada ? ' ·2x' : ''}</span>`;
    }

    if (mao.resultado && jogo.estado === ESTADOS.RESULTADO) {
      const etiqueta = document.createElement('span');
      const mapa = {
        [STATUS_MAO.WIN]: ['ganhou', mao.status === STATUS_MAO.BLACKJACK ? 'BLACKJACK' : 'VENCEU'],
        [STATUS_MAO.PUSH]: ['empatou', 'EMPATE'],
        [STATUS_MAO.LOSE]: ['perdeu', mao.status === STATUS_MAO.BUST ? 'ESTOUROU'
          : mao.status === STATUS_MAO.SURRENDER ? 'DESISTIU' : 'PERDEU'],
      };
      const [classe, texto] = mapa[mao.resultado] ?? ['', ''];
      etiqueta.className = `etiqueta ${classe}`;
      etiqueta.textContent = texto;
      info.append(etiqueta);
    }

    el.append(cartas, info);
    caixa.append(el);
  });
}

function botao(texto, classe, aoClicar, { desabilitado = false } = {}) {
  const b = document.createElement('button');
  b.className = `botao ${classe}`;
  b.textContent = texto;
  b.disabled = desabilitado || ocupado;
  b.onclick = aoClicar;
  return b;
}

function pintarControles() {
  const caixa = $('acoes');
  const apostando = jogo.estado === ESTADOS.AGUARDANDO_APOSTA;
  caixa.innerHTML = '';

  $('caixa-aposta').style.display = apostando ? '' : 'none';
  $('fichas').style.display = apostando ? '' : 'none';
  $('valor-aposta').textContent = fmt(apostaMontada);

  for (const f of $('fichas').children) {
    const v = Number(f.dataset.valor);
    f.disabled = ocupado || apostaMontada + v > ctx.perfil.saldo || apostaMontada + v > mesa.max;
  }
  $('btn-repetir').disabled = ocupado || !jogo.ultimaAposta || jogo.ultimaAposta > ctx.perfil.saldo;
  $('btn-dobrar-aposta').disabled = ocupado || apostaMontada === 0
    || apostaMontada * 2 > ctx.perfil.saldo || apostaMontada * 2 > mesa.max;
  $('btn-limpar').disabled = ocupado || apostaMontada === 0;

  if (apostando) {
    const valido = apostaMontada >= mesa.min && apostaMontada <= Math.min(mesa.max, ctx.perfil.saldo);
    caixa.append(botao('DISTRIBUIR', 'ouro largo', comecarRodada, { desabilitado: !valido }));
    $('dica').textContent = apostaMontada === 0
      ? `Escolha as fichas. Mínimo ${fmt(mesa.min)}, máximo ${fmt(mesa.max)}.`
      : (valido ? 'Pronto para distribuir.' : `A aposta precisa ficar entre ${fmt(mesa.min)} e ${fmt(mesa.max)}.`);
    return;
  }

  if (jogo.estado === ESTADOS.RESULTADO) {
    const lucro = jogo.resultado?.lucro ?? 0;
    $('dica').textContent = lucro > 0 ? `Você levou ${fmt(lucro)} fichas.`
      : lucro === 0 ? 'Empate: aposta devolvida.' : `A casa levou ${fmt(-lucro)} fichas.`;
    caixa.append(botao('NOVA RODADA', 'ouro largo', () => {
      novaRodada(jogo);
      apostaMontada = Math.min(jogo.ultimaAposta, ctx.perfil.saldo, mesa.max);
      if (apostaMontada < mesa.min) apostaMontada = 0;
      vista = { dealer: 0, maos: [], revelado: false };
      sincronizarSaldo();
      desenhar();
    }));
    return;
  }

  const disponiveis = ocupado ? [] : acoesDisponiveis(jogo);
  const nomes = {
    [ACOES.PEDIR]: ['PEDIR', 'verde'],
    [ACOES.PARAR]: ['PARAR', 'vermelho'],
    [ACOES.DOBRAR]: ['DOBRAR', ''],
    [ACOES.DIVIDIR]: ['DIVIDIR', ''],
    [ACOES.DESISTIR]: ['DESISTIR', 'discreto'],
    [ACOES.SEGURO]: [`SEGURO (${fmt(seguroMaximo(jogo))})`, 'ouro'],
    [ACOES.RECUSAR_SEGURO]: ['SEM SEGURO', 'discreto'],
  };
  for (const acao of disponiveis) {
    const [texto, classe] = nomes[acao];
    caixa.append(botao(texto, classe, () => agir(acao)));
  }

  if (disponiveis.includes(ACOES.SEGURO)) {
    $('dica').textContent = 'O dealer mostrou um Ás. O seguro paga 2:1 se ele tiver Blackjack.';
  } else if (jogo.maos.length > 1) {
    $('dica').textContent = `Mão ${jogo.maoAtual + 1} de ${jogo.maos.length}.`;
  } else {
    $('dica').textContent = ocupado ? '' : 'Sua vez.';
  }
}

function pintarLateral() {
  const e = ctx.perfil.estatisticas;
  // Uma placa com uma linha por número, não quatro cartões: sobra altura para o histórico.
  const sinal = sessao.lucro > 0 ? 'mais' : sessao.lucro < 0 ? 'menos' : '';
  $('resumo-sessao').innerHTML = [
    ['Rodadas', fmt(sessao.rodadas), ''],
    ['Nesta sessão', `${sessao.lucro > 0 ? '+' : ''}${fmt(sessao.lucro)}`, sinal],
    ['Sequência', fmt(e.sequencia), ''],
    ['Cartas no shoe', fmt(restantes(jogo.shoe)), ''],
  ].map(([r, v, c]) => `<div><span>${r}</span><b class="${c}">${v}</b></div>`).join('');

  $('historico-lateral').innerHTML = ctx.perfil.historico.length
    ? ctx.perfil.historico.slice(0, 25).map(linhaHistorico).join('')
    : '<div class="vazio">Nenhuma rodada ainda.</div>';

  pintarTiras();
}

// Mesmos números da lateral, em pílulas, para quem está no celular.
function pintarTiras() {
  const e = ctx.perfil.estatisticas;
  const sinal = sessao.lucro > 0 ? 'mais' : sessao.lucro < 0 ? 'menos' : '';
  const marcas = ctx.perfil.historico.slice(0, 6).reverse().map((h) => {
    const classe = h.rotulo === 'BLACKJACK' ? 'bj'
      : h.lucro > 0 ? 'ganhou' : h.lucro < 0 ? 'perdeu' : 'empatou';
    return `<i class="marca-res ${classe}" title="${h.rotulo}"></i>`;
  }).join('');

  $('tiras-mesa').innerHTML = `
    <span class="pilula"><b>${fmt(sessao.rodadas)}</b> rodadas</span>
    <span class="pilula ${sinal}"><b>${sessao.lucro > 0 ? '+' : ''}${fmt(sessao.lucro)}</b> na sessão</span>
    <span class="pilula"><b>${fmt(e.sequencia)}</b> seguidas</span>
    <span class="pilula"><b>${fmt(restantes(jogo.shoe))}</b> cartas no shoe</span>
    ${marcas ? `<span class="pilula"><span class="marcas">${marcas}</span></span>` : ''}`;
}

export function linhaHistorico(h) {
  const classe = h.rotulo === 'BLACKJACK' ? 'bj'
    : h.lucro > 0 ? 'ganhou' : h.lucro < 0 ? 'perdeu' : 'empatou';
  const sinal = h.lucro > 0 ? 'mais' : h.lucro < 0 ? 'menos' : '';
  const letra = { bj: 'BJ', ganhou: 'V', perdeu: 'D', empatou: 'E' }[classe];
  return `<div class="linha-hist ${classe}">
      <span class="ficha-res" title="${h.rotulo}">${letra}</span>
      <span>#${h.numero} · ${h.rotulo}</span>
      <span class="lucro ${sinal}">${h.lucro > 0 ? '+' : ''}${fmt(h.lucro)}</span>
      <span class="cartas-txt">Você ${h.jogador.join(' | ')} · Dealer ${h.dealer} (${h.valorDealer})</span>
    </div>`;
}

// ------------------------------------------------------------- animação

function alvoDaVista() {
  return {
    dealer: jogo.dealer.cartas.length,
    maos: jogo.maos.map((m) => m.cartas.length),
    revelado: jogo.dealer.revelado,
  };
}

// Mostra uma carta de cada vez até a tela alcançar o estado do motor.
async function alcancarMotor({ inicial = false } = {}) {
  const alvo = alvoDaVista();
  while (vista.maos.length < alvo.maos.length) vista.maos.push(0);

  if (inicial) {
    // Distribuição: jogador, dealer, jogador, dealer.
    const ordem = [['j', 0], ['d'], ['j', 0], ['d']];
    for (const [quem, i] of ordem) {
      if (quem === 'j') vista.maos[i]++; else vista.dealer++;
      som.carta();
      desenhar();
      await espera(RITMO);
    }
  }

  for (let i = 0; i < alvo.maos.length; i++) {
    while ((vista.maos[i] ?? 0) < alvo.maos[i]) {
      vista.maos[i]++;
      som.carta();
      desenhar();
      await espera(RITMO);
    }
  }

  if (alvo.revelado && !vista.revelado) {
    await espera(PAUSA_DEALER);
    vista.revelado = true;
    som.carta();
    desenhar();
    await espera(PAUSA_DEALER);
  }

  while (vista.dealer < alvo.dealer) {
    vista.dealer++;
    som.carta();
    desenhar();
    await espera(RITMO);
  }
}

// ---------------------------------------------------------------- rodada

async function comecarRodada() {
  if (ocupado) return;
  sincronizarSaldo();
  if (!podeApostar(jogo, apostaMontada)) return;

  ocupado = true;
  apostar(jogo, apostaMontada);
  ctx.perfil.saldo = jogo.saldo;
  ctx.atualizarTopo();
  som.ficha();

  distribuir(jogo);
  const eventos = drenarEventos(jogo);
  if (eventos.some((ev) => ev.tipo === 'embaralhou')) ctx.torrada('Shoe novo embaralhado 🔀');

  vista = { dealer: 0, maos: [0], revelado: false };
  await alcancarMotor({ inicial: true });

  ocupado = false;
  if (jogo.estado === ESTADOS.RESULTADO) await terminarRodada();
  else desenhar();
}

async function agir(acao) {
  if (ocupado) return;
  ocupado = true;
  som.botao();

  const antes = jogo.maos.length;
  executar(jogo, acao);
  const eventos = drenarEventos(jogo);

  if (jogo.maos.length > antes) vista.maos.splice(jogo.maoAtual + 1, 0, 1);
  desenhar();

  await alcancarMotor();

  for (const ev of eventos) {
    if (ev.tipo === 'bust') som.bust();
    if (ev.tipo === 'seguro-feito') ctx.torrada(`Seguro de <span class="moeda"></span> ${fmt(ev.valor)}`);
  }

  ctx.perfil.saldo = jogo.saldo;
  ctx.atualizarTopo();

  ocupado = false;
  if (jogo.estado === ESTADOS.RESULTADO) await terminarRodada();
  else desenhar();
}

async function terminarRodada() {
  const resultado = jogo.resultado;
  drenarEventos(jogo);

  const relatorio = registrarRodada(ctx.perfil, resultado, jogo.saldo);
  jogo.saldo = ctx.perfil.saldo;          // missões e conquistas podem ter pago
  sessao.rodadas++;
  sessao.lucro += resultado.lucro;
  sessao.melhor = Math.max(sessao.melhor, resultado.lucro);

  desenhar();
  ctx.atualizarTopo({ animar: resultado.lucro > 0 });

  const ganhou = resultado.lucro > 0;
  const bj = resultado.maos.some((m) => m.status === STATUS_MAO.BLACKJACK && m.resultado === STATUS_MAO.WIN);
  if (bj) som.blackjack();
  else if (ganhou) som.vitoria();
  else if (resultado.lucro === 0) som.empate();
  else som.derrota();

  const titulo = bj ? 'BLACKJACK!' : ganhou ? 'VOCÊ VENCEU' : resultado.lucro === 0 ? 'EMPATE' : 'DEALER VENCEU';
  const detalhe = resultado.lucro === 0
    ? 'Aposta devolvida'
    : `${resultado.lucro > 0 ? '+' : ''}${fmt(resultado.lucro)} fichas · +${relatorio.ganhoXP} XP`;
  ctx.anuncio(titulo, detalhe, ganhou ? 'ganhou' : resultado.lucro === 0 ? '' : 'perdeu');

  for (const nivel of relatorio.niveis) {
    som.nivel();
    ctx.torrada(`Subiu para o <span class="premio">Nível ${nivel}</span>`);
  }
  for (const m of relatorio.missoes) {
    ctx.torrada(`Missão: ${m.texto} <span class="premio">+${fmt(m.premio)}</span>`);
  }
  for (const c of relatorio.conquistas) {
    ctx.torrada(`Conquista: ${c.nome} <span class="premio">+${fmt(c.premio)}</span>`);
  }

  ctx.aoTerminarRodada?.(relatorio);
  await espera(600);
  desenhar();
}

export function emRodada() { return jogo && jogo.estado !== ESTADOS.AGUARDANDO_APOSTA; }
export function atualizarSaldoDaMesa() { if (jogo) sincronizarSaldo(); }
