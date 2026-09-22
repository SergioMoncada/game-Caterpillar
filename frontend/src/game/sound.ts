import Phaser from "phaser";

/**
 * Preferencia de sonido (música + efectos) y efectos de sonido del juego.
 *
 * Los efectos se sintetizan con osciladores de la Web Audio API en vez de cargar archivos:
 * son pitidos de arcade de milisegundos, así que generarlos no pesa nada y no hay descargas.
 */
const STORAGE_KEY = "musicMuted";

export function isMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // modo privado: suena por defecto
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // la preferencia solo dura esta visita
  }
}

/** El contexto solo existe con Web Audio; si el navegador cayó al modo HTML5, no hay efectos. */
function audio(scene: Phaser.Scene) {
  if (isMuted()) return null;
  const manager = scene.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = manager.context;
  if (!ctx || ctx.state === "closed") return null;
  // Salida del juego: respeta el volumen general y la pausa al cambiar de pestaña
  const out: AudioNode = manager.masterVolumeNode ?? ctx.destination;
  return { ctx, out };
}

interface ToneOptions {
  type: OscillatorType;
  from: number;      // frecuencia inicial (Hz)
  to?: number;       // frecuencia final, si el tono baja o sube
  duration: number;  // segundos
  gain: number;      // volumen del efecto (0-1)
  delay?: number;    // segundos de espera antes de sonar
}

function tone(scene: Phaser.Scene, { type, from, to, duration, gain, delay = 0 }: ToneOptions) {
  const a = audio(scene);
  if (!a) return;
  const start = a.ctx.currentTime + delay;

  const osc = a.ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(to, start + duration);

  // Ataque corto y caída suave: evita el "clic" de cortar la onda de golpe
  const env = a.ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(env).connect(a.out);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Moneda: dos pitidos cortos que suben, como en las máquinas arcade */
export function playCoin(scene: Phaser.Scene) {
  tone(scene, { type: "square", from: 1046, duration: 0.07, gain: 0.14 });
  tone(scene, { type: "square", from: 1568, duration: 0.1, gain: 0.14, delay: 0.06 });
}

/** Golpe: tono grave que cae */
export function playHit(scene: Phaser.Scene) {
  tone(scene, { type: "sawtooth", from: 220, to: 60, duration: 0.32, gain: 0.22 });
  tone(scene, { type: "square", from: 110, to: 40, duration: 0.28, gain: 0.12 });
}

/** Botones: clic seco */
export function playClick(scene: Phaser.Scene) {
  tone(scene, { type: "square", from: 660, to: 880, duration: 0.05, gain: 0.1 });
}
