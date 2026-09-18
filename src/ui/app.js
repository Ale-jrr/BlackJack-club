// Casca do jogo: topo, navegação entre telas e as telas que não são a mesa.

import { BONUS_RECUPERACAO, MESAS } from '../motor/regras.js';
import { BONUS_DIARIO } from '../dados/progressao.js';
import {
  apagar, bonusDisponivel, carregar, conquistasParaTela, esperaRecuperacao,
  faltaParaSubir, garantirMissoes, missoesParaTela, precisaRecuperacao,
  resgatarBonus, resgatarRecuperacao, salvar, winRate,
} from '../dados/perfil.js';
import { abrirMesa, atualizarSaldoDaMesa, emRodada, linhaHistorico, prepararMesa } from './mesa.js';
import {
  abrirAmigos, atualizarListasDeSalas, desligarSala, entrarPorLink, ligarListasDeSalas,
  naSala, prepararSalas, sairDaSala,
} from './salas.js';
import { abrirTutorial, prepararTutorial } from './tutorial.js';
import { acordarAudio, configurarSom, som } from './som.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');

const AVATARES = ['🂡', '🂱', '🃁', '🃑', '🎩', '👑', '🦊', '🐺', '🐲', '🃏'];

const perfil = carregar();
garantirMissoes(perfil);

let telaAtual = 'menu';

// --------------------------------------------------------------- navegação

const TELAS = {
  menu: 'tela-menu',
  jogo: 'tela-jogo',
  mesas: 'tela-mesas',
  amigos: 'tela-amigos',
  criar: 'tela-criar',
  sala: 'tela-sala',
  missoes: 'tela-missoes',
  estatisticas: 'tela-estatisticas',
  perfil: 'tela-perfil',
  tutorial: 'tela-tutorial',
  config: 'tela-config',
};

function ir(nome) {
  if (telaAtual === 'jogo' && nome !== 'jogo' && emRodada()) {
    perguntar('Sair da rodada?', 'A rodada em andamento fica para trás e a aposta já feita é perdida.', () => {
      forcarIr(nome);
    });
    return;
  }
  if (telaAtual === 'sala' && nome !== 'sala' && naSala()) {
    perguntar('Sair da sala?', 'Sua vaga é liberada e as fichas daquela mesa ficam para trás.', async () => {
      await sairDaSala();
      forcarIr(nome);
    });
    return;
  }
  forcarIr(nome);
}

function forcarIr(nome) {
  telaAtual = nome;
  for (const [chave, id] of Object.entries(TELAS)) {
    $(id).classList.toggle('ativa', chave === nome);
  }
  $('btn-voltar').hidden = nome === 'menu';
  if (nome === 'mesas') pintarMesas();
  if (nome === 'missoes') pintarMissoes();
  if (nome === 'estatisticas') pintarEstatisticas();
  if (nome === 'perfil') pintarPerfil();
  if (nome === 'config') pintarConfig();
  if (nome === 'menu') { pintarMenu(); atualizarListasDeSalas(); }
  window.scrollTo(0, 0);
}

$('btn-voltar').onclick = () => {
  som.botao();
  if (telaAtual === 'jogo') return ir('mesas');
  if (telaAtual === 'criar') return ir('amigos');
  ir('menu');
};

// -------------------------------------------------------------------- topo

function atualizarTopo({ animar = false } = {}) {
  $('nome-jogador').textContent = perfil.nome;
  $('avatar').textContent = perfil.avatar;
  $('nivel').textContent = `Nível ${perfil.nivel}`;
  const falta = faltaParaSubir(perfil);
  $('barra-xp').style.width = `${Math.min(100, (perfil.xp / falta) * 100)}%`;
  $('texto-xp').textContent = `${fmt(perfil.xp)} / ${fmt(falta)} XP`;
  $('valor-saldo').textContent = fmt(perfil.saldo);
  if (animar) {
    $('saldo').classList.remove('subindo');
    void $('saldo').offsetWidth;
    $('saldo').classList.add('subindo');
  }
  atualizarSaldoDaMesa();
  salvar(perfil);
}

