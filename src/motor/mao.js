// Avaliação de mão: melhor valor possível com Ás valendo 11 ou 1.

import { pontos } from './baralho.js';

export function valorDaMao(lista) {
  let total = 0;
  let ases = 0;
  for (const c of lista) {
    total += pontos(c);
    if (c.valor === 'A') ases++;
  }
  while (total > 21 && ases > 0) {
    total -= 10;
    ases--;
  }
  // "macia" = ainda existe um Ás contando 11 (a mão pode receber 10 sem estourar)
  return { total, macia: ases > 0 };
}

export function ehBlackjack(lista) {
  return lista.length === 2 && valorDaMao(lista).total === 21;
}

export function estourou(lista) {
  return valorDaMao(lista).total > 21;
}

export function mesmoValor(a, b) {
  return pontos(a) === pontos(b);
}

// Texto para a interface: "8/18" quando a mão é macia, "18" quando não é.
export function textoValor(lista) {
  if (lista.length === 0) return '';
  const { total, macia } = valorDaMao(lista);
  if (macia && total <= 21) return `${total - 10}/${total}`;
  return String(total);
}
