// Telas do modo "jogar com amigos": criar, entrar, lobby e a mesa online.
//
// Nada aqui decide jogo. A tela manda a ação e desenha a visão que o servidor
// devolve. Os botões que aparecem são calculados com as mesmas regras de mão
// do servidor (`assento.js`), mas isso é só para não mostrar botão morto — o
// servidor confere tudo de novo.

import { acoesDaMao } from '../motor/assento.js';
import { ACOES, STATUS_MAO } from '../motor/regras.js';
import { LIMITES, STATUS_SALA } from '../motor/sala.js';
import { textoValor } from '../motor/mao.js';
import { agoraDoServidor, assinar, chamar, meuId } from '../dados/servidor.js';
import { elementoCarta } from './cartas.js';
import { som } from './som.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');

const ATALHOS_FICHAS = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];

let ctx = null;
let visao = null;
let codigoAtual = null;
let desassinar = null;
let relogio = null;
let ocupado = false;
let statusAnterior = null;
let rolouParaAcoes = false;
let rodadaAnterior = 0;

export function prepararSalas(contexto) {
  ctx = contexto;
}

// --------------------------------------------------------------- utilidades

async function acao(nome, dados = {}, { silencioso = false } = {}) {
  if (ocupado) return null;
  ocupado = true;
  pintar();
  try {
    const resposta = await chamar(nome, dados, ctx.perfil);
    if (resposta?.visao) receber(resposta.visao);
    return resposta;
  } catch (erro) {
    if (!silencioso) ctx.torrada(erro.message ?? 'Não consegui falar com o servidor.');
    return null;
  } finally {
    ocupado = false;
    pintar();
  }
}

function euNaVisao() {
  return visao?.jogadores.find((j) => j.id === meuId()) ?? null;
}

function minhasAcoes() {
  if (!visao || visao.status !== STATUS_SALA.TURNO_JOGADORES) return [];
  if (visao.vezDe !== meuId()) return [];
  const eu = euNaVisao();
  if (!eu || eu.maos.length === 0) return [];
  return acoesDaMao(eu, { permiteDesistir: visao.config.permitirDesistir });
}

function segundosRestantes() {
  if (!visao?.prazo) return null;
  return Math.max(0, Math.ceil((visao.prazo - agoraDoServidor()) / 1000));
}

// --------------------------------------------------------------- entrada

export function abrirAmigos() {
  ctx.irPara('amigos');
  pintarAmigos();
  carregarPublicas();
}

async function carregarPublicas() {
  try {
    const { salas } = await chamar('publicas');
    const caixa = $('salas-publicas');
    if (!caixa) return;
    caixa.innerHTML = salas?.length
      ? salas.map((s) => `<button class="mesa-item" data-codigo="${s.codigo}">
          <span><b>${escapar(s.nome)}</b><small>Código ${s.codigo}</small></span>
          <span class="req">${s.jogadores}/${s.max_jogadores} →</span>
        </button>`).join('')
      : '<div class="vazio">Nenhuma sala pública aberta agora.</div>';
    for (const b of caixa.querySelectorAll('[data-codigo]')) {
      b.onclick = () => entrarNaSala(b.dataset.codigo);
    }
  } catch { /* lista pública é enfeite: sem ela dá para entrar pelo código */ }
}

function pintarAmigos() {
  $('entrada-codigo').value = '';
  $('btn-criar-sala').onclick = () => { som.botao(); ctx.irPara('criar'); pintarCriar(); };
  $('btn-entrar-codigo').onclick = () => {
    const codigo = $('entrada-codigo').value.trim().toUpperCase();
    if (codigo.length !== 6) return ctx.torrada('O código tem 6 letras e números.');
    entrarNaSala(codigo);
  };
  $('entrada-codigo').oninput = (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  };
}

// ------------------------------------------------------------ criar sala

