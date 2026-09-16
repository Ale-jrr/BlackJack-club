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

// Assina a sala no Realtime (protocolo do Phoenix, sem biblioteca) e, por
// garantia, também pergunta o estado de tempos em tempos: se o socket cair no
// meio de uma rodada, a mesa continua andando.
export function assinar(codigo, aoReceber, { intervaloDeSeguranca = 4000 } = {}) {
  let socket = null;
  let batida = null;
  let sonda = null;
  let vivo = true;
  let tentativas = 0;

  const topico = `realtime:sala-${codigo}`;

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
      if (msg.event === 'broadcast' && msg.payload?.payload?.visao) {
        aoReceber(msg.payload.payload.visao, 'realtime');
      }
    };

    socket.onclose = () => {
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

  // Rede de segurança: pergunta o estado mesmo se o socket estiver mudo.
  sonda = setInterval(async () => {
    if (!vivo) return;
    try {
      const { visao } = await chamar('tique', { codigo });
      if (visao) aoReceber(visao, 'sonda');
    } catch { /* tenta de novo no próximo intervalo */ }
  }, intervaloDeSeguranca);

  return () => {
    vivo = false;
    clearInterval(batida);
    clearInterval(sonda);
    try { socket?.close(); } catch { /* já foi */ }
  };
}
