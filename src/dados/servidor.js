// Conversa com o servidor das salas.
//
// A chave abaixo é a chave PÚBLICA do projeto: ela nasceu para ficar no
// navegador. Ela não abre as tabelas — o RLS está ligado e sem policy nenhuma,
// então nem lendo o código do site alguém chega nas cartas. Quem toca no banco
// é só a Edge Function, com a chave de serviço que nunca sai do servidor.

const PROJETO = 'zwltwqvddvacbgpswsac';
const URL_FUNCAO = `https://${PROJETO}.supabase.co/functions/v1/sala`;
const URL_REALTIME = `wss://${PROJETO}.supabase.co/realtime/v1/websocket`;
const CHAVE_PUBLICA = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3bHR3cXZkZHZhY2JncHN3c2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1ODQ0ODgsImV4cCI6MjEwNTE2MDQ4OH0.HGOoFrtY5uT75SSuTgtPHf0Q3XsmM9HmrrinjWBdSvE';

const CHAVE_IDENTIDADE = 'blackjack-club:identidade:v1';

// Quanto o relógio deste computador está adiantado ou atrasado em relação ao do
// servidor. Sem isso, um relógio errado no aparelho mostraria o cronômetro da
// vez todo torto — e é o prazo do servidor que vale.
let deslocamentoDoRelogio = 0;

export function agoraDoServidor() {
  return Date.now() + deslocamentoDoRelogio;
}

// ------------------------------------------------------------- identidade

// Id e segredo ficam neste navegador. O segredo é o que prova, a cada ação,
// que quem mandou é o dono do assento — sem ele bastaria saber o id de alguém.
export function identidade() {
  try {
    const guardado = localStorage.getItem(CHAVE_IDENTIDADE);
    if (guardado) return JSON.parse(guardado);
  } catch { /* segue para criar uma nova */ }

  const nova = { id: sorteioId(), segredo: sorteioId() + sorteioId() };
  try { localStorage.setItem(CHAVE_IDENTIDADE, JSON.stringify(nova)); } catch { /* em memória */ }
  return nova;
}

function sorteioId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// ----------------------------------------------------------------- chamada

export class ErroDoServidor extends Error {
  constructor(motivo, mensagem) {
    super(mensagem);
    this.motivo = motivo;
  }
}

