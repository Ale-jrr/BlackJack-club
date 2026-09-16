// Tutorial do jogo. Não é uma sequência de caixas de texto: cada capítulo
// mostra cartas de verdade, e três deles respondem ao toque — a mão que muda
// de valor, a calculadora de pagamento e o teste do fim.
//
// As contas e os valores vêm do motor (`mao.js`, `regras.js`), então o que o
// tutorial ensina é exatamente o que a mesa faz.

import { cartas as lerCartas } from '../motor/baralho.js';
import { textoValor, valorDaMao } from '../motor/mao.js';
import { PAGAMENTO_BLACKJACK, PAGAMENTO_SEGURO } from '../motor/regras.js';
import { elementoCarta } from './cartas.js';
import { som } from './som.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');

let ctx = null;
let capituloAtual = 0;

export function prepararTutorial(contexto) {
  ctx = contexto;
}

// ------------------------------------------------------------- peças soltas

function maoDeCartas(texto, { tamanho = '' } = {}) {
  const caixa = document.createElement('div');
  caixa.className = `mao-tutorial ${tamanho}`;
  for (const c of lerCartas(texto)) caixa.append(elementoCarta(c));
  return caixa;
}

function exemplo({ titulo, cartas, valor, nota, cor = '' }) {
  const bloco = document.createElement('div');
  bloco.className = `exemplo ${cor}`;
  if (titulo) {
    const t = document.createElement('div');
    t.className = 'titulo-exemplo';
    t.textContent = titulo;
    bloco.append(t);
  }
  if (cartas) bloco.append(maoDeCartas(cartas));
  if (valor) {
    const v = document.createElement('div');
    v.className = 'valor-exemplo';
    v.innerHTML = valor;
    bloco.append(v);
  }
  if (nota) {
    const n = document.createElement('div');
    n.className = 'nota-exemplo';
    n.innerHTML = nota;
    bloco.append(n);
  }
  return bloco;
}

function paragrafo(html) {
  const p = document.createElement('p');
  p.className = 'texto-tutorial';
  p.innerHTML = html;
  return p;
}

function fileira(...pecas) {
  const linha = document.createElement('div');
  linha.className = 'fileira-tutorial';
  linha.append(...pecas);
  return linha;
}

function botao(texto, classe, aoClicar) {
  const b = document.createElement('button');
  b.className = `botao ${classe}`;
  b.textContent = texto;
  b.onclick = aoClicar;
  return b;
}

// ------------------------------------------------------------- capítulos

