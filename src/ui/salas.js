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

// Número grande em poucas letras, para caber em ladrilho e no feltro: 10.000.000.000 → "10 bi".
// Até 999.999 fica por extenso; acima, arredonda a uma casa (2.550.000 → "2,6 mi").
// O espaço é inquebrável: "10" e "bi" nunca caem em linhas diferentes.
function curto(n) {
  const escalas = [[1e12, 'tri'], [1e9, 'bi'], [1e6, 'mi']];
  for (const [base, nome] of escalas) {
    if (Math.abs(n) >= base) {
      return `${(n / base).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}\u00a0${nome}`;
    }
  }
  return fmt(n);
}

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

async function acao(nome, dados = {}, { silencioso = false, manterMesa = false } = {}) {
  if (ocupado) return null;
  ocupado = true;
  pintar();
  try {
    const resposta = await chamar(nome, dados, ctx.perfil);
    if (resposta?.visao && !manterMesa) receber(resposta.visao);
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

// O crupiê joga livre na vez do dealer: pedir ou parar, até estourar ou fazer 21.
function acoesDeCrupie() {
  if (!visao || visao.status !== STATUS_SALA.TURNO_DEALER) return [];
  if (visao.vezDe !== meuId() || visao.crupieId !== meuId()) return [];
  return visao.dealer.valor < 21 ? [ACOES.PEDIR, ACOES.PARAR] : [];
}

function minhasAcoes() {
  const deCrupie = acoesDeCrupie();
  if (deCrupie.length) return deCrupie;
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
  atualizarListasDeSalas();
}

// ---------------------------------------------------- salas abertas, ao vivo

// A mesma lista aparece na tela inicial e em "Jogar com amigos". Ela se atualiza
// sozinha enquanto estiver na tela — e só com a aba em primeiro plano: aba
// esquecida no fundo não gasta cota do servidor. Ao voltar para a aba, atualiza
// na hora.
const LISTAS_DE_SALAS = ['salas-abertas-menu', 'salas-publicas'];
const INTERVALO_DA_LISTA = 12000;
let relogioDaLista = null;

export function ligarListasDeSalas() {
  clearInterval(relogioDaLista);
  relogioDaLista = setInterval(atualizarListasDeSalas, INTERVALO_DA_LISTA);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) atualizarListasDeSalas();
  });
  atualizarListasDeSalas();
}

export async function atualizarListasDeSalas() {
  if (document.hidden) return;
  const visiveis = LISTAS_DE_SALAS.map($).filter((el) => el && el.offsetParent !== null);
  if (visiveis.length === 0) return;
  try {
    const { salas } = await chamar('publicas');
    for (const caixa of visiveis) pintarListaDeSalas(caixa, salas ?? []);
  } catch {
    for (const caixa of visiveis) {
      if (!caixa.dataset.carregou) {
        caixa.innerHTML = '<div class="vazio">Não consegui buscar as salas agora. Tento de novo em instantes.</div>';
      }
    }
  }
}