function pintarCriar() {
  const campos = $('campos-criar');
  const c = {
    nome: `Mesa do ${ctx.perfil.nome}`,
    fichasIniciais: 10000, apostaMin: 500, apostaMax: 10000,
    maxJogadores: 6, limiteRodadas: 10, tempoAposta: 20, tempoTurno: 15,
  };

  campos.innerHTML = `
    <label class="linha-campo"><span>Nome da sala</span>
      <input class="entrada" id="c-nome" maxlength="28" value="${escapar(c.nome)}"></label>

    <label class="linha-campo"><span>Fichas iniciais de cada jogador</span>
      <input class="entrada" id="c-fichas" type="number" min="100" step="100" value="${c.fichasIniciais}"></label>
    <div class="atalhos" id="atalhos-fichas">
      ${ATALHOS_FICHAS.map((v) => `<button class="botao discreto" data-v="${v}">${fmt(v)}</button>`).join('')}
    </div>

    <div class="dupla">
      <label class="linha-campo"><span>Aposta mínima</span>
        <input class="entrada" id="c-min" type="number" min="1" step="50" value="${c.apostaMin}"></label>
      <label class="linha-campo"><span>Aposta máxima</span>
        <input class="entrada" id="c-max" type="number" min="1" step="50" value="${c.apostaMax}"></label>
    </div>

    <div class="dupla">
      <label class="linha-campo"><span>Máximo de jogadores</span>
        <input class="entrada" id="c-jogadores" type="number" min="${LIMITES.jogadores.min}"
          max="${LIMITES.jogadores.max}" value="${c.maxJogadores}"></label>
      <label class="linha-campo"><span>Rodadas</span>
        <select class="entrada" id="c-rodadas">
          ${[5, 10, 20, 50].map((n) => `<option value="${n}" ${n === c.limiteRodadas ? 'selected' : ''}>${n} rodadas</option>`).join('')}
          <option value="ilimitado">Ilimitado</option>
        </select></label>
    </div>

    <div class="dupla">
      <label class="linha-campo"><span>Segundos para apostar</span>
        <input class="entrada" id="c-tempo-aposta" type="number" min="${LIMITES.tempoAposta.min}"
          max="${LIMITES.tempoAposta.max}" value="${c.tempoAposta}"></label>
      <label class="linha-campo"><span>Segundos por jogada</span>
        <input class="entrada" id="c-tempo-turno" type="number" min="${LIMITES.tempoTurno.min}"
          max="${LIMITES.tempoTurno.max}" value="${c.tempoTurno}"></label>
    </div>

    <div class="opcao"><div><b>Sala pública</b><small>Aparece na lista para qualquer um entrar</small></div>
      <button class="chave" id="c-publica"><i></i></button></div>
    <div class="opcao"><div><b>Permitir recompra</b><small>Quem zera pode voltar ao saldo inicial</small></div>
      <button class="chave" id="c-recompra"><i></i></button></div>
    <div class="opcao"><div><b>Entrada durante a partida</b><small>Sem isso, quem chega depois assiste</small></div>
      <button class="chave" id="c-entrada"><i></i></button></div>
    <div class="dica" id="aviso-criar"></div>`;

  for (const b of $('atalhos-fichas').querySelectorAll('[data-v]')) {
    b.onclick = () => { $('c-fichas').value = b.dataset.v; som.ficha(); conferirCriar(); };
  }
  for (const id of ['c-publica', 'c-recompra', 'c-entrada']) {
    $(id).onclick = () => { $(id).classList.toggle('ligada'); som.botao(); };
  }
  for (const id of ['c-fichas', 'c-min', 'c-max', 'c-jogadores']) {
    $(id).oninput = conferirCriar;
  }
  $('btn-confirmar-criar').onclick = criarSala;
  conferirCriar();
}

function lerConfigDaTela() {
  const rodadas = $('c-rodadas').value;
  return {
    nome: $('c-nome').value,
    config: {
      fichasIniciais: Number($('c-fichas').value),
      apostaMin: Number($('c-min').value),
      apostaMax: Number($('c-max').value),
      maxJogadores: Number($('c-jogadores').value),
      limiteRodadas: rodadas === 'ilimitado' ? null : Number(rodadas),
      tempoAposta: Number($('c-tempo-aposta').value),
      tempoTurno: Number($('c-tempo-turno').value),
      publica: $('c-publica').classList.contains('ligada'),
      permitirRecompra: $('c-recompra').classList.contains('ligada'),
      permitirEntradaDurante: $('c-entrada').classList.contains('ligada'),
    },
  };
}

