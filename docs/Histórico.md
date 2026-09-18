# Histórico

O que foi feito, em ordem. Índice em [[BlackJack Club]]. Cada linha é um commit em `main`.

| data | commit | entrega |
| --- | --- | --- |
| 16/09 | `8e21963` | **Carreira**: motor, saldo, XP, missões, conquistas, estatísticas, mesas, tutorial simples, som |
| 16/09 | `5a04902` | **Jogar com amigos**: servidor no Supabase, sala um por vez, tempo real, lobby, ranking |
| 16/09 | `62f0c99` | Faixa dos outros jogadores com altura garantida; ranking no celular |
| 16/09 | `c8e99de` | **Mesa em arco** como mesa de verdade; nome editável no lobby |
| 16/09 | `f780b7c` | **Tutorial de verdade**; feltro sem a regra do dealer |
| 18/09 | `d672645` | **Salas abertas na tela inicial**; senha opcional |
| 18/09 | `347f17f` | Sala gasta 6x menos chamadas parada |
| 18/09 | `e3712a8` | Aviso de prazo por fila, não por sorteio |
| 18/09 | `52fea2b` | LEIA-ME explica a economia de chamadas |
| 18/09 | `97a1e0b` | **Crupiê de verdade** |
| 18/09 | `5dbb01b` | **Aposta livre** na sala; scripts de teste imprimem naipe no Windows |

---

## Defeitos que apareceram e o que ensinaram

Cada um destes só apareceu olhando a tela ou medindo — os testes do motor passavam.

- **O lobby ficava por cima da mesa.** `display: grid` no CSS vencia o atributo `hidden`.
  Hoje `[hidden] { display: none !important; }` fica no topo do `estilo.css`.
- **A faixa dos outros jogadores era espremida a 14px** numa tela baixa. Ganhou altura mínima
  e a mesa passou a rolar em vez de cortar.
- **Lugares se encavalando com 9 jogadores.** Espaçar o arco por ângulo igual aperta as
  pontas. Hoje o espaçamento é por distância horizontal igual.
- **Letreiro do feltro cortado ou por cima das cartas.** O SVG usa `slice`; no celular o
  letreiro sai de cena.
- **Mesa sumia ao entrar numa sala.** A assinatura do tempo real era ligada depois de receber
  a mesa e a apagava. Hoje `abrirSala` liga antes e desenha depois.
- **Ficha 🪙 virava quadrado no Windows 10.** Trocada por ficha desenhada em CSS (`.moeda`).
- **Aviso de prazo duplicado** com sorteio de atraso — ver [[Decisões]].
- **Scripts de teste quebravam ao imprimir ♣** no console cp1252 do Windows. Agora forçam
  UTF-8 na saída.

## Como as medições foram feitas

- **Chamadas ao servidor:** um contador no `fetch` da página, um minuto parado numa sala.
- **Dois jogadores:** uma aba no `localhost` e outra no site da Vercel (identidades
  diferentes), a mesma sala, contando os avisos de prazo de cada uma.
- **Mesa cheia:** sala com 9 jogadores de mentira criada por script, medindo a caixa de cada
  lugar para achar sobreposição.