function pintarListaDeSalas(caixa, salas) {
  caixa.dataset.carregou = '1';
  if (salas.length === 0) {
    caixa.innerHTML = `<div class="vazio">Nenhuma sala aberta agora.
      Crie a sua em <b>Jogar com amigos</b> e marque "Sala pública".</div>`;
    return;
  }

  caixa.innerHTML = salas.map((s) => {
    const esperando = s.status === STATUS_SALA.LOBBY;
    const cheia = esperando && s.jogadores >= s.max_jogadores;
    const situacao = esperando
      ? (cheia ? 'cheia' : 'esperando jogadores')
      : `em partida · rodada ${s.rodada} · entra para assistir`;
    return `<button class="sala-aberta${cheia ? ' cheia' : ''}" data-codigo="${s.codigo}"
        data-senha="${s.tem_senha ? '1' : '0'}" ${cheia ? 'disabled' : ''}>
      <span class="cadeado">${s.tem_senha ? '🔒' : '🔓'}</span>
      <span class="info"><b>${escapar(s.nome)}</b><small>${situacao} · código ${s.codigo}</small></span>
      <span class="vagas">${s.jogadores}/${s.max_jogadores}</span>
      <span class="selo-senha ${s.tem_senha ? 'com' : 'sem'}">${s.tem_senha ? 'COM SENHA' : 'SEM SENHA'}</span>
    </button>`;
  }).join('');

  for (const b of caixa.querySelectorAll('[data-codigo]')) {
    b.onclick = () => entrarNaSala(b.dataset.codigo, { temSenha: b.dataset.senha === '1' });
  }
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

// Desenhos das opções da sala: dizem o que a chave faz antes de ler o texto.
const tracoSala = (corpo) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;
const DESENHOS_CRIAR = {
  publica: tracoSala('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>'),
  recompra: tracoSala('<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/>'),
  entrada: tracoSala('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M4 12h11M11 8l4 4-4 4"/>'),
  crupie: tracoSala('<circle cx="12" cy="7" r="3.5"/><path d="M5 21c.8-4 3.5-6.5 7-6.5s6.2 2.5 7 6.5"/><path d="M9.5 14.8 12 17l2.5-2.2"/>'),
  cadeado: tracoSala('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
};

const OPCOES_CRIAR = [
  { id: 'c-publica', desenho: 'publica', titulo: 'Sala pública', texto: 'Aparece na lista de salas abertas; com senha, só entra quem souber' },
  { id: 'c-recompra', desenho: 'recompra', titulo: 'Permitir recompra', texto: 'Quem zera pode voltar ao saldo inicial' },
  { id: 'c-entrada', desenho: 'entrada', titulo: 'Entrada durante a partida', texto: 'Sem isso, quem chega depois assiste' },
  { id: 'c-crupie', desenho: 'crupie', titulo: 'Crupiê de verdade', texto: 'Um jogador vira o crupiê: não aposta e decide livremente as jogadas do dealer. A banca continua sendo da casa.' },
];

const RODADAS_CRIAR = [[5, '5'], [10, '10'], [20, '20'], [50, '50'], ['ilimitado', '∞']];

function pintarCriar() {
  const campos = $('campos-criar');
  const c = {
    nome: `Mesa do ${ctx.perfil.nome}`,
    fichasIniciais: 10000, apostaMin: 500, apostaMax: 10000,
    maxJogadores: 6, limiteRodadas: 10, tempoAposta: 20, tempoTurno: 15,
  };

  const passo = (id, valor, lim, rotulo) => `
    <div class="passo">
      <button class="menos" data-alvo="${id}" data-d="-5" aria-label="menos">−</button>
      <label><input id="${id}" type="number" min="${lim.min}" max="${lim.max}" value="${valor}"><span>s</span></label>
      <button class="mais" data-alvo="${id}" data-d="5" aria-label="mais">+</button>
      <small>${rotulo}</small>
    </div>`;

  campos.innerHTML = `
    <section class="bloco-criar">
      <h3>A mesa</h3>
      <label class="linha-campo"><span>Nome da sala</span>
        <input class="entrada" id="c-nome" maxlength="28" value="${escapar(c.nome)}"></label>

      <div class="linha-campo"><span>Lugares <b id="rot-jogadores"></b></span>
        <input type="hidden" id="c-jogadores" value="${c.maxJogadores}">
        <div class="cadeiras" id="cadeiras">
          ${Array.from({ length: LIMITES.jogadores.max }, (_, i) => `
            <button data-n="${i + 1}" ${i + 1 < LIMITES.jogadores.min ? 'disabled' : ''}
              aria-label="${i + 1} lugares"><i></i></button>`).join('')}
        </div>
      </div>

      <div class="linha-campo"><span>Rodadas</span>
        <input type="hidden" id="c-rodadas" value="${c.limiteRodadas}">
        <div class="segmentos" id="segmentos-rodadas">
          ${RODADAS_CRIAR.map(([v, t]) => `<button data-v="${v}">${t}</button>`).join('')}
        </div>
      </div>
    </section>

    <section class="bloco-criar">
      <h3>As fichas</h3>
      <label class="linha-campo"><span>Cada jogador começa com</span>
        <input class="entrada" id="c-fichas" type="number" min="100" step="100" value="${c.fichasIniciais}"></label>
      <div class="atalhos" id="atalhos-fichas">
        ${ATALHOS_FICHAS.map((v) => `<button class="botao discreto" data-v="${v}">${curto(v)}</button>`).join('')}
      </div>
      <div class="linha-campo"><span>Aposta por rodada</span>
        <div class="faixa-aposta">
          <span>de</span><input class="entrada" id="c-min" type="number" min="1" step="50" value="${c.apostaMin}">
          <span>a</span><input class="entrada" id="c-max" type="number" min="1" step="50" value="${c.apostaMax}">
        </div>
      </div>
    </section>

    <section class="bloco-criar">
      <h3>O relógio</h3>
      <div class="passos">
        ${passo('c-tempo-aposta', c.tempoAposta, LIMITES.tempoAposta, 'para apostar')}
        ${passo('c-tempo-turno', c.tempoTurno, LIMITES.tempoTurno, 'por jogada')}
      </div>
    </section>

    <section class="bloco-criar">
      <h3>A porta</h3>
      <label class="linha-campo"><span>Senha (opcional)</span>
        <span class="com-desenho">${DESENHOS_CRIAR.cadeado}
          <input class="entrada" id="c-senha" maxlength="20" autocomplete="off"
            placeholder="Vazio: qualquer um entra"></span></label>
      ${OPCOES_CRIAR.map((o) => `
        <div class="opcao opcao-criar"><span class="desenho">${DESENHOS_CRIAR[o.desenho]}</span>
          <div><b>${o.titulo}</b><small>${o.texto}</small></div>
          <button class="chave" id="${o.id}"><i></i></button></div>`).join('')}
    </section>
    <div class="dica" id="aviso-criar"></div>`;

  const mudou = () => { conferirCriar(); pintarPrevia(); };

  for (const b of $('atalhos-fichas').querySelectorAll('[data-v]')) {
    b.onclick = () => { $('c-fichas').value = b.dataset.v; som.ficha(); mudou(); };
  }
  for (const b of $('cadeiras').querySelectorAll('[data-n]')) {
    b.onclick = () => { $('c-jogadores').value = b.dataset.n; som.botao(); mudou(); };
  }
  for (const b of $('segmentos-rodadas').querySelectorAll('[data-v]')) {
    b.onclick = () => { $('c-rodadas').value = b.dataset.v; som.botao(); mudou(); };
  }
  for (const b of campos.querySelectorAll('.passo button')) {
    b.onclick = () => {
      const campo = $(b.dataset.alvo);
      const novo = Number(campo.value) + Number(b.dataset.d);
      campo.value = Math.min(Number(campo.max), Math.max(Number(campo.min), novo));
      som.botao(); mudou();
    };
  }
  for (const o of OPCOES_CRIAR) {
    $(o.id).onclick = () => { $(o.id).classList.toggle('ligada'); som.botao(); mudou(); };
  }
  for (const id of ['c-nome', 'c-fichas', 'c-min', 'c-max', 'c-senha', 'c-tempo-aposta', 'c-tempo-turno']) {
    $(id).oninput = mudou;
  }
  $('btn-confirmar-criar').onclick = criarSala;
  mudou();
}

// A mesa em miniatura, com as regras escritas no feltro como numa mesa de verdade.
function pintarPrevia() {
  const { nome, senha, config: c } = lerConfigDaTela();
  const n = c.maxJogadores;

  // Estado dos controles que não são campo de texto.
  $('rot-jogadores').textContent = `· ${n} ${n === 1 ? 'jogador' : 'jogadores'}`;
  for (const b of $('cadeiras').children) b.classList.toggle('ocupada', Number(b.dataset.n) <= n);
  for (const b of $('segmentos-rodadas').children) {
    b.classList.toggle('escolhido', b.dataset.v === String(c.limiteRodadas ?? 'ilimitado'));
  }

  // Lugares no arco de baixo da mesa, espaçados por igual.
  const lugares = Array.from({ length: n }, (_, i) => {
    const t = (n === 1 ? 90 : 158 - (136 * i) / (n - 1)) * (Math.PI / 180);
    const x = 200 + 150 * Math.cos(t);
    const y = 104 + 112 * Math.sin(t);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" class="cadeira-previa"/>`;
  }).join('');
  const titulo = (nome.trim() || 'Sua mesa').toUpperCase();
  const tamanho = titulo.length > 20 ? 15 : titulo.length > 14 ? 18 : 22;
  const crupie = c.crupieHumano;

  $('previa-mesa').innerHTML = `
    <svg viewBox="0 0 400 250" aria-hidden="true">
      <defs>
        <path id="previa-arco-1" d="M 60 128 Q 200 72 340 128"/>
        <path id="previa-arco-2" d="M 92 156 Q 200 112 308 156"/>
      </defs>
      <path class="trilho" d="M 10 12 H 390 V 104 A 190 136 0 0 1 10 104 Z"/>
      <path class="pano" d="M 20 22 H 380 V 104 A 180 126 0 0 1 20 104 Z"/>
      <rect class="${crupie ? 'crupie' : 'dealer'}" x="170" y="34" width="60" height="22" rx="4"/>
      <text class="rot-dealer" x="200" y="49" text-anchor="middle">${crupie ? 'CRUPIÊ' : 'DEALER'}</text>
      <text class="letreiro-previa" style="font-size:${tamanho}px">
        <textPath href="#previa-arco-1" startOffset="50%" text-anchor="middle">${escapar(titulo)}</textPath></text>
      <text class="limites-previa">
        <textPath href="#previa-arco-2" startOffset="50%" text-anchor="middle">APOSTA DE ${escapar(curto(c.apostaMin || 0))} A ${escapar(curto(c.apostaMax || 0))}</textPath></text>
      ${lugares}
      ${senha ? `<g class="tranca" transform="translate(352 30)">${DESENHOS_CRIAR.cadeado.replace('<svg', '<svg width="22" height="22"')}</g>` : ''}
    </svg>
    <div class="legenda-previa">
      <span><b>${curto(c.fichasIniciais || 0)}</b> fichas para cada um</span>
      <span><b>${c.limiteRodadas ?? '∞'}</b> ${c.limiteRodadas === 1 ? 'rodada' : 'rodadas'}</span>
      <span><b>${c.tempoAposta || 0}s</b> para apostar · <b>${c.tempoTurno || 0}s</b> por jogada</span>
    </div>
    <div class="selos-previa">
      ${senha ? '<span>com senha</span>' : ''}
      ${c.publica ? '<span>na lista de salas</span>' : '<span class="apagado">só com o código</span>'}
      ${c.permitirRecompra ? '<span>recompra</span>' : ''}
      ${c.permitirEntradaDurante ? '<span>entra no meio</span>' : ''}
      ${crupie ? '<span>crupiê de verdade</span>' : ''}
    </div>`;
}

function lerConfigDaTela() {
  const rodadas = $('c-rodadas').value;
  return {
    nome: $('c-nome').value,
    senha: $('c-senha').value.trim(),
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
      crupieHumano: $('c-crupie').classList.contains('ligada'),
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
  const resposta = await acao('criar', lerConfigDaTela(), { manterMesa: true });
  if (resposta?.visao) abrirSala(resposta.visao);
}

// Liga a assinatura ANTES de desenhar a mesa recebida. Na ordem contrária, a
// assinatura limpava a mesa que acabou de chegar e a tela ficava vazia até a
// próxima atualização.
function abrirSala(visaoInicial) {
  ligarSala(visaoInicial.codigo);
  receber(visaoInicial);
  ctx.irPara('sala');
}

async function entrarNaSala(codigo, { temSenha = false } = {}) {
  som.botao();
  if (temSenha) return pedirSenha(codigo);
  return tentarEntrar(codigo);
}

async function tentarEntrar(codigo, senha) {
  if (ocupado) return false;
  ocupado = true;
  try {
    const resposta = await chamar('entrar', { codigo, senha }, ctx.perfil);
    if (!resposta?.visao) return false;
    ocupado = false;
    abrirSala(resposta.visao);
    return true;
  } catch (erro) {
    if (erro.motivo === 'senha') {
      pedirSenha(codigo, senha ? 'Senha incorreta. Tente de novo.' : null);
    } else {
      ctx.torrada(erro.message ?? 'Não consegui entrar na sala.');
    }
    return false;
  } finally {
    ocupado = false;
  }
}

function pedirSenha(codigo, aviso = null) {
  ctx.modal(`🔒 Sala ${codigo}`,
    `<p>${aviso ?? 'Esta sala tem senha. Digite a que o dono da mesa passou.'}</p>
     <input class="entrada" id="campo-senha" maxlength="20" autocomplete="off"
       placeholder="Senha da sala" style="width:100%">`,
    [
      { texto: 'VOLTAR' },
      { texto: 'ENTRAR', classe: 'ouro', acao: () => tentarEntrar(codigo, $('campo-senha').value) },
    ]);
  const campo = $('campo-senha');
  campo.onkeydown = (e) => {
    if (e.key === 'Enter') [...$('modal-rodape').children].at(-1).click();
  };
  setTimeout(() => campo.focus(), 60);
}

// ------------------------------------------------------------ vida da sala

function ligarSala(codigo) {
  desligarSala();
  // desligarSala zera o código; sem regravar aqui, naSala() mentia "fora da sala" e o
  // botão Menu saía sem avisar o servidor nem limpar o ?sala= do endereço.
  codigoAtual = codigo;
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
      } else if (eu?.crupie) {
        const h = agora.historico[0];
        som.empate();
        ctx.anuncio(h?.dealerEstourou ? 'DEALER ESTOUROU' : `DEALER FEZ ${h?.dealer ?? ''}`,
          'Banca da casa: você não ganha nem perde', '');
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
    ['Fichas iniciais', curto(c.fichasIniciais)],
    ['Aposta', `${curto(c.apostaMin)} a ${curto(c.apostaMax)}`],
    ['Rodadas', c.limiteRodadas === null ? 'Ilimitado' : fmt(c.limiteRodadas)],
    ['Jogadores', `${visao.jogadores.filter((j) => !j.espectador).length}/${c.maxJogadores}`],
    ['Tempo por jogada', `${c.tempoTurno}s`],
    ['Tempo para apostar', `${c.tempoAposta}s`],
    ['Senha', visao.temSenha ? '🔒 sim' : 'não'],
    ['Crupiê', c.crupieHumano ? 'jogador' : 'automático'],
    ['Na lista de salas', c.publica ? 'sim' : 'não'],
  ].map(([r, v]) => `<div class="numero"><b>${v}</b><span>${r}</span></div>`).join('');

  $('lobby-jogadores').innerHTML = visao.jogadores.map((j) => `
    <div class="item ${j.crupie ? 'crupie' : j.pronto ? 'feito' : ''}">
      <span class="ic">${j.crupie ? '🎩' : j.avatar ?? '🂡'}</span>
      <span><b>${escapar(j.nome)} ${j.ehHost ? '<small>ADM</small>' : ''}</b>
        <small>${j.crupie ? 'conduz a mesa, não aposta'
          : j.espectador ? 'assistindo' : `${fmt(j.fichas)} fichas`}${j.conectado ? '' : ' · desconectado'}</small></span>
      <span class="premio">${j.crupie ? 'CRUPIÊ' : j.espectador ? '👁' : j.pronto ? 'PRONTO' : '...'}</span>
    </div>`).join('');

  pintarLugarDeCrupie();

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
  btnIniciar.disabled = ocupado
    || visao.jogadores.filter((j) => !j.espectador && !j.crupie).length < 1;
  btnIniciar.onclick = () => { som.botao(); acao('iniciar', { codigo: visao.codigo }); };

  $('btn-copiar-link').onclick = copiarConvite;
}

// O lugar de crupiê fica aberto no lobby: quem quiser, assume; quem assumiu, larga.
function pintarLugarDeCrupie() {
  const caixa = $('lobby-crupie');
  if (!visao.config.crupieHumano) {
    caixa.hidden = true;
    return;
  }
  caixa.hidden = false;
  const eu = euNaVisao();
  const crupie = visao.jogadores.find((j) => j.id === visao.crupieId);
  const souEu = crupie?.id === meuId();

  $('lobby-crupie-quem').textContent = crupie
    ? (souEu ? 'Você é o crupiê desta mesa.' : `${crupie.nome} é o crupiê desta mesa.`)
    : 'Ninguém assumiu. Se continuar assim, o dealer automático joga.';

  const botao = $('btn-crupie');
  botao.hidden = Boolean(crupie && !souEu) || Boolean(eu?.espectador);
  botao.textContent = souEu ? 'DEIXAR DE SER O CRUPIÊ' : 'QUERO SER O CRUPIÊ';
  botao.className = `botao ${souEu ? 'discreto' : 'ouro'}`;
  botao.disabled = ocupado;
  botao.onclick = () => { som.botao(); acao('crupie', { codigo: visao.codigo, valor: !souEu }); };
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
  const texto = `Entra na minha mesa de blackjack: ${url.toString()} (código ${visao.codigo})`
    + (visao.temSenha ? ' — a senha eu te passo separado.' : '');
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
    `APOSTA DE ${curto(visao.config.apostaMin)} A ${curto(visao.config.apostaMax)}`.toUpperCase();

  const caixaDealer = $('sala-cartas-dealer');
  caixaDealer.innerHTML = '';
  for (const carta of visao.dealer.cartas) caixaDealer.append(elementoCarta(carta));
  for (let i = 0; i < visao.dealer.escondidas; i++) {
    caixaDealer.append(elementoCarta(null, { virada: true }));
  }
  // Com crupiê de verdade, o dealer tem nome e brilha quando é a vez dele.
  const crupie = visao.jogadores.find((j) => j.id === visao.crupieId);
  $('sala-nome-dealer').textContent = crupie ? `Crupiê · ${crupie.nome}` : 'Dealer';
  document.querySelector('.lugar-dealer')
    .classList.toggle('na-vez', visao.status === STATUS_SALA.TURNO_DEALER && Boolean(crupie));

  $('sala-valor-dealer').innerHTML = visao.dealer.cartas.length
    ? `<span class="valor-lugar ${visao.dealer.revelado && visao.dealer.valor > 21 ? 'ruim' : ''}">${
      visao.dealer.revelado && visao.dealer.valor > 21
        ? `${visao.dealer.valor} · ESTOUROU`
        : textoValor(visao.dealer.cartas)}</span>`
    : '';

  pintarLugares();
  $('sala-minhas-fichas').innerHTML = eu?.crupie ? 'você é o crupiê'
    : eu && !eu.espectador ? `<span class="moeda"></span> ${fmt(eu.fichas)}`
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
  // O crupiê não tem lugar no arco: ele é o dealer, lá em cima.
  const naMesa = visao.jogadores.filter((j) => !j.espectador && !j.crupie);
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

// A aposta da rodada é montada, não escolhida numa lista: o jogador digita o
// valor que quiser ou soma fichas, e só então confirma. O painel é montado uma
// vez por rodada e depois só atualizado — redesenhar a cada aviso do servidor
// apagaria o que a pessoa está digitando.
const FICHAS_DA_SALA = [50, 100, 500, 1000, 5000, 10000];
let apostaMontada = 0;
let ultimaApostaNaSala = 0;

function tetoDaAposta(eu) {
  return Math.min(visao.config.apostaMax, eu.fichas);
}

function pintarFichasDeAposta(eu) {
  const caixa = $('sala-fichas');
  const apostando = visao.status === STATUS_SALA.APOSTAS && !eu.apostaPendente
    && !eu.espectador && !eu.crupie;
  if (!apostando) {
    caixa.innerHTML = '';
    caixa.dataset.rodada = '';
    return;
  }

  const c = visao.config;
  if (tetoDaAposta(eu) < c.apostaMin) {
    caixa.dataset.rodada = '';
    caixa.innerHTML = `<div class="dica">Suas fichas não pagam a aposta mínima de ${fmt(c.apostaMin)}.</div>`;
    if (c.permitirRecompra) {
      const b = document.createElement('button');
      b.className = 'botao ouro';
      b.textContent = 'RECOMPRAR';
      b.disabled = ocupado;
      b.onclick = () => { som.ficha(); acao('recomprar', { codigo: visao.codigo }); };
      caixa.append(b);
    }
    return;
  }

  if (caixa.dataset.rodada !== String(visao.rodada)) {
    caixa.dataset.rodada = String(visao.rodada);
    // Começa com a aposta da rodada anterior, se ainda couber; senão, a mínima.
    const anterior = ultimaApostaNaSala;
    apostaMontada = anterior >= c.apostaMin && anterior <= tetoDaAposta(eu) ? anterior : c.apostaMin;
    montarPainelDeAposta(caixa, eu);
  }
  atualizarPainelDeAposta(eu);
}

function montarPainelDeAposta(caixa, eu) {
  const teto = tetoDaAposta(eu);
  const fichas = FICHAS_DA_SALA.filter((v) => v <= teto);

  caixa.innerHTML = `
    <div class="montar-aposta">
      <!-- Deitado, como na carreira: o círculo de aposta com o valor, as fichas com os
           atalhos em texto, e o botão. Em pé ele ficava tão alto que empurrava o feltro. -->
      <label class="circulo-sala">
        <span class="rot">APOSTA</span>
        <input id="valor-aposta-sala" inputmode="numeric" autocomplete="off" aria-label="Valor da aposta">
      </label>
      <div class="meio-aposta">
        <div class="fichas fichas-da-sala">
          ${fichas.map((v) => `<button class="ficha f${v}" data-soma="${v}">${v >= 1000 ? `${v / 1000}K` : v}</button>`).join('')}
        </div>
        <div class="atalhos-aposta">
          <button data-atalho="limpar">LIMPAR</button>
          <button data-atalho="minimo">MÍNIMO</button>
          <button data-atalho="dobro">DOBRAR</button>
          <button data-atalho="maximo">MÁXIMO</button>
        </div>
      </div>
      <button class="botao ouro" id="btn-confirmar-aposta">APOSTAR</button>
    </div>`;

  const campo = $('valor-aposta-sala');
  campo.oninput = () => {
    const digitos = campo.value.replace(/\D/g, '').slice(0, 12);
    campo.value = digitos;
    apostaMontada = Number(digitos) || 0;
    atualizarPainelDeAposta(euNaVisao(), { mexendoNoCampo: true });
  };
  campo.onkeydown = (e) => { if (e.key === 'Enter') $('btn-confirmar-aposta').click(); };

  for (const b of caixa.querySelectorAll('[data-soma]')) {
    b.onclick = () => {
      som.ficha();
      apostaMontada = Math.min(apostaMontada + Number(b.dataset.soma), tetoDaAposta(euNaVisao()));
      atualizarPainelDeAposta(euNaVisao());
    };
  }
  for (const b of caixa.querySelectorAll('[data-atalho]')) {
    b.onclick = () => {
      som.botao();
      const eu = euNaVisao();
      const c = visao.config;
      if (b.dataset.atalho === 'limpar') apostaMontada = 0;
      if (b.dataset.atalho === 'minimo') apostaMontada = c.apostaMin;
      if (b.dataset.atalho === 'dobro') apostaMontada = Math.min(Math.max(apostaMontada, c.apostaMin) * 2, tetoDaAposta(eu));
      if (b.dataset.atalho === 'maximo') apostaMontada = tetoDaAposta(eu);
      atualizarPainelDeAposta(eu);
    };
  }

  $('btn-confirmar-aposta').onclick = () => {
    const eu = euNaVisao();
    if (problemaDaAposta(eu)) return;
    som.ficha();
    ultimaApostaNaSala = apostaMontada;
    acao('apostar', { codigo: visao.codigo, valor: apostaMontada });
  };
}

function problemaDaAposta(eu) {
  const c = visao.config;
  if (!apostaMontada) return 'Escolha o valor';
  if (apostaMontada < c.apostaMin) return `Mínimo ${fmt(c.apostaMin)}`;
  if (apostaMontada > c.apostaMax) return `Máximo ${fmt(c.apostaMax)}`;
  if (apostaMontada > eu.fichas) return 'Fichas insuficientes';
  return null;
}

function atualizarPainelDeAposta(eu, { mexendoNoCampo = false } = {}) {
  const campo = $('valor-aposta-sala');
  const confirmar = $('btn-confirmar-aposta');
  if (!campo || !confirmar || !eu) return;

  // Não reescreve o campo enquanto a pessoa digita: o cursor pularia para o fim.
  if (!mexendoNoCampo && document.activeElement !== campo) {
    campo.value = apostaMontada ? String(apostaMontada) : '';
  }

  const teto = tetoDaAposta(eu);
  for (const b of document.querySelectorAll('#sala-fichas [data-soma]')) {
    b.disabled = ocupado || apostaMontada + Number(b.dataset.soma) > teto;
  }
  for (const b of document.querySelectorAll('#sala-fichas [data-atalho]')) b.disabled = ocupado;

  const problema = problemaDaAposta(eu);
  confirmar.disabled = ocupado || Boolean(problema);
  confirmar.textContent = problema ? problema.toUpperCase() : `APOSTAR ${fmt(apostaMontada)}`;
}

function pintarAcoes(eu) {
  const caixa = $('sala-acoes');
  caixa.innerHTML = '';
  const dica = $('sala-dica');

  if (eu.crupie && visao.status === STATUS_SALA.APOSTAS) {
    dica.textContent = 'Você é o crupiê. Os jogadores estão apostando.';
    return;
  }

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
    if (visao.status === STATUS_SALA.TURNO_JOGADORES && daVez) {
      dica.textContent = eu.crupie
        ? `Vez de ${daVez.nome}. A sua chega depois dos jogadores.`
        : `Vez de ${daVez.nome}.`;
    } else if (visao.status === STATUS_SALA.TURNO_DEALER && daVez) {
      dica.textContent = `Vez do crupiê ${daVez.nome}.`;
    } else {
      dica.textContent = visao.status === STATUS_SALA.RESULTADO ? 'Resultado da rodada.' : 'O dealer está jogando.';
    }
    return;
  }

  if (acoesDeCrupie().length) {
    dica.textContent = `Sua vez de crupiê: o dealer tem ${visao.dealer.valor}. Peça ou pare quando quiser.`;
  } else {
    dica.textContent = eu.maos.length > 1
      ? `Sua vez — mão ${eu.maoAtual + 1} de ${eu.maos.length}.`
      : 'Sua vez.';
  }

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
  // Link de sala com senha cai no mesmo pedido de senha da lista.
  return tentarEntrar(codigo.toUpperCase());
}
