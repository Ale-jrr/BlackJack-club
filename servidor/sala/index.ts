// Servidor das salas. Roda como Edge Function no Supabase.
//
// É ele quem decide TUDO: carta, ficha, vez e tempo (§74). O navegador só
// manda "quero pedir carta" e recebe de volta o estado que pode ver. O motor
// importado aqui é o mesmo `src/motor` que roda na carreira — as regras de mão
// não existem em duas versões.
//
// O que nunca sai daqui: o shoe e a carta escondida do dealer. `visaoPara`
// monta a versão pública, e é só ela que vai para o navegador e para o
// Realtime.

import {
  STATUS_SALA, agir, ajustarConfig, apostar, assumirCrupie, criarSala, definirConexao,
  definirPronto, entrar, gerarCodigo, iniciar, recomprar, sair,
  tique, visaoPara,
} from './motor/sala.js';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!;
const CHAVE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CABECALHOS_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS_CORS, 'Content-Type': 'application/json' },
  });
}

function recusar(motivo: string, mensagem: string, status = 400) {
  return responder({ erro: { motivo, mensagem } }, status);
}

// ------------------------------------------------------------------ senha

// A senha da sala nunca é guardada como foi digitada: vira um hash misturado com
// o código da sala. O motor só compara um hash com outro.
async function hashDaSenha(codigo: string, senha: unknown) {
  const limpa = String(senha ?? '').trim().slice(0, 20);
  if (!limpa) return null;
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${codigo}:${limpa}`)),
  );
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------------ banco

async function rest(caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_SUPABASE}/rest/v1/${caminho}`, {
    ...init,
    headers: {
      apikey: CHAVE_SERVICO,
      Authorization: `Bearer ${CHAVE_SERVICO}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`banco ${r.status}: ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

async function lerSala(codigo: string) {
  const linhas = await rest(`sala?codigo=eq.${encodeURIComponent(codigo)}&select=*`);
  return linhas?.[0] ?? null;
}

function resumoDaLinha(sala: any) {
  return {
    codigo: sala.codigo,
    nome: sala.nome,
    status: sala.status,
    publica: sala.config.publica,
    host_id: sala.hostId,
    jogadores: sala.jogadores.filter((j: any) => !j.espectador).length,
    max_jogadores: sala.config.maxJogadores,
    rodada: sala.rodada,
    tem_senha: Boolean(sala.senha),
    estado: sala,
    atualizada_em: new Date().toISOString(),
  };
}

async function inserirSala(sala: any) {
  await rest('sala', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...resumoDaLinha(sala), versao: 1 }),
  });
}

