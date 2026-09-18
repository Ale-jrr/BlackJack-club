# Mapa do código

Onde cada coisa mora. Índice em [[BlackJack Club]]; como a sala online funciona por dentro
está em [[Modo online]].

São ~6.700 linhas, sem build e sem dependência externa: HTML, CSS e módulos ES servidos
direto. O servidor é uma Edge Function em TypeScript no Supabase.

---

## A regra que organiza tudo

```
src/motor/  →  as regras do jogo. Não toca em DOM, timer, rede nem armazenamento.
src/dados/  →  o que é salvo no navegador e a conversa com o servidor.
src/ui/     →  telas, desenho da mesa, animação, som.
servidor/   →  a função do Supabase. Roda o MESMO src/motor, copiado junto.
```

`src/motor/` é puro de propósito: o mesmo código decide a carreira no navegador e a sala
online no servidor. **Regra de mão existe em um lugar só** (`assento.js`); se aparecer uma
segunda cópia, os dois modos vão divergir em silêncio.

---

## `src/motor/` — as regras

| arquivo | o que faz |
| --- | --- |
| **`regras.js`** | **todo número de regra**: 6 baralhos, corte em 75%, 3 para 2, seguro 2 para 1, mesas da carreira, fichas rápidas, nomes dos estados e das ações |
| `baralho.js` | cartas, shoe, embaralhamento com `crypto`, shoe fixo para teste |
| `mao.js` | valor da mão com o Ás valendo 11 ou 1, Blackjack, mão macia |
| **`assento.js`** | **as regras de mão dos dois modos**: pedir, parar, dobrar, dividir, desistir, pagar cada mão contra o dealer |
| `rodada.js` | uma rodada da carreira: aposta, distribuição, seguro, espiada do dealer, dealer automático, resultado |
| **`sala.js`** | a sala online: criar, entrar, senha, pronto, crupiê, apostas, **um por vez**, prazo, dealer (automático ou crupiê), ranking, `visaoPara` (o que cada um pode ver) |

## `src/dados/` — o que fica salvo e a rede

| arquivo | o que faz |
| --- | --- |
| `progressao.js` | números de progressão: XP por jogada, custo de cada nível, missões, conquistas, bônus diário |
| `perfil.js` | o perfil da carreira no `localStorage` (`blackjack-club:perfil:v1`): saldo, XP, estatísticas, histórico, missões |
| **`servidor.js`** | a conversa com a função: identidade do jogador, chamadas, relógio do servidor, **tempo real, aviso de prazo por fila e sonda de segurança** |

## `src/ui/` — telas

| arquivo | o que faz |
| --- | --- |
| `app.js` | a casca: topo, menu, navegação, missões, estatísticas, perfil, configurações |
| `mesa.js` | a mesa da carreira: fichas, cartas, botões, animação da rodada |
| **`salas.js`** | tudo do modo online: salas abertas ao vivo, criar sala, senha, lobby, crupiê, **mesa em arco**, aposta livre, ranking da sala |
| `tutorial.js` | os oito capítulos do tutorial, a mão viva, a calculadora, o treino e o teste |
| `cartas.js` | desenha uma carta (HTML e CSS, sem imagem) |
| `som.js` | sons sintetizados na hora com WebAudio |
| `estilo.css` | todo o visual; `[hidden]` tem `!important` de propósito (ver [[Histórico]]) |

## `servidor/` e `testes/`

| arquivo | o que faz |
| --- | --- |
| `servidor/sala/index.ts` | a Edge Function: lê a sala do banco, confere identidade, roda o motor, grava com trava de versão e avisa a mesa pelo tempo real |
| `testes/testes.js` | testes do motor da carreira |
| `testes/testes-sala.js` | testes da sala online, incluindo senha e crupiê |
| `testes/index.html` | a página que roda os dois no navegador |
| `testes/servidor.py` | teste de ponta a ponta contra a função publicada |
| `testes/parceiro.py` | um jogador de mentira para encher a sala |
| `servidor.py` | servidor local sem cache |

---

## Onde mexer para…

| quero mudar | arquivo |
| --- | --- |
| pagamento, número de baralhos, limites das mesas | `src/motor/regras.js` |
| o que uma jogada faz (dobrar, dividir…) | `src/motor/assento.js` — vale para os dois modos |
| fluxo da sala, turno, prazo, crupiê | `src/motor/sala.js` — **e republicar a função** |
| o que o servidor aceita, o banco, a senha | `servidor/sala/index.ts` |
| quantas vezes o cliente chama o servidor | `src/dados/servidor.js` |
| telas do modo online | `src/ui/salas.js` e `index.html` |
| XP, missões, conquistas | `src/dados/progressao.js` |
| cores, tamanhos, layout de celular | `src/ui/estilo.css` |

---

## Visual

- **Fontes** carregam do Google Fonts no `index.html`. No CSS: `--fonte` (Manrope) e
  `--fonte-titulo` (Cinzel). Sem internet, caem nas fontes do sistema.
- **Números** usam `tabular-nums` no `body`: saldo e cronômetro não tremem.
- **Menu**: `.mesa-entrada` (feltro com trilho e curva, em `estilo.css`) recebe as duas
  ações de `ACOES_ENTRADA`; `.cardapio` recebe `ITENS_MENU` como texto. Evitar voltar à
  grade de cartões com ícone: o Mayk achou com "muita cara de IA".
- **Cuidado com nome de classe**: `.entrada` já é o campo de texto. Por isso a mesa do
  menu se chama `.mesa-entrada`.
