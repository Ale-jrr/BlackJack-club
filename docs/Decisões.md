# Decisões

O que o Mayk decidiu, o que eu decidi quando ele não disse, e por quê. Índice em
[[BlackJack Club]].

Quando uma decisão aqui contradiz o documento original de 91 seções, **vale a daqui**.

---

## Decididas pelo Mayk

| quando | pergunta | resposta | onde vive |
| --- | --- | --- | --- |
| 16/09 | Onde hospedar o site? | Vercel, pelo GitHub | repositório `Ale-jrr/BlackJack-club` |
| 16/09 | Onde fica o servidor das salas? | **Supabase**, projeto novo grátis | [[Modo online]] |
| 16/09 | Jogadas simultâneas (§55)? | **Não. Um jogador por vez**, na ordem dos assentos | `sala.js` → `passarAVez` |
| 16/09 | Como deve ser a mesa online? | **Como mesa de verdade**, todos os jogadores à vista (mandou foto de referência) | `salas.js` → `pintarLugares` |
| 16/09 | Nome na sala | Cada um **edita o próprio nome** no lobby, antes do pronto | `salas.js` → `trocarNome` |
| 16/09 | Regra do dealer no feltro | **Não pode** ("não pode dizer as coisas do dealer pros players") | o feltro mostra os limites de aposta |
| 16/09 | Tutorial | "Deixe ele bom", com o post do crupiê de roleta como referência | `tutorial.js` |
| 18/09 | Salas abertas | **Na tela inicial**, com indicação de senha | `salas.js` → `pintarListaDeSalas` |
| 18/09 | Otimizar chamadas ao servidor | Sim | `servidor.js` → `assinar` |
| 18/09 | Crupiê: decide ou segue regra? | **Joga livre** | `sala.js` → `agirComoCrupie` |
| 18/09 | Banca do crupiê | **Da casa** (ele não ganha nem perde) | `sala.js` → `apostador` |
| 18/09 | Menu em grade de cartões com ícone | **"Muita cara de IA."** Virou uma mesa de feltro com JOGAR e MESA COM AMIGOS. O resto virou linha de texto, que ele também não gostou; escolheu **fichas de cassino** (uma cor por item, nome embaixo) e pediu **o desenho da função no miolo** em vez do naipe ("é melhor") | `index.html` → `.mesa-entrada`; `app.js` → `pintarMenu` |
| 18/09 | Cartas dos outros no celular | **Têm que aparecer** ("o mobile não consegue ver as cartas"). Antes ficavam escondidas pela §87 | `estilo.css`, bloco `max-width: 760px` |
| 18/09 | Regra do dealer | **Joga para ganhar, fazendo a conta**: pede com 16 ou menos; com 17 ou mais compara quanto a casa leva parando com o que espera levar pedindo (total e aposta de cada mão parada, chances de baralho comum, sem espiar o shoe) e só pede se for vantagem. A primeira versão ("pede se um só estiver na frente") o Mayk recusou: "tem que analisar a mesa". Vale para a carreira e para a sala | `assento.js` → `dealerDevePedir` |
| 18/09 | Valor da aposta na sala | **O jogador escolhe qualquer valor**, não só os fixos | `salas.js` → `montarPainelDeAposta` |

---

## Decididas por mim — abertas a correção

| decisão | por quê |
| --- | --- |
| Tempo do crupiê acabou → dealer termina **pela regra da casa** | parar na hora daria a rodada de presente a quem tem 12 contra um crupiê ausente |
| Ninguém assumiu o crupiê → **dealer automático** | a partida não pode travar esperando voluntário |
| O crupiê ocupa um lugar da sala | ele está na sala; numa de 6, apostam 5 |
| Crupiê só troca **entre partidas** | trocar no meio mudaria o dono das decisões com a rodada rolando |
| Seguro **não existe na sala online** | exigiria uma fase a mais antes da espiada do dealer; na carreira existe |
| Aposta ímpar no Blackjack **arredonda** (25 → 38) | 3 para 2 não fecha redondo; mesa de verdade prefere aposta par |
| Quem entra com a partida rolando **assiste** (§64), salvo se o ADM liberar | mantém a partida justa |
| A aposta de cada rodada começa **na anterior**, se couber; senão, na mínima | quem aposta sempre o mesmo não precisa redigitar |
| Salas em partida **também aparecem** na lista, como "entra para assistir" | lista só de salas esperando fica vazia quase sempre |
| Fontes: **Cinzel** no logo, títulos, feltro e cantos das cartas; **Manrope** no resto | Cinzel é maiúscula romana de letreiro de cassino; Manrope é legível pequena e tem números retos. Mayk pediu "mais bonito, as fontes e etc" |
| A senha da sala é guardada **em hash** | ninguém, nem com acesso ao banco, lê a senha |
| Sala parada **12 horas** é apagada | sala de teste e de sábado à noite não ficam para sempre |

---

## Onde eu errei e corrigi

- **Aviso de prazo por sorteio.** Sorteei quem avisaria o servidor quando o tempo vence; com
  dois jogadores, os dois avisavam em quase todo prazo. Troquei por fila. Ver [[Histórico]].
- **Capacidade do servidor.** A primeira conta ("550 horas de jogo por mês") esqueceu as
  jogadas dos próprios jogadores. A certa era ~440 antes da otimização e ~1.250 depois.
- **Regra do dealer no feltro.** Coloquei porque mesa de cassino tem; o Mayk não quis. A regra
  foi para o tutorial.
