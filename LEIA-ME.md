# BlackJack Club

Blackjack de fichas virtuais, modo carreira. HTML + ES modules, sem build e sem Node.

## Como rodar

```bash
py C:/Users/Mayk/blackjack-club/servidor.py 5180 C:/Users/Mayk/blackjack-club
```

Depois abra `http://localhost:5180`. O servidor manda tudo com `no-store`, então o que roda
é sempre o que está no disco — abrir o `index.html` com duplo clique **não** funciona, porque
módulos ES precisam de `http://`.

Os testes ficam em `http://localhost:5180/testes/index.html`. Rodam no navegador porque esta
máquina não tem Node.

O servidor das salas tem teste próprio, que fala com a função publicada de verdade:

```bash
py testes/servidor.py
```

E `py testes/parceiro.py auto CODIGO 500` põe um segundo jogador de mentira na sua sala,
para testar sem precisar de outra pessoa.

## Onde mexer

| Quero mudar | Arquivo |
| --- | --- |
| pagamento, limites de mesa, número de baralhos, saldo inicial | `src/motor/regras.js` |
| como as cartas saem do shoe, embaralhamento | `src/motor/baralho.js` |
| conta do Ás, valor da mão, Blackjack | `src/motor/mao.js` |
| fluxo da rodada, ações válidas, dealer, pagamento | `src/motor/rodada.js` |
| XP, níveis, missões, conquistas, bônus diário | `src/dados/progressao.js` |
| saldo, estatísticas, histórico, o que é salvo | `src/dados/perfil.js` |
| mesa, cartas na tela, animação, botões | `src/ui/mesa.js` |
| menu e as outras telas | `src/ui/app.js` |
| tutorial: capítulos, treino e teste | `src/ui/tutorial.js` |
| regras da sala online, turno, ranking | `src/motor/sala.js` |
| telas de criar sala, lobby e mesa online | `src/ui/salas.js` |
| conversa com o servidor e tempo real | `src/dados/servidor.js` |
| o servidor em si | `servidor/sala/index.ts` |
| cores, tamanhos, layout | `src/ui/estilo.css` |
| sons | `src/ui/som.js` |

## Regras da casa

**O motor não conhece a tela.** `src/motor/` não importa nada de `src/ui/` e não toca em DOM,
timer nem armazenamento. A interface pergunta `acoesDisponiveis(jogo)` e manda `executar(jogo, acao)`;
quem decide carta, saldo e resultado é sempre o motor. Isso não é capricho: o modo online precisa
rodar esse mesmo motor no servidor, e qualquer regra que vazar para a tela vira brecha.

**Todo número de regra mora em `regras.js`.** Pagamento 3:2, seis baralhos, corte em 75%, limites
das mesas, saldo inicial. Espalhar número de balanço pelo código é o jeito mais rápido de o jogo
divergir de si mesmo.

**No feltro não vai regra do dealer.** A mesa mostra o que interessa a quem aposta: o
pagamento do Blackjack e os limites da sala. Como o dealer joga está no tutorial, onde a
pessoa vai procurar.

**As cartas não olham o jogador.** O embaralhamento não sabe saldo, nível nem sequência. Existe
teste garantindo que duas partidas com a mesma semente dão as mesmas cartas com saldos diferentes.

**Teste novo para regra nova.** `testes/testes.js` cobre Ás, Blackjack, pagamentos, dealer no
soft 17, split, split de Áses, double, surrender, seguro e o fechamento do saldo em cem rodadas.

## O modo online

O site continua estático na Vercel. O servidor das salas é uma Edge Function no Supabase,
e o banco guarda o estado de cada sala.

```
navegador  --POST-->  Edge Function `sala`  --SQL-->  tabela sala (RLS, sem policy)
    ^                        |
    +------ Realtime --------+   (o servidor avisa a mesa toda a cada mudança)
```

**O navegador nunca decide nada** (§74). Ele manda `apostar`, `agir`, `iniciar`, e recebe de
volta só o que pode ver: `visaoPara()` corta o shoe e a carta escondida do dealer antes de
responder. As tabelas estão com RLS ligado e **sem nenhuma policy**, então a chave pública do
site não lê nem escreve nada — quem toca no banco é a função, com a chave de serviço. Existe
teste provando isso em `testes/servidor.py`.

**Cada jogador guarda um segredo** no próprio navegador (`blackjack-club:identidade:v1`). Toda
ação vai com ele; sem isso bastaria saber o id de alguém para jogar no lugar da pessoa.

**O tempo é do servidor.** O cliente só desenha o cronômetro; quem decide que o prazo venceu é
a função, comparando com o relógio dela. Qualquer cliente pode mandar `tique`, e é isso que
impede uma sala de travar quando alguém some no meio da vez. Tempo esgotado é sempre PARAR,
nunca PEDIR (§56).

**Duas pessoas agindo no mesmo instante** não se atropelam: a gravação só vale se a versão da
sala ainda for a que foi lida, e quem perder a corrida relê e refaz.

### Republicar o servidor

O motor vai junto com a função, em `motor/`. Depois de mexer em `src/motor/`, a função precisa
ser publicada de novo com os arquivos atualizados — senão o servidor fica com a regra velha e o
jogo solo com a nova. O deploy é feito pelo MCP do Supabase (projeto `blackjack-club`,
função `sala`), sem precisar da CLI.

## O que está pronto

Fases 1 a 4 do projeto, mais as mesas por nível da Fase 5:

- Motor completo: 6 baralhos, hit, stand, double, split até 4 mãos, split de Áses, surrender,
  seguro 2:1, dealer parando no 17 inclusive macio, espiada quando a carta aberta é Ás ou 10.
- Saldo virtual, aposta com fichas, repetir e dobrar aposta, bônus de recuperação.
- XP, 100 níveis, missões diárias e semanais, conquistas, bônus diário de 7 dias.
- Estatísticas, histórico das rodadas, perfil com nome e avatar, som.
- **Tutorial em oito capítulos** com cartas de verdade, mão que muda de valor ao toque,
  calculadora de pagamento, os três jeitos de calcular o 3 para 2 que crupiê aprende, treino
  dessa conta e um teste de cinco perguntas no fim.
- Seis mesas desbloqueando por nível.
- **Modo jogar com amigos**: criar sala com as regras do ADM, código de convite e link,
  lobby com pronto e nome editável, até 10 jogadores, aposta com prazo, jogada **um por vez**
  com cronômetro, dealer compartilhado, ranking da sala, campeão, recompra, espectadores,
  reconexão.
- Mesa online desenhada como mesa de verdade: dealer no topo, lugares em arco com fichas e
  placa de cada jogador, e você sempre no meio. No celular o arranjo muda (§87): os outros
  viram fichas de uma linha e a sua mão fica grande embaixo; tocar em alguém abre as cartas
  dele.
- Interface de cassino que funciona no toque; no celular o miolo da mesa vira painel de números.

## O que falta

- **Chat e reações na sala** (Fase 8). A sala já tem o caminho pronto: seria mais um campo no
  estado e mais um tipo de ação.
- **Seguro na sala**. No modo online a rodada vai direto para a vez do primeiro jogador; o
  seguro existe só na carreira. Entrar com ele significa uma fase a mais antes da espiada.
- **Ranking entre jogadores** (o de dentro da sala já existe) e **conta com login**, para o
  perfil seguir a pessoa de um aparelho para outro.
- **Loja de cosméticos**.

## Fichas

As fichas são virtuais e não têm valor fora do jogo. Não existe depósito, saque ou conversão.
O perfil vive no `localStorage` do navegador, uma chave só: `blackjack-club:perfil:v1`.