// Trava otimista: só grava se a versão ainda for a que foi lida. Dois jogadores
// agindo no mesmo instante não se sobrescrevem — o segundo relê e refaz.
async function gravarSala(sala: any, versaoLida: number) {
  const linhas = await rest(
    `sala?codigo=eq.${encodeURIComponent(sala.codigo)}&versao=eq.${versaoLida}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...resumoDaLinha(sala), versao: versaoLida + 1 }),
    },
  );
  return Array.isArray(linhas) && linhas.length > 0;
}

async function registrarJogador(codigo: string, jogadorId: string, segredo: string) {
  await rest('sala_jogador', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ codigo, jogador_id: jogadorId, segredo }),
  });
}

async function segredoDe(codigo: string, jogadorId: string) {
  const linhas = await rest(
    `sala_jogador?codigo=eq.${encodeURIComponent(codigo)}&jogador_id=eq.${encodeURIComponent(jogadorId)}&select=segredo`,
  );
  return linhas?.[0]?.segredo ?? null;
}

// --------------------------------------------------------------- realtime

// Manda o estado novo para todo mundo que está na sala. Se falhar, ninguém
// trava: o cliente também pergunta o estado de tempos em tempos.
async function avisarTodos(sala: any) {
  try {
    await fetch(`${URL_SUPABASE}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: CHAVE_SERVICO,
        Authorization: `Bearer ${CHAVE_SERVICO}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{
          topic: `sala-${sala.codigo}`,
          event: 'estado',
          payload: { visao: visaoPara(sala, null) },
          private: false,
        }],
      }),
    });
  } catch (erro) {
    console.error('broadcast falhou', erro);
  }
}

// ------------------------------------------------------------------ rotas

const SEM_SALA = new Set(['criar', 'publicas']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CABECALHOS_CORS });
  if (req.method !== 'POST') return recusar('metodo', 'Use POST.', 405);

  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return recusar('corpo', 'Corpo inválido.');
  }

  const { acao, codigo, segredo } = corpo ?? {};
  const jogador = corpo?.jogador ?? {};
  const agora = Date.now();

  try {
    if (acao === 'publicas') {
      // Salas esperando gente e salas em partida (dá para assistir, ou entrar se
      // o ADM liberou). Partida encerrada não aparece.
      const linhas = await rest(
        `sala?publica=eq.true&status=neq.${STATUS_SALA.PARTIDA_FINALIZADA}`
        + '&select=codigo,nome,status,jogadores,max_jogadores,tem_senha,rodada,atualizada_em'
        + '&order=atualizada_em.desc&limit=30',
      );
      const salas = (linhas ?? []).sort((a: any, b: any) =>
        Number(b.status === STATUS_SALA.LOBBY) - Number(a.status === STATUS_SALA.LOBBY));
      return responder({ salas });
    }

    if (!acao) return recusar('acao', 'Sem ação.');
    if (!jogador.id || !segredo) return recusar('identidade', 'Jogador sem identificação.');

    // ----------------------------------------------------------- criar
    if (acao === 'criar') {
      let sala = null;
      for (let tentativa = 0; tentativa < 5 && !sala; tentativa++) {
        const codigoNovo = gerarCodigo();
        const novo = criarSala({
          codigo: codigoNovo,
          senha: await hashDaSenha(codigoNovo, corpo.senha),
          nome: corpo.nome,
          host: { id: jogador.id, nome: jogador.nome, avatar: jogador.avatar },
          config: corpo.config,
          agora,
        });
        if (await lerSala(novo.codigo)) continue;    // código repetido, sorteia outro
        await inserirSala(novo);
        sala = novo;
      }
      if (!sala) return recusar('codigo', 'Não consegui criar um código livre. Tente de novo.');
      await registrarJogador(sala.codigo, jogador.id, segredo);
      await avisarTodos(sala);
      return responder({ visao: visaoPara(sala, jogador.id) });
    }

    if (SEM_SALA.has(acao)) return recusar('acao', `Ação desconhecida: ${acao}`);
    if (!codigo) return recusar('codigo', 'Sem código de sala.');

    // Lê, aplica, grava. Se alguém gravou no meio, relê e refaz (até 4 vezes).
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const linha = await lerSala(codigo);
      if (!linha) return recusar('sem-sala', 'Sala não encontrada.', 404);

      const sala = linha.estado;
      const versaoLida = Number(linha.versao);

      // Quem já tem assento precisa provar que é ele mesmo (§80).
      const guardado = await segredoDe(codigo, jogador.id);
      if (guardado && guardado !== segredo) {
        return recusar('identidade', 'Esse jogador já está nesta sala em outro aparelho.', 403);
      }
      if (!guardado && acao !== 'entrar') {
        return recusar('sem-assento', 'Entre na sala antes.', 403);
      }

      // Antes de qualquer ação, o relógio do servidor cobra os prazos vencidos.
      const antes = JSON.stringify(sala);
      tique(sala, agora);

      switch (acao) {
        case 'entrar':
          entrar(sala, {
            id: jogador.id, nome: jogador.nome, avatar: jogador.avatar,
            senha: await hashDaSenha(codigo, corpo.senha),
          }, agora);
          break;
        case 'estado':
          definirConexao(sala, jogador.id, true);
          break;
        case 'pronto':
          definirPronto(sala, jogador.id, corpo.valor !== false);
          break;
        case 'config':
          ajustarConfig(sala, jogador.id, corpo.config);
          break;
        case 'iniciar':
          iniciar(sala, jogador.id, agora);
          break;
        case 'apostar':
          apostar(sala, jogador.id, corpo.valor, agora);
          break;
        case 'agir':
          agir(sala, jogador.id, corpo.jogada, agora);
          break;
        case 'recomprar':
          recomprar(sala, jogador.id);
          break;
        case 'crupie':
          assumirCrupie(sala, jogador.id, corpo.valor !== false);
          break;
        case 'sair':
          sair(sala, jogador.id, agora);
          break;
        case 'tique':
          break;                       // o tique já rodou acima
        default:
          return recusar('acao', `Ação desconhecida: ${acao}`);
      }

      // A sonda de segurança dos clientes chega de 4 em 4 segundos. Quando ela
      // não muda nada, não faz sentido gravar no banco nem acordar a mesa toda.
      if (JSON.stringify(sala) === antes) {
        return responder({ visao: visaoPara(sala, jogador.id) });
      }

      if (await gravarSala(sala, versaoLida)) {
        if (acao === 'entrar') await registrarJogador(codigo, jogador.id, segredo);
        await avisarTodos(sala);
        return responder({ visao: visaoPara(sala, jogador.id) });
      }
      // Perdeu a corrida: alguém gravou primeiro. Relê e tenta de novo.
    }

    return recusar('ocupado', 'A mesa está movimentada demais. Tente de novo.', 409);
  } catch (erro: any) {
    if (erro?.motivo) return recusar(erro.motivo, erro.message);
    console.error(erro);
    return recusar('servidor', 'Deu problema no servidor da sala.', 500);
  }
});
