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
| 18/09 | `0f5e572` | Número grande no lobby e no feltro sai abreviado ("10 bi") |
| 18/09 | `b00e2ea` | **Sair da sala sai de verdade**: atualizar a página depois não volta mais para a sala |
| 18/09 | `74c0198` | **Visual novo**: fontes Cinzel e Manrope, ícones desenhados no menu, bônus em faixa |
| 18/09 | `21fe03a` | **Menu refeito como mesa**: feltro com as duas ações, o resto vira linha de texto |
| 18/09 | `6cd5e1d` | **Mesa da carreira como mesa de verdade**: trilho, base curva, letreiro em arco, círculo de aposta; lateral vira placa |
| 18/09 | `a022dba` | **Menu em fichas de cassino**: a linha de texto embaixo da mesa vira uma fileira de fichas |
| 18/09 | `f592ae0` | Fichas do menu com o desenho da função no miolo, no lugar do naipe |
| 18/09 | `9aa2097` | **Missões**: bônus em pilhas de fichas, missões com anel de progresso, conquistas em vitrine de medalhas |
| 18/09 | `2df5fe5` | **Criar sala** como "montar a mesa": prévia ao vivo, cadeiras, rodadas em botões, tempos com − e + |
| 18/09 | `df3c5a0` | Mesa da carreira com bandeja, sapato e descarte; fichas de aposta com insertos; histórico com ficha de resultado |

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
- **Aposta de 10.000.000.000 vazava do ladrilho** do lobby. Números de um milhão para cima
  saem abreviados (`curto` em `salas.js`), com espaço inquebrável entre "10" e "bi".
- **Sair pelo Menu não saía da sala.** `ligarSala` chamava `desligarSala`, que zera o código
  da sala, logo depois de `abrirSala` gravá-lo. Com isso `naSala()` dizia "fora", o Menu não
  perguntava nada, não avisava o servidor e deixava `?sala=` no endereço: atualizar a página
  levava de volta à mesa. Hoje `ligarSala` grava o código depois de desligar.
- **Nome de classe repetido quebra desenho novo.** `.entrada` (campo de texto), `.pilha`
  (fichas da aposta) e `.lugar` (lugar da mesa online) já existiam e desmontaram o menu, o
  bônus e a prévia da sala. Antes de criar classe nova, procurar o nome no `estilo.css`.
- **Scripts de teste quebravam ao imprimir ♣** no console cp1252 do Windows. Agora forçam
  UTF-8 na saída.

## Como as medições foram feitas

- **Chamadas ao servidor:** um contador no `fetch` da página, um minuto parado numa sala.
- **Dois jogadores:** uma aba no `localhost` e outra no site da Vercel (identidades
  diferentes), a mesma sala, contando os avisos de prazo de cada uma.
- **Mesa cheia:** sala com 9 jogadores de mentira criada por script, medindo a caixa de cada
  lugar para achar sobreposição.