const CAPITULOS = [
  {
    id: 'objetivo',
    nome: 'O jogo',
    montar(caixa) {
      caixa.append(paragrafo(
        `O jogo é <b>você contra o dealer</b>. Não interessa o que os outros jogadores fizeram:
         cada mão é resolvida contra a mão dele, separadamente.`));
      caixa.append(paragrafo(
        `Ganha quem chegar <b>mais perto de 21</b> sem passar. Passou de 21, a mão estourou e
         perde na hora, mesmo que o dealer estoure depois.`));
      caixa.append(fileira(
        exemplo({ titulo: 'Você', cartas: '10♠ 9♥', valor: '19', cor: 'boa' }),
        exemplo({ titulo: 'Dealer', cartas: 'Q♣ 7♦', valor: '17', cor: 'ruim' }),
      ));
      caixa.append(paragrafo('19 contra 17: você vence e recebe o valor que apostou.'));
      caixa.append(fileira(
        exemplo({ titulo: 'Você estourou', cartas: '10♠ 6♥ 9♦', valor: '25', cor: 'ruim',
          nota: 'Perde na hora, antes mesmo de o dealer jogar.' }),
        exemplo({ titulo: 'Dealer estourou', cartas: 'K♠ 6♦ 9♣', valor: '25', cor: 'boa',
          nota: 'Todo mundo que parou a tempo recebe.' }),
      ));
    },
  },

  {
    id: 'cartas',
    nome: 'As cartas',
    montar(caixa) {
      caixa.append(paragrafo('Não existe naipe que valha mais. Só o número importa.'));
      caixa.append(fileira(
        exemplo({ titulo: 'De 2 a 10', cartas: '2♠ 7♦ 10♣', nota: 'Valem o próprio número.' }),
        exemplo({ titulo: 'Valete, Dama e Rei', cartas: 'J♥ Q♠ K♦', nota: 'Valem <b>10</b>, os três.' }),
        exemplo({ titulo: 'Ás', cartas: 'A♠', nota: 'Vale <b>11 ou 1</b> — o que for melhor para você.' }),
      ));
      caixa.append(paragrafo(
        `Como figura e dez valem a mesma coisa, <b>quase um terço do baralho vale 10</b>. É por isso
         que a carta escondida do dealer costuma valer 10 na hora de decidir a sua jogada.`));
    },
  },

  {
    id: 'as',
    nome: 'O Ás',
    montar(caixa) {
      caixa.append(paragrafo(
        `O Ás começa valendo 11. Se a mão passar de 21, ele vira 1 sozinho. Você nunca escolhe:
         o jogo sempre usa o melhor valor possível.`));
      caixa.append(paragrafo(
        `Quando o Ás ainda conta 11, a mão é <b>macia</b> — ela aguenta mais uma carta sem
         estourar. Quando já virou 1, ela é <b>dura</b>.`));

      const estado = { cartas: ['A♠'] };
      const mostrador = document.createElement('div');
      mostrador.className = 'mao-viva';

      const desenhar = () => {
        const lista = lerCartas(estado.cartas.join(' '));
        const { total, macia } = valorDaMao(lista);
        mostrador.innerHTML = '';
        mostrador.append(maoDeCartas(estado.cartas.join(' ')));
        const placa = document.createElement('div');
        placa.className = 'placa-viva';
        placa.innerHTML = total > 21
          ? `<b class="ruim">${total} — estourou</b><span>Nem o Ás salva mais.</span>`
          : `<b>${textoValor(lista)}</b><span>${macia ? 'mão macia: o Ás ainda vale 11' : 'mão dura: o Ás virou 1'}</span>`;
        mostrador.append(placa);
      };

      const puxar = (carta) => {
        if (estado.cartas.length >= 6) return;
        estado.cartas.push(carta);
        som.carta();
        desenhar();
      };

      caixa.append(mostrador);
      caixa.append(fileira(
        botao('+ Ás', 'discreto', () => puxar('A♥')),
        botao('+ 5', 'discreto', () => puxar('5♦')),
        botao('+ 7', 'discreto', () => puxar('7♣')),
        botao('+ 10', 'discreto', () => puxar('10♠')),
        botao('Limpar', 'discreto', () => { estado.cartas = ['A♠']; som.botao(); desenhar(); }),
      ));
      desenhar();

      caixa.append(paragrafo(
        `Repare no que acontece com <b>A + 7</b>: vale 18, e ainda assim pedir carta é seguro,
         porque qualquer carta alta faz o Ás virar 1. Essa é a vantagem da mão macia.`));
    },
  },

  {
    id: 'blackjack',
    nome: 'Blackjack',
    montar(caixa) {
      caixa.append(paragrafo(
        `<b>Blackjack</b> é um Ás com uma carta de 10 <b>nas duas primeiras cartas</b>. É a melhor
         mão do jogo e paga mais que uma vitória normal.`));
      caixa.append(fileira(
        exemplo({ titulo: 'Isto é Blackjack', cartas: 'A♠ K♥', valor: '21', cor: 'ouro',
          nota: 'Paga <b>3 para 2</b>.' }),
        exemplo({ titulo: 'Isto é só 21', cartas: '7♠ 7♥ 7♦', valor: '21', cor: '',
          nota: 'Três cartas. Paga 1 para 1, como qualquer vitória.' }),
      ));
      caixa.append(paragrafo(
        `Se o dealer também tiver Blackjack, é empate e a aposta volta inteira. Um Blackjack
         formado depois de dividir um par também não conta como natural.`));
      caixa.append(paragrafo(
        `<b>A conta:</b> 3 para 2 é a aposta <b>mais a metade dela</b>.
         Apostou 1.000, o lucro é 1.500 e voltam 2.500 para você.`));
    },
  },

  {
    id: 'jogadas',
    nome: 'Suas jogadas',
    montar(caixa) {
      const jogada = (nome, quando, cartas, nota, cor) => {
        const bloco = exemplo({ titulo: nome, cartas, nota, cor });
        const q = document.createElement('div');
        q.className = 'quando';
        q.innerHTML = quando;
        bloco.append(q);
        return bloco;
      };

      caixa.append(paragrafo('Só aparece na tela o botão da jogada que é permitida naquele momento.'));
      caixa.append(fileira(
        jogada('PEDIR', 'Mais uma carta. Pode repetir até parar ou estourar.', '9♠ 5♦',
          '14 contra carta alta do dealer: normalmente se pede.'),
        jogada('PARAR', 'Encerra sua mão e passa a vez.', '10♠ 8♥',
          '18 já é uma boa mão: pedir aqui estoura na maioria das cartas.'),
      ));
      caixa.append(fileira(
        jogada('DOBRAR', 'Dobra a aposta e você recebe <b>exatamente uma</b> carta.', '6♠ 5♥',
          '11 é a melhor mão para dobrar: qualquer carta de 10 faz 21.', 'ouro'),
        jogada('DIVIDIR', 'Duas cartas de mesmo valor viram duas mãos, cada uma com sua aposta.', '8♠ 8♦',
          '16 é a pior mão do jogo. Dois oitos separados valem muito mais.', 'ouro'),
      ));
      caixa.append(fileira(
        jogada('DESISTIR', 'Sai da mão e recebe metade da aposta de volta.', '10♠ 6♥',
          'Serve para 16 contra carta alta: perder metade é melhor que perder tudo.'),
        jogada('SEGURO', 'Aposta à parte quando o dealer mostra Ás. Paga 2 para 1.', 'A♠',
          'Custa metade da sua aposta. A longo prazo, é a pior aposta da mesa.', 'ruim'),
      ));
      caixa.append(paragrafo(
        `Dividir Áses é caso especial: cada Ás recebe <b>uma carta só</b>, e um 21 formado assim
         não é Blackjack natural.`));
    },
  },

  {
    id: 'dealer',
    nome: 'O dealer',
    montar(caixa) {
      caixa.append(paragrafo(
        `O dealer não escolhe nada. Ele segue uma regra fixa, e é justamente por isso que dá para
         jogar contra ele com estratégia.`));
      caixa.append(fileira(
        exemplo({ titulo: 'Com 16 ou menos', cartas: '10♠ 6♥', valor: 'compra', cor: 'ruim',
          nota: 'Ele é obrigado a pedir carta.' }),
        exemplo({ titulo: 'Com 17 ou mais', cartas: '10♠ 7♥', valor: 'para', cor: 'boa',
          nota: 'Ele é obrigado a parar.' }),
        exemplo({ titulo: 'Soft 17', cartas: 'A♠ 6♥', valor: 'para', cor: 'boa',
          nota: 'Nesta mesa o dealer <b>para</b> também no 17 macio.' }),
      ));
      caixa.append(paragrafo(
        `Ele recebe uma carta aberta e uma escondida. Você decide olhando só para a aberta.
         Quando ela é um Ás ou vale 10, o sistema confere a escondida antes de você jogar, para
         resolver logo se já é Blackjack dele.`));
      caixa.append(paragrafo(
        `A carta aberta muda tudo: contra <b>2 a 6</b> o dealer estoura com frequência, e vale a
         pena parar cedo. Contra <b>7 a Ás</b>, ele costuma fechar mão alta, e parar com 15 raramente resolve.`));
    },
  },

  {
    id: 'contas',
    nome: 'Contas rápidas',
    montar(caixa) {
      caixa.append(paragrafo(
        `Saber o pagamento de cabeça evita susto na mesa. São três contas, e nenhuma delas é difícil.`));

      const estado = { aposta: 1000 };
      const painel = document.createElement('div');
      painel.className = 'contas';

      const desenhar = () => {
        const a = estado.aposta;
        const bj = Math.round(a * PAGAMENTO_BLACKJACK);
        const seguro = Math.floor(a / 2);
        painel.innerHTML = `
          <div class="linha-conta"><span>Vitória normal</span>
            <b class="mais">+${fmt(a)}</b><small>volta ${fmt(a * 2)}</small></div>
          <div class="linha-conta ouro"><span>Blackjack (3 para 2)</span>
            <b class="mais">+${fmt(bj)}</b><small>volta ${fmt(a + bj)}</small></div>
          <div class="linha-conta"><span>Empate</span>
            <b>0</b><small>volta ${fmt(a)}</small></div>
          <div class="linha-conta"><span>Desistir</span>
            <b class="menos">-${fmt(a - Math.floor(a / 2))}</b><small>volta ${fmt(Math.floor(a / 2))}</small></div>
          <div class="linha-conta"><span>Seguro (2 para 1)</span>
            <b>custa ${fmt(seguro)}</b><small>devolve ${fmt(seguro * (1 + PAGAMENTO_SEGURO))} se o dealer tiver Blackjack</small></div>`;
      };

      const fichas = fileira(...[100, 500, 1000, 2500, 5000].map((v) => botao(fmt(v), 'discreto', () => {
        estado.aposta = v;
        som.ficha();
        desenhar();
      })));

      caixa.append(fichas, painel);
      desenhar();

      caixa.append(paragrafo(
        `<b>3 para 2 é a única conta que dá trabalho.</b> Crupiê de verdade aprende três jeitos de
         fazer, e todos dão no mesmo. Usando uma aposta de 80:`));

      const jeitos = document.createElement('div');
      jeitos.className = 'jeitos';
      jeitos.innerHTML = `
        <div class="jeito"><b>Metade e soma</b>
          <span>Metade de 80 é 40. 80 + 40 = <b>120</b>.</span></div>
        <div class="jeito"><b>Três metades</b>
          <span>Metade de 80 é 40. 40 × 3 = <b>120</b>.</span></div>
        <div class="jeito fraco"><b>Vezes 1,5</b>
          <span>80 × 1,5 = <b>120</b>. Funciona, mas ninguém na mesa faz assim.</span></div>`;
      caixa.append(jeitos);

      caixa.append(paragrafo(
        `Os dois primeiros são rápidos porque dividir por dois é fácil de cabeça, e somar é mais
         rápido que multiplicar. Em mesa de verdade, é por isso que as apostas costumam ser em
         valores pares: 3 para 2 fecha redondo. <b>Aposta ímpar aqui é arredondada</b> — 25 pagaria
         37,5, e o jogo paga 38.`));

      caixa.append(paragrafo(
        `<b>Seguro:</b> você põe metade da aposta e recebe o dobro disso de volta se o dealer
         tiver Blackjack. A conta fecha exatamente a perda da mão principal — por isso parece
         justo. Não é: o dealer fecha Blackjack em pouco menos de um terço das vezes em que
         mostra Ás, e o seguro paga como se fosse um terço certo.`));

      // Treino: a conta do 3 para 2 sob pressão, que é onde o crupiê erra.
      const treino = { aposta: 0, acertos: 0, erros: 0 };
      const palco = document.createElement('div');
      palco.className = 'treino';

      const sortearAposta = () => {
        const valores = [40, 60, 80, 120, 150, 200, 250, 300, 500, 700, 900, 1200, 2500];
        return valores[Math.floor(Math.random() * valores.length)];
      };

      const rodada = () => {
        treino.aposta = sortearAposta();
        const certo = Math.round(treino.aposta * PAGAMENTO_BLACKJACK);
        const alternativas = new Set([certo, treino.aposta, treino.aposta * 2, Math.round(certo / 2)]);
        const opcoes = [...alternativas].slice(0, 3).sort(() => Math.random() - 0.5);

        palco.innerHTML = '';
        const pergunta = document.createElement('div');
        pergunta.className = 'pergunta-treino';
        pergunta.innerHTML = `Blackjack com aposta de <b>${fmt(treino.aposta)}</b>.
          Quanto é o <b>lucro</b>?`;
        palco.append(pergunta);

        const linha = document.createElement('div');
        linha.className = 'fileira-tutorial';
        for (const valor of opcoes) {
          linha.append(botao(fmt(valor), 'discreto', () => {
            if (valor === certo) { treino.acertos++; som.vitoria(); } else { treino.erros++; som.bust(); }
            const aviso = document.createElement('div');
            aviso.className = `resposta-teste ${valor === certo ? 'certa' : 'errada'}`;
            aviso.innerHTML = valor === certo
              ? `<b>Isso.</b> Metade de ${fmt(treino.aposta)} é ${fmt(treino.aposta / 2)}, somada à aposta dá ${fmt(certo)}.`
              : `<b>Não.</b> Metade de ${fmt(treino.aposta)} é ${fmt(treino.aposta / 2)}; com a aposta, o lucro é ${fmt(certo)}.`;
            palco.append(aviso);
            palco.append(botao('OUTRA', 'ouro', rodada));
            placar.textContent = `${treino.acertos} certo(s) · ${treino.erros} erro(s)`;
          }));
        }
        palco.append(linha);
      };

      const placar = document.createElement('div');
      placar.className = 'placar-treino';
      placar.textContent = 'Treine a conta: ela é a que mais escapa na hora.';

      caixa.append(placar, palco);
      caixa.append(fileira(botao('COMEÇAR O TREINO', 'ouro', () => { som.botao(); rodada(); })));
    },
  },

  {
    id: 'teste',
    nome: 'Teste rápido',
    montar(caixa) {
      const PERGUNTAS = [
        {
          enunciado: 'Quanto vale esta mão?',
          cartas: 'A♠ 7♥',
          opcoes: ['8', '18', '8 ou 18, e o jogo usa 18'],
          certa: 2,
          porque: 'O Ás vale 11 enquanto couber. A mão é macia: 18 agora, e vira 8 se vier carta alta.',
        },
        {
          enunciado: 'Você tem 8 e 8. O dealer mostra 6. O que fazer?',
          cartas: '8♠ 8♦',
          opcoes: ['Pedir carta', 'Parar com 16', 'Dividir'],
          certa: 2,
          porque: 'Dividir. 16 é a pior mão do jogo, e o 6 do dealer é a carta com que ele mais estoura.',
        },
        {
          enunciado: 'Aposta de 600 e você faz Blackjack. Quanto volta para você?',
          cartas: 'A♣ K♦',
          opcoes: ['1.200', '1.500', '900'],
          certa: 1,
          porque: '3 para 2: 600 de aposta mais 900 de lucro. Metade de 600 é 300, somado aos 600 dá 900 de lucro.',
        },
        {
          enunciado: 'Sua mão é 17 dura e o dealer mostra 10. Pedir ou parar?',
          cartas: '10♠ 7♦',
          opcoes: ['Pedir: 17 é pouco contra 10', 'Parar'],
          certa: 1,
          porque: 'Parar. Com 17, só 4 cartas de treze não estouram você. É mão ruim, mas pedir é pior.',
        },
        {
          enunciado: 'O dealer mostra Ás e oferece seguro. Vale a pena?',
          cartas: 'A♥',
          opcoes: ['Sim, protege a mão', 'Não, a longo prazo é prejuízo'],
          certa: 1,
          porque: 'Não. Ele fecha Blackjack em pouco menos de um terço das vezes, e o seguro paga como se fosse um terço certo.',
        },
      ];

      const estado = { indice: 0, acertos: 0, respondida: false };
      const palco = document.createElement('div');
      palco.className = 'palco-teste';

      const desenhar = () => {
        const q = PERGUNTAS[estado.indice];
        palco.innerHTML = '';

        const cabeca = document.createElement('div');
        cabeca.className = 'cabeca-teste';
        cabeca.innerHTML = `<span>Pergunta ${estado.indice + 1} de ${PERGUNTAS.length}</span>
          <span class="placar">${estado.acertos} acerto${estado.acertos === 1 ? '' : 's'}</span>`;
        palco.append(cabeca);

        palco.append(paragrafo(`<b>${q.enunciado}</b>`));
        if (q.cartas) palco.append(maoDeCartas(q.cartas));

        const opcoes = document.createElement('div');
        opcoes.className = 'opcoes-teste';
        q.opcoes.forEach((texto, i) => {
          const b = botao(texto, 'discreto', () => responder(i, opcoes));
          opcoes.append(b);
        });
        palco.append(opcoes);
      };

      const responder = (escolha, opcoes) => {
        if (estado.respondida) return;
        estado.respondida = true;
        const q = PERGUNTAS[estado.indice];
        const acertou = escolha === q.certa;
        if (acertou) { estado.acertos++; som.vitoria(); } else som.bust();

        [...opcoes.children].forEach((b, i) => {
          b.disabled = true;
          if (i === q.certa) b.classList.add('verde');
          else if (i === escolha) b.classList.add('vermelho');
        });

        const resposta = document.createElement('div');
        resposta.className = `resposta-teste ${acertou ? 'certa' : 'errada'}`;
        resposta.innerHTML = `<b>${acertou ? 'Isso.' : 'Não é essa.'}</b> ${q.porque}`;
        palco.append(resposta);

        const ultima = estado.indice === PERGUNTAS.length - 1;
        palco.append(botao(ultima ? 'VER RESULTADO' : 'PRÓXIMA', 'ouro', () => {
          if (!ultima) {
            estado.indice++;
            estado.respondida = false;
            desenhar();
            return;
          }
          palco.innerHTML = '';
          const nota = estado.acertos === PERGUNTAS.length ? 'Gabaritou.'
            : estado.acertos >= 3 ? 'Dá para sentar na mesa.'
            : 'Vale reler os capítulos antes de apostar alto.';
          palco.append(paragrafo(
            `<b>${estado.acertos} de ${PERGUNTAS.length}.</b> ${nota}`));
          palco.append(fileira(
            botao('REFAZER O TESTE', 'discreto', () => {
              Object.assign(estado, { indice: 0, acertos: 0, respondida: false });
              desenhar();
            }),
            botao('JOGAR AGORA', 'ouro', () => ctx.jogar()),
          ));
        }));
      };

      caixa.append(palco);
      desenhar();
    },
  },
];

