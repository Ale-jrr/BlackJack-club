# BlackJack Club

Blackjack de fichas virtuais, no navegador. Dois modos: a **carreira**, sozinho contra o
dealer, com XP, níveis e missões; e **jogar com amigos**, salas online de até 10 pessoas com
servidor próprio. Nenhuma ficha vale dinheiro: não existe depósito, saque nem conversão.

> **Onde isto vive.** O original destas notas fica em `blackjack-club/docs`, dentro do
> repositório, versionado junto com o código. O vault do Obsidian
> (`obsidian - blackjack club/BlackJack Club`) é um **espelho para leitura**, atualizado a
> pedido. Anotações suas podem ficar no vault à vontade: só estas seis notas são
> sobrescritas.

---

## Por onde começar

| nota | o que é |
| --- | --- |
| [[Mapa do código]] | onde cada coisa mora — a nota para quando você não lembra onde mexer |
| [[Modo online]] | como a sala funciona por dentro: servidor, segurança, tempo real, cota, crupiê |
| [[Decisões]] | o que o Mayk decidiu, o que eu decidi por ele, e o porquê |
| [[Histórico]] | o que foi feito, em ordem, com o commit de cada entrega |
| [[Pendências]] | o que falta, os limites conhecidos e os cuidados |

---

## Onde fica cada coisa

| | |
| --- | --- |
| código | `C:\Users\Mayk\blackjack-club` |
| site no ar | https://blackjack-club-kappa.vercel.app |
| repositório | https://github.com/Ale-jrr/BlackJack-club (branch `main`) |
| hospedagem do site | Vercel, plano grátis, publica sozinha a cada `git push` |
| servidor das salas | Supabase, projeto `blackjack-club`, id `zwltwqvddvacbgpswsac`, região São Paulo |
| função do servidor | Edge Function `sala` (fonte em `servidor/sala/index.ts`), versão 4 |
| documento de projeto | o texto de 91 seções que o Mayk escreveu no começo; cada regra cita a seção (`§20`, `§56`…) |

---

## Estado em 2026-09-18

**Testes:** 97 do motor e da sala, rodando no navegador, e 51 verificações contra o servidor
publicado. Todos passando.

**Pronto:**

- **Carreira** — motor completo (6 baralhos, hit, stand, double, split até 4 mãos, split de
  Áses, desistência, seguro 2:1, dealer para no 17 macio), saldo, XP, 100 níveis, missões,
  conquistas, bônus diário, histórico, estatísticas, 6 mesas por nível, som.
- **Jogar com amigos** — criar sala com as regras do ADM, código e link de convite, senha
  opcional, salas abertas na tela inicial, lobby com pronto e nome editável, jogada **um por
  vez** com cronômetro, aposta livre, dealer compartilhado, **crupiê de verdade** opcional,
  ranking da sala, campeão, recompra, espectadores, reconexão.
- **Mesa desenhada como mesa de verdade** — dealer no topo, lugares em arco, você sempre no
  meio. No celular o arranjo muda (§87).
- **Tutorial** em oito capítulos, com mão viva, calculadora de pagamento, treino do 3 para 2
  e teste no fim.

**Falta:** ver [[Pendências]]. O principal é o botão de expulsar jogador da sala.

---

## Como rodar e testar

```bash
py servidor.py 5180 .
```

Abre em `http://localhost:5180`. O servidor local manda `no-store` de propósito: o
`http.server` padrão faz o navegador reusar módulos do cache e rodar código velho sem avisar.
Esta máquina não tem Node — nada aqui depende dele.

| teste | como |
| --- | --- |
| motor e sala | abrir `http://localhost:5180/testes/index.html` |
| servidor publicado | `py testes/servidor.py` |
| jogador de mentira numa sala | `py testes/parceiro.py auto CODIGO 500` |

No painel de preview do Claude, a configuração se chama `blackjack` (no `launch.json` global).

---

## Retomando numa conversa nova

1. Ler esta nota, o [[Mapa do código]] e as [[Pendências]].
2. Mexeu em `src/motor/`? A função do servidor precisa ser **republicada** com o motor junto
   — ver [[Modo online]], seção "Republicar o servidor". Esquecer disso deixa o servidor com
   a regra velha e o jogo solo com a nova.
3. Antes de dar a tarefa por feita: rodar os testes do navegador e o `testes/servidor.py`, e
   olhar a tela de verdade (desktop e celular).
4. Commit e `git push`: o push publica o site sozinho. Tags não são usadas neste projeto.
   Commits terminam com a linha `Co-Authored-By` do Claude.
5. Testes que criam sala no servidor de verdade deixam lixo. Apagar as salas de teste no fim
   (a faxina automática só limpa depois de 12 horas).
