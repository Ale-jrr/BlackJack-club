# Pendências

O que falta, os limites conhecidos e os cuidados. Índice em [[BlackJack Club]].

---

## Falta fazer

| item | por que importa | tamanho |
| --- | --- | --- |
| **Expulsar jogador** da sala | com sala aberta a desconhecidos, o ADM não tem como tirar alguém chato ou com nome ofensivo | pequeno |
| Chat e reações na sala (§69, §70) | parte do lado social do documento | médio |
| Seguro na sala online | existe só na carreira; exige uma fase antes da espiada do dealer | médio |
| Login e perfil que segue a pessoa entre aparelhos | hoje cada navegador é um perfil; o celular começa do zero | grande |
| Ranking entre jogadores | depende do login; hoje só existe o ranking de dentro da sala | grande |
| Loja de cosméticos (§35) | aparece no menu como "em breve" | médio |
| Filtro de nome ofensivo | nomes são livres (sem risco técnico: tudo é tratado como texto) | pequeno |

---

## Limites do plano grátis

| serviço | limite | o que significa |
| --- | --- | --- |
| Vercel | 100 GB de banda por mês | ~1,5 milhão de primeiras visitas (cada uma baixa ~68 KB) |
| Vercel | só uso pessoal | anúncio ou cobrança exigem plano pago |
| Supabase | 500 mil chamadas à função por mês | ~1.250 horas de jogo online somando todos |
| Supabase | 200 conexões de tempo real simultâneas | ~200 pessoas dentro de salas ao mesmo tempo |
| Supabase | pausa após 7 dias sem uso | o online para até clicar "Resume project" |

Passar da cota do Supabase não gera conta: vem aviso, prazo de carência e depois o online para
até o mês virar. A carreira continua funcionando.

---

## Cuidados ao mexer

- Mexeu em `src/motor/`: **republicar a função** com o motor junto ([[Modo online]]).
- Não "corrigir" o aviso `rls_enabled_no_policy` do Supabase: é o que protege as cartas.
- A identidade do jogador é por endereço: `localhost` e o site publicado são jogadores
  diferentes.
- Teste que cria sala no servidor de verdade deixa sala no banco; sala pública aparece para
  quem visita o site. Apagar no fim (`delete from public.sala where codigo in (...)`), só as
  que o teste criou.
- A partida que ninguém joga pula rodadas sozinha (ninguém apostou, a rodada passa). É o
  comportamento da §52, mas queima o limite de rodadas se todo mundo sumir.
- Um jogador que fecha a aba sem sair continua marcado como conectado. Se ele for o primeiro
  da fila de aviso de prazo, a mesa anda com 2 s a mais por prazo.