// ------------------------------------------------------------------ tela

export function abrirTutorial(capitulo = 0) {
  capituloAtual = Math.max(0, Math.min(CAPITULOS.length - 1, capitulo));
  ctx.irPara('tutorial');
  pintar();
}

function pintar() {
  const abas = $('tutorial-abas');
  abas.innerHTML = '';
  CAPITULOS.forEach((cap, i) => {
    const b = document.createElement('button');
    b.className = `aba${i === capituloAtual ? ' ativa' : ''}`;
    b.textContent = `${i + 1}. ${cap.nome}`;
    b.onclick = () => { som.botao(); capituloAtual = i; pintar(); };
    abas.append(b);
  });

  const cap = CAPITULOS[capituloAtual];
  const caixa = $('tutorial-conteudo');
  caixa.innerHTML = '';
  const titulo = document.createElement('h2');
  titulo.textContent = cap.nome;
  caixa.append(titulo);
  cap.montar(caixa);

  $('btn-tutorial-anterior').disabled = capituloAtual === 0;
  $('btn-tutorial-anterior').onclick = () => { som.botao(); capituloAtual--; pintar(); };

  const proximo = $('btn-tutorial-proximo');
  const ultimo = capituloAtual === CAPITULOS.length - 1;
  proximo.textContent = ultimo ? 'JOGAR AGORA' : 'PRÓXIMO';
  proximo.onclick = () => {
    som.botao();
    if (ultimo) return ctx.jogar();
    capituloAtual++;
    pintar();
  };

  $('tela-tutorial').scrollTop = 0;
}