export async function chamar(acao, dados = {}, perfil = {}) {
  const eu = identidade();
  let resposta;
  try {
    resposta = await fetch(URL_FUNCAO, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CHAVE_PUBLICA}`,
        apikey: CHAVE_PUBLICA,
      },
      body: JSON.stringify({
        acao,
        segredo: eu.segredo,
        jogador: { id: eu.id, nome: perfil.nome, avatar: perfil.avatar },
        ...dados,
      }),
    });
  } catch {
    throw new ErroDoServidor('rede', 'Sem conexão com o servidor da sala.');
  }

  const dataDoServidor = Date.parse(resposta.headers.get('date') ?? '');
  if (Number.isFinite(dataDoServidor)) deslocamentoDoRelogio = dataDoServidor - Date.now();

  let corpo;
  try {
    corpo = await resposta.json();
  } catch {
    throw new ErroDoServidor('resposta', 'O servidor respondeu algo que não entendi.');
  }
  if (corpo?.erro) throw new ErroDoServidor(corpo.erro.motivo, corpo.erro.mensagem);
  return corpo;
}

export function meuId() {
  return identidade().id;
}

// ---------------------------------------------------------------- realtime

// Cada chamada à função do servidor gasta da cota mensal do plano grátis (500
// mil por mês). A sala tem três jeitos de ficar em dia, do mais barato ao mais
// caro:
//
// 1. Tempo real: o servidor avisa a cada mudança, em ~0,2 s. Não gasta chamada.
// 2. Aviso do prazo: quando a vez, a aposta ou a pausa do resultado vencem,
//    alguém precisa pedir ao servidor para andar (ele não tem relógio próprio).
//    Cada cliente agenda um `tique` para o instante do prazo, com um atraso
//    sorteado: o primeiro que chega faz a mesa andar, o tempo real avisa os
//    outros, e esses cancelam o próprio aviso.
// 3. Sonda de segurança: pergunta o estado de tempos em tempos, caso o socket
//    tenha caído sem avisar. Com o canal de pé ela é lenta; sem canal, rápida.
//
// Antes eram só a 1 e uma sonda de 4 em 4 segundos: 15 chamadas por minuto por
// jogador parado, o que gastava a cota do mês em ~550 horas de jogo.
const SONDA_COM_CANAL = 20000;
const SONDA_SEM_CANAL = 4000;
const ATRASO_DO_PRAZO = { minimo: 250, sorteio: 1500 };
const RESPIRO_ENTRE_AVISOS = 1500;

export function assinar(codigo, aoReceber) {
  let socket = null;
  let batida = null;
  let sonda = null;
  let vivo = true;
  let tentativas = 0;
  let canalConfirmado = false;
  let ultimaSonda = Date.now();
  let alarmeDoPrazo = null;
  let prazoAgendado = null;
  let ultimoAviso = 0;

  const topico = `realtime:sala-${codigo}`;

  const entregar = (visao, origem) => {
    agendarAvisoDoPrazo(visao);
    aoReceber(visao, origem);
  };

  const canalDePe = () => canalConfirmado && socket?.readyState === WebSocket.OPEN;

  // ------------------------------------------------- aviso do prazo (2)
  function agendarAvisoDoPrazo(visao) {
    const prazo = visao?.prazo ?? null;
    if (prazo === prazoAgendado) return;            // mesmo prazo: já está agendado
    prazoAgendado = prazo;
    clearTimeout(alarmeDoPrazo);
    if (!prazo) return;

    const falta = Math.max(0, prazo - agoraDoServidor());
    const sorteio = ATRASO_DO_PRAZO.minimo + Math.random() * ATRASO_DO_PRAZO.sorteio;
    const respiro = Math.max(0, RESPIRO_ENTRE_AVISOS - (Date.now() - ultimoAviso));
    alarmeDoPrazo = setTimeout(avisarPrazo, Math.max(falta + sorteio, respiro), prazo);
  }

  async function avisarPrazo(prazo) {
    if (!vivo || prazoAgendado !== prazo) return;   // outro cliente já fez a mesa andar
    ultimoAviso = Date.now();
    prazoAgendado = null;       // se o servidor ainda não andou, a resposta reagenda
    try {
      const { visao } = await chamar('tique', { codigo });
      if (visao) entregar(visao, 'prazo');
    } catch { /* a sonda de segurança cobre */ }
  }

  // ------------------------------------------------------ tempo real (1)
  const conectar = () => {
    if (!vivo) return;
    try {
      socket = new WebSocket(`${URL_REALTIME}?apikey=${CHAVE_PUBLICA}&vsn=1.0.0`);
    } catch {
      return agendarReconexao();
    }

    socket.onopen = () => {
      tentativas = 0;
      enviar({
        topic: topico,
        event: 'phx_join',
        payload: { config: { broadcast: { self: true }, presence: { key: '' } } },
        ref: '1',
      });
      batida = setInterval(() => {
        enviar({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(Date.now()) });
      }, 25000);
    };

    socket.onmessage = (evento) => {
      let msg;
      try { msg = JSON.parse(evento.data); } catch { return; }
      if (msg.event === 'phx_reply' && msg.topic === topico && msg.ref === '1') {
        canalConfirmado = msg.payload?.status === 'ok';
      }
      if (msg.event === 'broadcast' && msg.payload?.payload?.visao) {
        entregar(msg.payload.payload.visao, 'realtime');
      }
    };

    socket.onclose = () => {
      canalConfirmado = false;
      clearInterval(batida);
      agendarReconexao();
    };
    socket.onerror = () => { try { socket.close(); } catch { /* já foi */ } };
  };

  const enviar = (msg) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  };

  const agendarReconexao = () => {
    if (!vivo) return;
    tentativas++;
    setTimeout(conectar, Math.min(10000, 500 * 2 ** tentativas));
  };

  conectar();

  // ------------------------------------------------ sonda de segurança (3)
  sonda = setInterval(async () => {
    if (!vivo) return;
    const intervalo = canalDePe() ? SONDA_COM_CANAL : SONDA_SEM_CANAL;
    if (Date.now() - ultimaSonda < intervalo) return;
    ultimaSonda = Date.now();
    try {
      const { visao } = await chamar('tique', { codigo });
      if (visao) entregar(visao, 'sonda');
    } catch { /* tenta de novo no próximo intervalo */ }
  }, SONDA_SEM_CANAL);

  return () => {
    vivo = false;
    clearTimeout(alarmeDoPrazo);
    clearInterval(batida);
    clearInterval(sonda);
    try { socket?.close(); } catch { /* já foi */ }
  };
}