// ------------------------------------------------------------------ avisos

function torrada(html) {
  const el = document.createElement('div');
  el.className = 'torrada';
  el.innerHTML = html;
  $('torradas').append(el);
  setTimeout(() => el.remove(), 3500);
}

function anuncio(titulo, detalhe, classe = '') {
  const el = $('anuncio');
  el.className = classe;
  el.querySelector('b').textContent = titulo;
  el.querySelector('span').textContent = detalhe;
  void el.offsetWidth;
  el.classList.add('aparece');
  setTimeout(() => el.classList.remove('aparece'), 1600);
}

function modal(titulo, corpoHTML, botoes) {
  $('modal-titulo').textContent = titulo;
  $('modal-corpo').innerHTML = corpoHTML;
  const rodape = $('modal-rodape');
  rodape.innerHTML = '';
  for (const b of botoes) {
    const el = document.createElement('button');
    el.className = `botao ${b.classe ?? 'discreto'}`;
    el.textContent = b.texto;
    el.onclick = () => { fecharModal(); b.acao?.(); };
    rodape.append(el);
  }
  $('modal').classList.add('aberto');
}

function fecharModal() { $('modal').classList.remove('aberto'); }
$('modal').onclick = (e) => { if (e.target === $('modal')) fecharModal(); };

function perguntar(titulo, texto, aoConfirmar) {
  modal(titulo, `<p>${texto}</p>`, [
    { texto: 'VOLTAR' },
    { texto: 'CONFIRMAR', classe: 'vermelho', acao: aoConfirmar },
  ]);
}

// ------------------------------------------------------------------- menu

const ACOES_ENTRADA = [
  { titulo: 'JOGAR', sub: 'carreira contra o dealer', classe: 'principal', acao: () => ir('mesas') },
  { titulo: 'MESA COM AMIGOS', sub: 'salas de até 10', classe: 'secundaria', acao: () => abrirAmigos() },
];