// §45: avisa antes de criar, em vez de deixar nascer uma sala impossível.
function conferirCriar() {
  const { config } = lerConfigDaTela();
  const problemas = [];
  if (!(config.fichasIniciais >= LIMITES.fichas.min)) {
    problemas.push(`As fichas iniciais precisam ser pelo menos ${fmt(LIMITES.fichas.min)}.`);
  }
  if (config.apostaMin > config.fichasIniciais) {
    problemas.push('A aposta mínima não pode passar das fichas iniciais.');
  }
  if (config.apostaMax < config.apostaMin) {
    problemas.push('A aposta máxima não pode ser menor que a mínima.');
  }
  $('aviso-criar').textContent = problemas[0] ?? 'Tudo certo para abrir a mesa.';
  $('btn-confirmar-criar').disabled = problemas.length > 0;
  return problemas.length === 0;
}

async function criarSala() {
  if (!conferirCriar()) return;
  som.botao();
  const dados = lerConfigDaTela();
  const resposta = await acao('criar', dados);
  if (resposta?.visao) {
    codigoAtual = resposta.visao.codigo;
    ligarSala(codigoAtual);
    ctx.irPara('sala');
  }
}

async function entrarNaSala(codigo) {
  som.botao();
  const resposta = await acao('entrar', { codigo });
  if (resposta?.visao) {
    codigoAtual = codigo;
    ligarSala(codigo);
    ctx.irPara('sala');
  }
}

// ------------------------------------------------------------ vida da sala

function ligarSala(codigo) {
  desligarSala();
  statusAnterior = null;
  rodadaAnterior = 0;
  desassinar = assinar(codigo, (nova) => receber(nova));
  relogio = setInterval(() => {
    if (visao?.prazo) pintarRelogio();
  }, 250);
  try {
    const url = new URL(location.href);
    url.searchParams.set('sala', codigo);
    history.replaceState(null, '', url);
  } catch { /* link continua funcionando sem isso */ }
}

export function desligarSala() {
  ultimaVisaoCrua = '';
  desassinar?.();
  desassinar = null;
  clearInterval(relogio);
  relogio = null;
  visao = null;
  codigoAtual = null;
  try {
    const url = new URL(location.href);
    url.searchParams.delete('sala');
    history.replaceState(null, '', url);
  } catch { /* segue */ }
}

export function naSala() {
  return Boolean(codigoAtual);
}

export async function sairDaSala() {
  if (codigoAtual) await acao('sair', { codigo: codigoAtual }, { silencioso: true });
  desligarSala();
}

let ultimaVisaoCrua = '';

function receber(nova) {
  // A sonda de segurança traz o mesmo estado várias vezes por rodada. Redesenhar
  // à toa faria as cartas piscarem e roubaria o clique de quem está jogando.
  const cru = JSON.stringify(nova);
  if (cru === ultimaVisaoCrua) return;
  ultimaVisaoCrua = cru;

  const antes = visao;
  visao = nova;
  anunciarMudancas(antes, nova);
  pintar();
}

function anunciarMudancas(antes, agora) {
  if (!agora) return;
  if (statusAnterior !== agora.status) {
    if (agora.status === STATUS_SALA.APOSTAS && rodadaAnterior !== agora.rodada) {
      som.ficha();
    }
    if (agora.status === STATUS_SALA.TURNO_JOGADORES && statusAnterior === STATUS_SALA.APOSTAS) {
      som.carta();
    }
    if (agora.status === STATUS_SALA.RESULTADO) {
      const eu = agora.jogadores.find((j) => j.id === meuId());
      const linha = agora.historico[0]?.jogadores.find((l) => l.id === meuId());
      if (linha) {
        if (linha.rotulo === 'BLACKJACK') som.blackjack();
        else if (linha.lucro > 0) som.vitoria();
        else if (linha.lucro === 0) som.empate();
        else som.derrota();
        ctx.anuncio(
          linha.rotulo === 'BLACKJACK' ? 'BLACKJACK!' : linha.lucro > 0 ? 'VOCÊ VENCEU'
            : linha.lucro === 0 ? 'EMPATE' : 'DEALER VENCEU',
          linha.lucro === 0 ? 'Aposta devolvida' : `${linha.lucro > 0 ? '+' : ''}${fmt(linha.lucro)} fichas`,
          linha.lucro > 0 ? 'ganhou' : linha.lucro === 0 ? '' : 'perdeu',
        );
      } else if (eu && !eu.espectador) {
        ctx.anuncio('RODADA ENCERRADA', 'Você ficou fora desta', '');
      }
    }
    if (agora.status === STATUS_SALA.PARTIDA_FINALIZADA && statusAnterior) {
      const venci = agora.campeoes.some((c) => c.id === meuId());
      som[venci ? 'blackjack' : 'derrota']();
      ctx.anuncio(venci ? 'CAMPEÃO!' : 'FIM DE PARTIDA',
        agora.campeoes.map((c) => c.nome).join(' e '), venci ? 'ganhou' : '');
    }
    if (agora.status === STATUS_SALA.TURNO_JOGADORES && agora.vezDe === meuId()
        && antes?.vezDe !== meuId()) {
      som.nivel();
    }
  }
  statusAnterior = agora.status;
  rodadaAnterior = agora.rodada;
}

