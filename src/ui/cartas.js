// Desenho das cartas. HTML puro com CSS — nada de imagem para carregar.

const VERMELHOS = new Set(['♥', '♦']);

export function elementoCarta(carta, { virada = false, entrando = false } = {}) {
  const el = document.createElement('div');
  el.className = 'carta';
  if (VERMELHOS.has(carta?.naipe)) el.classList.add('vermelha');
  if (virada) el.classList.add('virada');
  if (entrando) el.classList.add('entrando');

  const frente = document.createElement('div');
  frente.className = 'face frente';
  if (carta) {
    frente.innerHTML = `
      <span class="canto cima">${carta.valor}<i>${carta.naipe}</i></span>
      <span class="centro">${carta.naipe}</span>
      <span class="canto baixo">${carta.valor}<i>${carta.naipe}</i></span>`;
  }

  const verso = document.createElement('div');
  verso.className = 'face verso';
  verso.innerHTML = '<span></span>';

  el.append(frente, verso);
  return el;
}
