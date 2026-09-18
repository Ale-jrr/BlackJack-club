# Modo online

Como as salas de "jogar com amigos" funcionam por dentro. Índice em [[BlackJack Club]];
arquivos no [[Mapa do código]].

---

## O desenho

```
navegador ──POST──▶ Edge Function `sala` ──SQL──▶ tabela sala (RLS ligado, sem policy)
    ▲                        │
    └──── tempo real ◀───────┘   o servidor avisa a mesa toda a cada mudança
```

- O **site** é estático, na Vercel.
- O **servidor** é a Edge Function `sala`, no Supabase. Ela lê a sala, roda o motor, grava e
  avisa todo mundo.
- O **banco** tem duas tabelas: `sala` (o estado inteiro de cada sala, em JSON) e
  `sala_jogador` (o segredo de cada jogador em cada sala).

## O navegador nunca decide nada (§74)

O navegador manda a intenção — `apostar`, `agir`, `iniciar` — e recebe de volta só o que pode
ver. `visaoPara()` corta o baralho e a carta escondida do dealer antes de responder.

As duas tabelas estão com **RLS ligado e sem nenhuma policy**. A chave pública, que fica no
código do site, não lê nem escreve nada nelas; só a função, com a chave de serviço, toca no
banco. O linter do Supabase avisa `rls_enabled_no_policy`: **é de propósito, não corrigir.**
`testes/servidor.py` prova o bloqueio.

## Identidade e senha

- **Cada jogador guarda um segredo** no próprio navegador (`blackjack-club:identidade:v1`).
  Toda ação vai com ele; sem isso bastaria saber o id de alguém para jogar no lugar dele.
- A identidade é **por endereço**: `localhost` e o site da Vercel são dois jogadores
  diferentes. Útil para testar com duas abas; confuso se não esperar.
- **Senha da sala** nunca é guardada como foi digitada: vira um hash SHA-256 misturado com o
  código da sala. O motor só compara um hash com outro. A lista de salas mostra só o sim/não
  (coluna `tem_senha`). Quem já entrou volta sem digitar de novo.

## Estados da sala (§73)

```
LOBBY → APOSTAS → TURNO_JOGADORES → TURNO_DEALER → RESULTADO → APOSTAS …
                                                               └─▶ PARTIDA_FINALIZADA
```

- **APOSTAS** — todo mundo aposta ao mesmo tempo, com prazo. Quando o último aposta, distribui
  na hora. Quem não apostou até o prazo fica fora daquela rodada.
- **TURNO_JOGADORES** — **um por vez**, na ordem em que sentaram (decisão do Mayk, contra a
  §55 do documento original). Cada jogada renova o prazo. Tempo esgotado é sempre PARAR, nunca
  PEDIR (§56).
- **TURNO_DEALER** — automático (compra até 16 e, de 17 para cima, só se a conta da mesa mostrar
  vantagem para a casa — `dealerDevePedir`) ou nas mãos do
  crupiê, se houver.
- **RESULTADO** — pausa de 6 segundos e abre a próxima rodada, ou encerra no limite.

## Crupiê de verdade

Opção ao criar a sala (`crupieHumano`). No lobby, qualquer jogador assume o lugar
("QUERO SER O CRUPIÊ") e pode largar. Só um por vez, e só troca entre partidas.

- O crupiê **não aposta, não ganha nem perde** (banca da casa) e **fica fora do ranking**.
- Na vez do dealer a carta escondida vira e ele **decide livremente** pedir ou parar, sem a
  regra dos 17. Estourou ou fez 21, a rodada fecha sozinha.
- Tempo dele acabou, ou ele saiu no meio da vez: o dealer termina **pela regra da casa**.
- Ninguém assumiu: joga o dealer automático.
- Todos os jogadores estouraram: o crupiê nem chega a jogar.
- O crupiê ocupa um dos lugares da sala.

## Tempo real e a cota do servidor

O plano grátis dá **500 mil chamadas à função por mês** e **200 conexões simultâneas** de tempo
real. A cota mensal é o limite que aperta. Por isso a sala se mantém em dia pelo caminho mais
barato:

1. **Tempo real** — o servidor avisa a cada mudança, em ~0,2 s. Não gasta chamada.
2. **Aviso do prazo** — quando uma aposta, uma vez ou a pausa do resultado vencem, alguém
   precisa pedir ao servidor para andar (ele não tem relógio próprio). Os jogadores conectados
   formam uma **fila**: o primeiro avisa 0,25 s depois do prazo; o segundo só avisa 2 s depois,
   se a mesa não andou; e assim por diante.
3. **Sonda de segurança** — de 20 em 20 s com o tempo real de pé; de 4 em 4 s se ele caiu.

A lista de salas abertas atualiza de 12 em 12 s e **para com a aba em segundo plano**.

| medido | antes | agora |
| --- | --- | --- |
| jogador parado na sala, chamadas por minuto | 15,5 | 2,6 |
| horas de jogo por mês, somando todos | ~440 | ~1.250 |

O que mais gasta hoje são as próprias jogadas, e essas não dá para cortar.

## Duas pessoas agindo ao mesmo tempo

A gravação só vale se a versão da sala ainda for a que foi lida (coluna `versao`). Quem perde
a corrida relê e refaz, até 4 vezes. Quando nada muda (a sonda chegando), a função não grava
nem avisa ninguém.

## Faxina e pausa

- Uma tarefa agendada (`pg_cron`, toda hora aos 17 minutos) apaga salas paradas há mais de
  **12 horas**. A função de faxina está trancada para a chave pública.
- **Projeto grátis parado 7 dias é pausado pelo Supabase.** Se o online "parar do nada", ver
  primeiro se o projeto foi pausado — volta com "Resume project" no painel. Vem um e-mail uma
  semana antes.

## Republicar o servidor

O motor vai junto com a função, na pasta `motor/` dela. Depois de mexer em `src/motor/`, a
função precisa ser publicada de novo **com os seis arquivos**: `index.ts` e
`motor/{regras,baralho,mao,assento,sala}.js`. O deploy é pelo MCP do Supabase
(`deploy_edge_function`, projeto `zwltwqvddvacbgpswsac`, função `sala`, `verify_jwt` ligado),
sem precisar da CLI. Conferir os arquivos iguais aos do disco antes de publicar, e rodar
`py testes/servidor.py` depois.

## Mudanças no banco

Feitas por migração (`apply_migration`), nesta ordem: `salas_do_blackjack`,
`faxina_das_salas`, `trancar_faxina`, `sala_com_senha`. Depois de mexer em tabela ou função,
rodar o linter de segurança (`get_advisors`).