// ------------------------------------------------------------------ pintar

export function pintar() {
  if (!visao) return;
  const lobby = visao.status === STATUS_SALA.LOBBY;
  $('sala-lobby').hidden = !lobby;
  $('sala-mesa').hidden = lobby;
  if (lobby) pintarLobby(); else pintarMesa();
  pintarRelogio();

  // Numa tela baixa a mesa rola. Quando chega a sua vez, os botões vêm até você
  // em vez de ficarem escondidos embaixo.
  if (!lobby && minhasAcoes().length > 0 && !rolouParaAcoes) {
    rolouParaAcoes = true;
    $('sala-acoes').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  if (minhasAcoes().length === 0) rolouParaAcoes = false;
}

function escapar(texto) {
  return String(texto ?? '').replace(/[<>&"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]
  ));
}

// ------------------------------------------------------------------ lobby

function pintarLobby() {
  const c = visao.config;
  $('lobby-codigo').textContent = visao.codigo;
  $('lobby-nome').textContent = visao.nome;

  $('lobby-regras').innerHTML = [
    ['Fichas iniciais', fmt(c.fichasIniciais)],
    ['Aposta', `${fmt(c.apostaMin)} a ${fmt(c.apostaMax)}`],
    ['Rodadas', c.limiteRodadas === null ? 'Ilimitado' : fmt(c.limiteRodadas)],
    ['Jogadores', `${visao.jogadores.filter((j) => !j.espectador).length}/${c.maxJogadores}`],
    ['Tempo por jogada', `${c.tempoTurno}s`],
    ['Tempo para apostar', `${c.tempoAposta}s`],
  ].map(([r, v]) => `<div class="numero"><b>${v}</b><span>${r}</span></div>`).join('');

  $('lobby-jogadores').innerHTML = visao.jogadores.map((j) => `
    <div class="item ${j.pronto ? 'feito' : ''}">
      <span class="ic">${j.avatar ?? '🂡'}</span>
      <span><b>${escapar(j.nome)} ${j.ehHost ? '<small>ADM</small>' : ''}</b>
        <small>${j.espectador ? 'assistindo' : `${fmt(j.fichas)} fichas`}${j.conectado ? '' : ' · desconectado'}</small></span>
      <span class="premio">${j.espectador ? '👁' : j.pronto ? 'PRONTO' : '...'}</span>
    </div>`).join('');

  // §48: cada um escolhe como aparece na mesa, e dá para trocar até começar.
  const eu = euNaVisao();
  const campoNome = $('lobby-meu-nome');
  if (document.activeElement !== campoNome) campoNome.value = eu?.nome ?? ctx.perfil.nome;
  campoNome.disabled = ocupado;
  $('btn-salvar-nome').disabled = ocupado;
  $('btn-salvar-nome').onclick = () => trocarNome(campoNome.value);
  campoNome.onkeydown = (e) => { if (e.key === 'Enter') trocarNome(campoNome.value); };

  const btnPronto = $('btn-pronto');
  btnPronto.textContent = eu?.pronto ? 'NÃO ESTOU PRONTO' : 'ESTOU PRONTO';
  btnPronto.disabled = ocupado || eu?.espectador;
  btnPronto.onclick = () => { som.botao(); acao('pronto', { codigo: visao.codigo, valor: !eu?.pronto }); };

  const btnIniciar = $('btn-iniciar-partida');
  btnIniciar.hidden = !visao.souHost;
  btnIniciar.disabled = ocupado || visao.jogadores.filter((j) => !j.espectador).length < 1;
  btnIniciar.onclick = () => { som.botao(); acao('iniciar', { codigo: visao.codigo }); };

  $('btn-copiar-link').onclick = copiarConvite;
}

async function trocarNome(bruto) {
  const nome = String(bruto ?? '').trim().slice(0, 18);
  if (!nome) return ctx.torrada('Escolha um nome.');
  if (nome === euNaVisao()?.nome) return;
  som.botao();
  ctx.perfil.nome = nome;
  ctx.atualizarTopo();
  // `entrar` com o assento já ocupado só atualiza o nome de quem voltou (§66).
  const resposta = await acao('entrar', { codigo: visao.codigo });
  if (resposta) ctx.torrada(`Agora você é ${escapar(nome)} nesta mesa.`);
}

async function copiarConvite() {
  const url = new URL(location.href);
  url.searchParams.set('sala', visao.codigo);
  const texto = `Entra na minha mesa de blackjack: ${url.toString()} (código ${visao.codigo})`;
  try {
    if (navigator.share) await navigator.share({ text: texto });
    else {
      await navigator.clipboard.writeText(texto);
      ctx.torrada('Convite copiado.');
    }
  } catch {
    ctx.torrada(`Código da sala: ${visao.codigo}`);
  }
}

// ------------------------------------------------------------------- mesa

function pintarMesa() {
  const eu = euNaVisao();

  $('sala-rodada').textContent = visao.limiteRodadas
    ? `Rodada ${visao.rodada}/${visao.limiteRodadas}`
    : `Rodada ${visao.rodada}`;
  $('sala-codigo-mesa').textContent = visao.codigo;
  $('texto-limites').textContent =
    `APOSTA DE ${fmt(visao.config.apostaMin)} A ${fmt(visao.config.apostaMax)}`;

  const caixaDealer = $('sala-cartas-dealer');
  caixaDealer.innerHTML = '';
  for (const carta of visao.dealer.cartas) caixaDealer.append(elementoCarta(carta));
  for (let i = 0; i < visao.dealer.escondidas; i++) {
    caixaDealer.append(elementoCarta(null, { virada: true }));
  }
  $('sala-valor-dealer').innerHTML = visao.dealer.cartas.length
    ? `<span class="valor-lugar ${visao.dealer.revelado && visao.dealer.valor > 21 ? 'ruim' : ''}">${
      visao.dealer.revelado && visao.dealer.valor > 21
        ? `${visao.dealer.valor} · ESTOUROU`
        : textoValor(visao.dealer.cartas)}</span>`
    : '';

  pintarLugares();
  $('sala-minhas-fichas').innerHTML = eu && !eu.espectador
    ? `<span class="moeda"></span> ${fmt(eu.fichas)}`
    : 'assistindo';
  if (eu) {
    pintarFichasDeAposta(eu);
    pintarAcoes(eu);
  }
  pintarRanking();

  $('btn-ranking-celular').onclick = () => {
    som.botao();
    ctx.modal(`Sala ${visao.codigo}`,
      `<div class="numeros" style="margin-bottom:14px">
         <div class="numero"><b>${visao.rodada}${visao.limiteRodadas ? `/${visao.limiteRodadas}` : ''}</b><span>Rodada</span></div>
         <div class="numero"><b>${fmt(visao.config.apostaMin)}</b><span>Aposta mínima</span></div>
       </div>
       ${$('sala-ranking').innerHTML}
       <h2 style="margin:18px 0 10px">Rodadas</h2>
       ${$('sala-historico').innerHTML}`,
      [{ texto: 'FECHAR', classe: 'ouro' }]);
  };
}

// ---------------------------------------------------------------- lugares

// Quem está nesta tela senta sempre no meio do arco, de frente para o dealer.
// É o que a pessoa espera de uma mesa: a mão dela na frente, os outros ao lado.
function centralizarEmMim(lista) {
  const meu = lista.findIndex((j) => j.id === meuId());
  if (meu < 0 || lista.length < 2) return lista;
  const centro = Math.floor((lista.length - 1) / 2);
  const giro = (meu - centro + lista.length) % lista.length;
  return [...lista.slice(giro), ...lista.slice(0, giro)];
}

// Arco da mesa: o lugar do meio é o mais baixo e os das pontas sobem, como no
// feltro de verdade.
//
// O espaçamento é por DISTÂNCIA, não por ângulo: dividindo o arco em ângulos
// iguais, os lugares das pontas se encavalam, porque lá a curva anda mais na
// vertical do que na horizontal. Com nove jogadores dois pares se cobriam.
function posicaoNoArco(i, total) {
  const RAIO_X = 43;     // metade da largura do arco, em % do feltro
  const RAIO_Y = 30;     // quanto as pontas sobem
  const BASE_Y = 78;     // altura do lugar do meio

  if (total === 1) return { x: 50, y: BASE_Y };

  const uso = Math.min(1, total / 8);              // mesa vazia não espalha tanto
  const t = ((i / (total - 1)) - 0.5) * uso;       // -0.5..0.5
  const x = 50 + t * 2 * RAIO_X;

  const seno = (x - 50) / RAIO_X;
  const cosseno = Math.sqrt(Math.max(0, 1 - seno * seno));
  return { x, y: BASE_Y - (1 - cosseno) * RAIO_Y };
}

function pilhaDeFichas(valor) {
  const quantas = Math.min(5, Math.max(1, Math.ceil(Math.log10(Math.max(10, valor)))));
  const cores = ['a', 'b', 'c'];
  const fichinhas = Array.from({ length: quantas },
    (_, i) => `<i class="fichinha ${cores[i % cores.length]}"></i>`).join('');
  return `<span class="pilha"><span class="fichinhas">${fichinhas}</span>${fmt(valor)}</span>`;
}

function pintarLugares() {
  const caixa = $('sala-lugares');
  const naMesa = visao.jogadores.filter((j) => !j.espectador);
  const ordem = centralizarEmMim(naMesa);

  // Com a mesa cheia os lugares encolhem para caber lado a lado sem se cobrir.
  caixa.style.setProperty('--escala-lugar',
    ordem.length >= 9 ? '.66' : ordem.length >= 7 ? '.8' : '1');
  // Mesa cheia: o avatar sai da placa para o nome caber inteiro.
  caixa.classList.toggle('apertado', ordem.length >= 7);
  caixa.innerHTML = '';

  ordem.forEach((j, i) => {
    const { x, y } = posicaoNoArco(i, ordem.length);
    const el = document.createElement('div');
    el.className = 'lugar';
    if (j.id === meuId()) el.classList.add('eu');
    if (visao.vezDe === j.id) el.classList.add('na-vez');
    if (!j.conectado) el.classList.add('fora');
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;

    const maos = document.createElement('div');
    maos.className = 'maos-lugar';

    if (j.maos.length === 0) {
      const vazio = document.createElement('div');
      vazio.className = 'circulo';
      maos.append(vazio);
    }

    j.maos.forEach((mao, indice) => {
      const bloco = document.createElement('div');
      bloco.className = 'mao-lugar';
      if (visao.vezDe === j.id && indice === j.maoAtual && j.maos.length > 1) {
        bloco.style.filter = 'drop-shadow(0 0 10px rgba(217,180,91,.8))';
      }

      const cartas = document.createElement('div');
      cartas.className = 'cartas-lugar';
      for (const c of mao.cartas) cartas.append(elementoCarta(c));

      const linha = document.createElement('div');
      linha.style.display = 'grid';
      linha.style.justifyItems = 'center';
      linha.style.gap = '3px';

      const classe = mao.status === STATUS_MAO.BLACKJACK ? 'bj'
        : mao.valor > 21 ? 'ruim' : mao.valor === 21 ? 'bom' : '';
      const texto = mao.status === STATUS_MAO.BLACKJACK ? 'BJ' : String(mao.valor);
      linha.innerHTML = `<span class="valor-lugar ${classe}">${texto}</span>`;

      if (mao.resultado) {
        const mapa = {
          WIN: ['ganhou', mao.status === STATUS_MAO.BLACKJACK ? 'BLACKJACK' : 'VENCEU'],
          PUSH: ['empatou', 'EMPATE'],
          LOSE: ['perdeu', mao.status === STATUS_MAO.BUST ? 'ESTOUROU'
            : mao.status === STATUS_MAO.SURRENDER ? 'DESISTIU' : 'PERDEU'],
        };
        const [cl, rotulo] = mapa[mao.resultado] ?? ['', ''];
        linha.innerHTML += `<span class="etiqueta ${cl}">${rotulo}</span>`;
      }

      bloco.append(cartas, linha);
      maos.append(bloco);
    });

    const apostado = j.apostaPendente || j.maos.reduce((t, m) => t + m.aposta, 0);
    const placa = document.createElement('div');
    placa.className = 'placa';
    placa.innerHTML = `<span class="av">${j.avatar ?? '🂡'}</span><b>${escapar(j.nome)}</b>
      <span class="fichas">${fmt(j.fichas)}</span>`;

    // §87: no celular as cartas dos outros ficam escondidas para caber todo
    // mundo; tocar no lugar abre a mão e os números da pessoa.
    if (j.id !== meuId()) {
      el.onclick = () => mostrarJogador(j);
      el.style.cursor = 'pointer';
    }

    el.append(maos);
    if (apostado > 0) {
      const fichas = document.createElement('div');
      fichas.innerHTML = pilhaDeFichas(apostado);
      el.append(fichas);
    }
    el.append(placa);
    caixa.append(el);
  });
}

function pintarFichasDeAposta(eu) {
  const caixa = $('sala-fichas');
  const apostando = visao.status === STATUS_SALA.APOSTAS && !eu.apostaPendente && !eu.espectador;
  caixa.innerHTML = '';
  if (!apostando) return;

  const c = visao.config;
  const valores = [...new Set([c.apostaMin, c.apostaMin * 2, c.apostaMin * 5, c.apostaMin * 10, c.apostaMax])]
    .filter((v) => v >= c.apostaMin && v <= c.apostaMax && v <= eu.fichas)
    .sort((a, b) => a - b);

  if (valores.length === 0) {
    caixa.innerHTML = `<div class="dica">Suas fichas não pagam a aposta mínima de ${fmt(c.apostaMin)}.</div>`;
    if (visao.config.permitirRecompra) {
      const b = document.createElement('button');
      b.className = 'botao ouro';
      b.textContent = 'RECOMPRAR';
      b.disabled = ocupado;
      b.onclick = () => { som.ficha(); acao('recomprar', { codigo: visao.codigo }); };
      caixa.append(b);
    }
    return;
  }

  for (const valor of valores) {
    const b = document.createElement('button');
    b.className = 'botao';
    b.innerHTML = `<span class="moeda"></span> ${fmt(valor)}`;
    b.disabled = ocupado;
    b.onclick = () => { som.ficha(); acao('apostar', { codigo: visao.codigo, valor }); };
    caixa.append(b);
  }
}

function pintarAcoes(eu) {
  const caixa = $('sala-acoes');
  caixa.innerHTML = '';
  const dica = $('sala-dica');

  if (visao.status === STATUS_SALA.APOSTAS) {
    dica.textContent = eu.apostaPendente
      ? `Aposta de ${fmt(eu.apostaPendente)} na mesa. Esperando os outros.`
      : `Faça sua aposta: de ${fmt(visao.config.apostaMin)} a ${fmt(visao.config.apostaMax)}.`;
    return;
  }

  if (visao.status === STATUS_SALA.PARTIDA_FINALIZADA) {
    dica.textContent = visao.campeoes.length > 1
      ? `Empate entre ${visao.campeoes.map((c) => c.nome).join(' e ')}.`
      : `Campeão: ${visao.campeoes[0]?.nome ?? '—'}.`;
    if (visao.souHost) {
      const b = document.createElement('button');
      b.className = 'botao ouro largo';
      b.textContent = 'NOVA PARTIDA';
      b.disabled = ocupado;
      b.onclick = () => { som.botao(); acao('iniciar', { codigo: visao.codigo }); };
      caixa.append(b);
    }
    return;
  }

  const acoes = minhasAcoes();
  if (acoes.length === 0) {
    const daVez = visao.jogadores.find((j) => j.id === visao.vezDe);
    dica.textContent = visao.status === STATUS_SALA.TURNO_JOGADORES && daVez
      ? `Vez de ${daVez.nome}.`
      : visao.status === STATUS_SALA.RESULTADO ? 'Resultado da rodada.' : 'O dealer está jogando.';
    return;
  }

  dica.textContent = eu.maos.length > 1
    ? `Sua vez — mão ${eu.maoAtual + 1} de ${eu.maos.length}.`
    : 'Sua vez.';

  const nomes = {
    [ACOES.PEDIR]: ['PEDIR', 'verde'],
    [ACOES.PARAR]: ['PARAR', 'vermelho'],
    [ACOES.DOBRAR]: ['DOBRAR', ''],
    [ACOES.DIVIDIR]: ['DIVIDIR', ''],
    [ACOES.DESISTIR]: ['DESISTIR', 'discreto'],
  };
  for (const jogada of acoes) {
    const [texto, classe] = nomes[jogada] ?? [jogada, ''];
    const b = document.createElement('button');
    b.className = `botao ${classe}`;
    b.textContent = texto;
    b.disabled = ocupado;
    b.onclick = () => { som.botao(); acao('agir', { codigo: visao.codigo, jogada }); };
    caixa.append(b);
  }
}

function mostrarJogador(j) {
  som.botao();
  const maos = j.maos.length
    ? j.maos.map((mao, i) => `
        <div class="item">
          <span class="ic">${mao.valor > 21 ? '💥' : mao.status === STATUS_MAO.BLACKJACK ? '🃏' : '🂡'}</span>
          <span><b>${mao.cartas.map((c) => c.valor + c.naipe).join('  ')}</b>
            <small>${j.maos.length > 1 ? `Mão ${i + 1} · ` : ''}valor ${mao.valor}${
              mao.dobrada ? ' · dobrou' : ''}${mao.resultado ? ` · ${mao.resultado}` : ''}</small></span>
          <span class="premio">${fmt(mao.aposta)}</span>
        </div>`).join('')
    : '<div class="vazio">Sem cartas nesta rodada.</div>';

  const e = j.estatisticas ?? {};
  ctx.modal(`${j.avatar ?? '🂡'} ${j.nome}`,
    `<div class="numeros" style="margin-bottom:14px">
       <div class="numero"><b>${fmt(j.fichas)}</b><span>Fichas</span></div>
       <div class="numero"><b>${fmt(e.vitorias ?? 0)}</b><span>Vitórias</span></div>
       <div class="numero"><b>${fmt(e.blackjacks ?? 0)}</b><span>Blackjacks</span></div>
       <div class="numero"><b>${fmt(e.busts ?? 0)}</b><span>Estouros</span></div>
     </div>
     ${maos}
     ${j.conectado ? '' : '<div class="vazio">Está desconectado; a vaga fica guardada.</div>'}`,
    [{ texto: 'FECHAR', classe: 'ouro' }]);
}

function pintarRanking() {
  $('sala-ranking').innerHTML = visao.ranking.map((j) => `
    <div class="linha-rank ${j.id === meuId() ? 'eu' : ''}">
      <span class="pos">${j.posicao}º</span>
      <span class="nome">${j.avatar ?? '🂡'} ${escapar(j.nome)}</span>
      <span class="fichas">${fmt(j.fichas)}</span>
      <span class="lucro ${j.lucro > 0 ? 'mais' : j.lucro < 0 ? 'menos' : ''}">${
        j.lucro > 0 ? '+' : ''}${fmt(j.lucro)}</span>
    </div>`).join('');

  $('sala-historico').innerHTML = visao.historico.length
    ? visao.historico.map((h) => `
      <div class="linha-hist">
        <span>Rodada ${h.rodada} · dealer ${h.dealer}${h.dealerEstourou ? ' (estourou)' : ''}</span>
        <span></span>
        <span class="cartas-txt">${h.jogadores.map((l) => `${escapar(l.nome)}: ${l.rotulo}${
          l.lucro ? ` (${l.lucro > 0 ? '+' : ''}${fmt(l.lucro)})` : ''}`).join(' · ')}</span>
      </div>`).join('')
    : '<div class="vazio">A partida ainda não teve rodada.</div>';
}

function pintarRelogio() {
  const caixa = $('sala-relogio');
  if (!caixa || !visao) return;
  const segundos = segundosRestantes();
  const mostra = visao.status === STATUS_SALA.APOSTAS || visao.status === STATUS_SALA.TURNO_JOGADORES;

  if (!mostra || segundos === null) {
    caixa.hidden = true;
    return;
  }
  caixa.hidden = false;
  const total = visao.status === STATUS_SALA.APOSTAS ? visao.config.tempoAposta : visao.config.tempoTurno;
  const fatia = Math.max(0, Math.min(1, segundos / total));
  caixa.className = `relogio${fatia < 0.34 ? ' acabando' : ''}${visao.vezDe === meuId() ? ' minha' : ''}`;
  caixa.innerHTML = `<i style="width:${fatia * 100}%"></i><b>${segundos}s</b>`;
}

// --------------------------------------------------- link direto para sala

export async function entrarPorLink() {
  const codigo = new URL(location.href).searchParams.get('sala');
  if (!codigo) return false;
  const resposta = await acao('entrar', { codigo: codigo.toUpperCase() });
  if (!resposta?.visao) return false;
  codigoAtual = resposta.visao.codigo;
  ligarSala(codigoAtual);
  ctx.irPara('sala');
  return true;
}
