// Sons sintetizados na hora com WebAudio. Sem arquivo de áudio para baixar,
// e o contexto só nasce depois do primeiro toque (regra dos navegadores).

let ctx = null;
let config = { musica: true, efeitos: true };
let musicaLigada = false;
let ganhoMusica = null;

function contexto() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function configurarSom(nova) {
  config = { ...config, ...nova };
  if (ganhoMusica) ganhoMusica.gain.value = config.musica ? 0.06 : 0;
  if (config.musica && !musicaLigada) iniciarMusica();
}

function nota(freq, inicio, duracao, tipo = 'sine', volume = 0.2) {
  const c = contexto();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = tipo;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + inicio);
  g.gain.linearRampToValueAtTime(volume, c.currentTime + inicio + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + inicio + duracao);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + inicio);
  osc.stop(c.currentTime + inicio + duracao + 0.02);
}

function ruido(duracao = 0.08, volume = 0.18, corte = 2400) {
  const c = contexto();
  if (!c) return;
  const amostras = Math.floor(c.sampleRate * duracao);
  const buffer = c.createBuffer(1, amostras, c.sampleRate);
  const dados = buffer.getChannelData(0);
  for (let i = 0; i < amostras; i++) {
    dados[i] = (Math.random() * 2 - 1) * (1 - i / amostras);
  }
  const fonte = c.createBufferSource();
  fonte.buffer = buffer;
  const filtro = c.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.frequency.value = corte;
  const g = c.createGain();
  g.gain.value = volume;
  fonte.connect(filtro).connect(g).connect(c.destination);
  fonte.start();
}

export const som = {
  carta() { if (config.efeitos) ruido(0.09, 0.16, 2600); },
  ficha() { if (config.efeitos) { ruido(0.05, 0.12, 5200); nota(1200, 0, 0.05, 'triangle', 0.06); } },
  botao() { if (config.efeitos) nota(520, 0, 0.05, 'triangle', 0.05); },
  vitoria() {
    if (!config.efeitos) return;
    [523, 659, 784].forEach((f, i) => nota(f, i * 0.09, 0.28, 'triangle', 0.14));
  },
  derrota() {
    if (!config.efeitos) return;
    nota(220, 0, 0.32, 'sine', 0.14);
    nota(174, 0.1, 0.4, 'sine', 0.12);
  },
  empate() { if (config.efeitos) nota(392, 0, 0.22, 'sine', 0.1); },
  blackjack() {
    if (!config.efeitos) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) => nota(f, i * 0.08, 0.4, 'triangle', 0.15));
  },
  bust() {
    if (!config.efeitos) return;
    nota(196, 0, 0.18, 'sawtooth', 0.1);
    nota(147, 0.08, 0.3, 'sawtooth', 0.1);
  },
  nivel() {
    if (!config.efeitos) return;
    [659, 784, 988, 1319].forEach((f, i) => nota(f, i * 0.1, 0.5, 'sine', 0.13));
  },
};

// Ambiente: acorde grave que respira devagar, bem no fundo.
function iniciarMusica() {
  const c = contexto();
  if (!c || musicaLigada) return;
  musicaLigada = true;
  ganhoMusica = c.createGain();
  ganhoMusica.gain.value = config.musica ? 0.06 : 0;
  ganhoMusica.connect(c.destination);

  const acordes = [[110, 164.81, 220], [98, 146.83, 196], [123.47, 164.81, 246.94], [87.31, 130.81, 174.61]];
  let passo = 0;

  const tocar = () => {
    const acorde = acordes[passo % acordes.length];
    passo++;
    for (const freq of acorde) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, c.currentTime);
      g.gain.linearRampToValueAtTime(0.5, c.currentTime + 1.6);
      g.gain.linearRampToValueAtTime(0, c.currentTime + 6);
      osc.connect(g).connect(ganhoMusica);
      osc.start();
      osc.stop(c.currentTime + 6.2);
    }
  };
  tocar();
  setInterval(tocar, 6000);
}

export function acordarAudio(config0) {
  configurarSom(config0);
  contexto();
  if (config.musica) iniciarMusica();
}