// Desenho de traço branco no miolo da ficha: diz para que serve o botão sem ler o nome.
const traco = (corpo) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;
const ICONES = {
  missoes: traco('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
  ranking: traco('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v3.5M8.5 20h7M10 16.5h4l.5 3.5h-5z"/>'),
  perfil: traco('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.9-3.9 3.8-6.2 7.5-6.2s6.6 2.3 7.5 6.2"/>'),
  stats: traco('<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="7" rx=".6"/><rect x="10.5" y="6" width="3" height="12" rx=".6"/><rect x="15.5" y="13.5" width="3" height="4.5" rx=".6"/>'),
  tutorial: traco('<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c1.4 1.6 3.3 2.4 5.5 2.4s4.1-.8 5.5-2.4V11"/><path d="M21.5 9v5"/>'),
  loja: traco('<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'),
  config: traco('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
};

// Cada item é uma ficha de cassino, com a cor de um valor de verdade e o desenho da função no miolo.
const ITENS_MENU = [
  { titulo: 'Missões', cor: '#2f6fd0', icone: ICONES.missoes, acao: () => ir('missoes') },
  { titulo: 'Ranking', cor: '#1f8a55', icone: ICONES.ranking, acao: () => ir('perfil') },
  { titulo: 'Perfil', cor: '#b8322f', icone: ICONES.perfil, acao: () => ir('perfil') },
  { titulo: 'Estatísticas', cor: '#6a3cb0', icone: ICONES.stats, acao: () => ir('estatisticas') },
  { titulo: 'Como se joga', cor: '#c9962e', icone: ICONES.tutorial, acao: () => abrirTutorial() },
  { titulo: 'Loja', cor: '#5f6b70', icone: ICONES.loja, breve: true, acao: () => modal(
      'Loja',
      `<p>A loja é só cosmética: baralhos, mesas, fichas, molduras e efeitos. Nada nela muda
        a chance de nenhuma mão.</p>
       <p>Ela entra depois da progressão, junto com as mesas desbloqueáveis por nível.</p>`,
      [{ texto: 'ENTENDI', classe: 'ouro' }]) },
  { titulo: 'Configurações', cor: '#23292c', icone: ICONES.config, acao: () => ir('config') },
];

function pintarMenu() {
  const acoes = $('acoes-entrada');
  acoes.innerHTML = '';
  for (const item of ACOES_ENTRADA) {
    const b = document.createElement('button');
    b.className = `acao-entrada ${item.classe}`;
    b.innerHTML = `<b>${item.titulo}</b><span>${item.sub}</span>`;
    b.onclick = () => { som.botao(); item.acao(); };
    acoes.append(b);
  }

  const cardapio = $('menu-grade');
  cardapio.innerHTML = '';
  for (const item of ITENS_MENU) {
    const b = document.createElement('button');
    b.className = `ficha-menu${item.breve ? ' breve' : ''}`;
    b.style.setProperty('--cor', item.cor);
    b.innerHTML = `<span class="disco"><span class="miolo">${item.icone}</span></span>
      <span class="nome">${item.titulo}${item.breve ? '<small>em breve</small>' : ''}</span>`;
    b.onclick = () => { som.botao(); item.acao(); };
    cardapio.append(b);
  }

  // O bônus é um recado do dealer, não mais um botão: uma frase no feltro.
  const bonus = $('aviso-bonus');
  bonus.hidden = !bonusDisponivel(perfil);
  bonus.innerHTML = 'Seu bônus do dia está na mesa — <u>pegar fichas</u>';
  bonus.onclick = () => { som.botao(); ir('missoes'); };
}

// ------------------------------------------------------------------ mesas

function pintarMesas() {
  const caixa = $('lista-mesas');
  caixa.innerHTML = '';
  for (const mesa of MESAS) {
    const liberada = perfil.nivel >= mesa.nivel;
    const temSaldo = perfil.saldo >= mesa.min;
    const b = document.createElement('button');
    b.className = `mesa-item${perfil.mesaId === mesa.id ? ' escolhida' : ''}`;
    b.disabled = !liberada || !temSaldo;
    b.innerHTML = `<span><b>${mesa.nome}</b>
        <small>Aposta de <span class="moeda"></span> ${fmt(mesa.min)} a <span class="moeda"></span> ${fmt(mesa.max)}</small></span>
      <span class="req">${liberada ? (temSaldo ? 'JOGAR →' : 'saldo baixo') : `Nível ${mesa.nivel}`}</span>`;
    b.onclick = () => {
      som.botao();
      perfil.mesaId = mesa.id;
      salvar(perfil);
      abrirMesa(mesa);
      forcarIr('jogo');
      if (!perfil.tutorialVisto) {
        perfil.tutorialVisto = true;
        salvar(perfil);
        modal('Primeira vez?',
          `<p>O tutorial mostra as cartas, as jogadas, como o dealer joga e as contas de
            pagamento — e termina com um teste rápido.</p>`,
          [{ texto: 'AGORA NÃO' }, { texto: 'VER TUTORIAL', classe: 'ouro', acao: () => abrirTutorial() }]);
      }
    };
    caixa.append(b);
  }

  if (precisaRecuperacao(perfil)) {
    const falta = esperaRecuperacao(perfil);
    const div = document.createElement('div');
    div.className = 'cartao';
    div.style.marginTop = '16px';
    div.innerHTML = `<h2>Sem fichas para a menor aposta</h2>
      <p class="vazio">O clube te dá <span class="moeda"></span> ${fmt(BONUS_RECUPERACAO.valor)} para você voltar à mesa.</p>`;
    const b = document.createElement('button');
    b.className = 'botao ouro';
    b.textContent = falta > 0 ? `AGUARDE ${Math.ceil(falta / 60000)} MIN` : `PEGAR ${fmt(BONUS_RECUPERACAO.valor)} FICHAS`;
    b.disabled = falta > 0;
    b.onclick = () => {
      const valor = resgatarRecuperacao(perfil);
      if (valor) {
        som.vitoria();
        torrada(`Bônus de recuperação <span class="premio">+${fmt(valor)}</span>`);
        atualizarTopo({ animar: true });
        pintarMesas();
      }
    };
    div.append(b);
    caixa.append(div);
  }
}

// ---------------------------------------------------------------- missões

function pintarMissoes() {
  const trilha = $('trilha-bonus');
  const ciclo = perfil.bonusDiario.ciclo;
  trilha.innerHTML = BONUS_DIARIO.map((valor, i) => {
    const classe = i < ciclo ? 'passou' : i === ciclo ? 'hoje' : '';
    return `<div class="dia ${classe}"><span>Dia ${i + 1}</span><b>${fmt(valor)}</b></div>`;
  }).join('');

  const btn = $('btn-bonus');
  const pode = bonusDisponivel(perfil);
  btn.disabled = !pode;
  btn.textContent = pode ? `RESGATAR ${fmt(BONUS_DIARIO[ciclo])} FICHAS` : 'JÁ RESGATADO HOJE';
  btn.onclick = () => {
    const valor = resgatarBonus(perfil);
    if (!valor) return;
    som.vitoria();
    torrada(`Bônus diário <span class="premio">+${fmt(valor)}</span>`);
    atualizarTopo({ animar: true });
    pintarMissoes();
  };

  const { diarias, semanais } = missoesParaTela(perfil);
  const linha = (m) => `<div class="item ${m.pronta ? 'feito' : ''}">
      <span class="ic">${m.pronta ? '✅' : '🎯'}</span>
      <span><b>${m.texto}</b>
        <small>${Math.min(m.feito, m.alvo)} / ${m.alvo}</small>
        <span class="progresso"><i style="width:${Math.min(100, (m.feito / m.alvo) * 100)}%"></i></span>
      </span>
      <span class="premio"><span class="moeda"></span> ${fmt(m.premio)}</span>
    </div>`;
  $('missoes-diarias').innerHTML = diarias.map(linha).join('');
  $('missoes-semanais').innerHTML = semanais.map(linha).join('');

  $('lista-conquistas').innerHTML = conquistasParaTela(perfil).map((c) => `
    <div class="item ${c.feita ? 'feito' : ''}">
      <span class="ic">${c.feita ? '🏅' : '🔒'}</span>
      <span><b>${c.nome}</b><small>${c.feita ? 'Conquistada' : 'Bloqueada'}</small></span>
      <span class="premio"><span class="moeda"></span> ${fmt(c.premio)}</span>
    </div>`).join('');
}

// ----------------------------------------------------------- estatísticas

function pintarEstatisticas() {
  const e = perfil.estatisticas;
  const itens = [
    ['Rodadas', fmt(e.rodadas)], ['Mãos', fmt(e.maos)],
    ['Vitórias', fmt(e.vitorias)], ['Derrotas', fmt(e.derrotas)], ['Empates', fmt(e.empates)],
    ['Win rate', `${(winRate(e) * 100).toFixed(1)}%`],
    ['Blackjacks', fmt(e.blackjacks)], ['Estouros', fmt(e.busts)],
    ['Splits', fmt(e.splits)], ['Doubles', fmt(e.doubles)],
    ['Maior aposta', fmt(e.maiorAposta)], ['Maior vitória', fmt(e.maiorVitoria)],
    ['Maior saldo', fmt(e.maiorSaldo)], ['Total apostado', fmt(e.totalApostado)],
    ['Total ganho', fmt(e.totalGanho)], ['Maior sequência', fmt(e.maiorSequencia)],
  ];
  $('numeros-stats').innerHTML = itens
    .map(([r, v]) => `<div class="numero"><b>${v}</b><span>${r}</span></div>`).join('');

  $('historico-completo').innerHTML = perfil.historico.length
    ? perfil.historico.map(linhaHistorico).join('')
    : '<div class="vazio">Jogue uma rodada para o histórico começar.</div>';
}

// ----------------------------------------------------------------- perfil

function pintarPerfil() {
  const entrada = $('entrada-nome');
  entrada.value = perfil.nome;
  entrada.oninput = () => {
    perfil.nome = entrada.value.trim().slice(0, 18) || 'Jogador';
    atualizarTopo();
  };

  const lista = $('lista-avatares');
  lista.innerHTML = '';
  for (const a of AVATARES) {
    const b = document.createElement('button');
    b.className = `botao discreto${perfil.avatar === a ? ' ouro' : ''}`;
    b.style.minWidth = '52px';
    b.textContent = a;
    b.onclick = () => { perfil.avatar = a; som.botao(); atualizarTopo(); pintarPerfil(); };
    lista.append(b);
  }

  const e = perfil.estatisticas;
  $('numeros-perfil').innerHTML = [
    ['Nível', fmt(perfil.nivel)],
    ['XP do nível', `${fmt(perfil.xp)} / ${fmt(faltaParaSubir(perfil))}`],
    ['Saldo', fmt(perfil.saldo)],
    ['Conquistas', `${perfil.conquistas.length} / ${conquistasParaTela(perfil).length}`],
  ].map(([r, v]) => `<div class="numero"><b>${v}</b><span>${r}</span></div>`).join('');

  $('numeros-ranking').innerHTML = [
    ['XP total', fmt(perfil.xp + (perfil.nivel - 1) * 250)],
    ['Vitórias', fmt(e.vitorias)],
    ['Blackjacks', fmt(e.blackjacks)],
    ['Maior sequência', fmt(e.maiorSequencia)],
    ['Maior saldo', fmt(e.maiorSaldo)],
  ].map(([r, v]) => `<div class="numero"><b>${v}</b><span>${r}</span></div>`).join('');
}

// ---------------------------------------------------------- configurações

function pintarConfig() {
  const musica = $('chave-musica');
  const efeitos = $('chave-efeitos');
  musica.classList.toggle('ligada', perfil.som.musica);
  efeitos.classList.toggle('ligada', perfil.som.efeitos);

  musica.onclick = () => {
    perfil.som.musica = !perfil.som.musica;
    configurarSom(perfil.som);
    salvar(perfil);
    pintarConfig();
  };
  efeitos.onclick = () => {
    perfil.som.efeitos = !perfil.som.efeitos;
    configurarSom(perfil.som);
    salvar(perfil);
    som.botao();
    pintarConfig();
  };

  $('btn-tutorial').onclick = () => { som.botao(); abrirTutorial(); };
  $('btn-zerar').onclick = () => perguntar(
    'Apagar tudo?',
    'Saldo, nível, XP, missões, conquistas e histórico deste navegador somem para sempre.',
    () => { apagar(); location.reload(); },
  );
}

// ------------------------------------------------------------------ início

prepararMesa({
  perfil,
  atualizarTopo,
  torrada,
  anuncio,
  aoTerminarRodada: () => { if (telaAtual === 'jogo') { /* a lateral se repinta sozinha */ } },
});

prepararSalas({ perfil, torrada, anuncio, modal, irPara: forcarIr, atualizarTopo });

prepararTutorial({
  irPara: forcarIr,
  jogar: () => { perfil.tutorialVisto = true; salvar(perfil); ir('mesas'); },
});

configurarSom(perfil.som);
document.addEventListener('pointerdown', () => acordarAudio(perfil.som), { once: true });

atualizarTopo();
forcarIr('menu');

// A lista de salas abertas se atualiza sozinha enquanto estiver na tela.
ligarListasDeSalas();

// Link de convite abre direto na sala (§49).
entrarPorLink().catch(() => { /* código velho ou sala fechada: fica no menu */ });

// Guarda o perfil ao sair, caso a última rodada tenha mexido em algo.
window.addEventListener('pagehide', () => { salvar(perfil); desligarSala(); });
