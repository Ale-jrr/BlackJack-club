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

**As cartas não olham o jogador.** O embaralhamento não sabe saldo, nível nem sequência. Existe
teste garantindo que duas partidas com a mesma semente dão as mesmas cartas com saldos diferentes.

**Teste novo para regra nova.** `testes/testes.js` cobre Ás, Blackjack, pagamentos, dealer no
soft 17, split, split de Áses, double, surrender, seguro e o fechamento do saldo em cem rodadas.

## O que está pronto

Fases 1 a 4 do projeto, mais as mesas por nível da Fase 5:

- Motor completo: 6 baralhos, hit, stand, double, split até 4 mãos, split de Áses, surrender,
  seguro 2:1, dealer parando no 17 inclusive macio, espiada quando a carta aberta é Ás ou 10.
- Saldo virtual, aposta com fichas, repetir e dobrar aposta, bônus de recuperação.
- XP, 100 níveis, missões diárias e semanais, conquistas, bônus diário de 7 dias.
- Estatísticas, histórico das rodadas, perfil com nome e avatar, tutorial, som.
- Seis mesas desbloqueando por nível.
- Interface de cassino que funciona no toque; no celular o miolo da mesa vira painel de números.

## O que falta

- **Modo online** (Fases 6 a 8): salas, código de convite, até 10 jogadores, chat, reações.
  Precisa de servidor com WebSocket — o navegador não pode decidir resultado. O motor de rodada
  já está pronto para rodar do lado do servidor.
- **Ranking entre jogadores**: depende do mesmo servidor. A tela de perfil já mostra os números
  que vão para ele.
- **Loja de cosméticos** e **conta com login**.

## Fichas

As fichas são virtuais e não têm valor fora do jogo. Não existe depósito, saque ou conversão.
O perfil vive no `localStorage` do navegador, uma chave só: `blackjack-club:perfil:v1`.
