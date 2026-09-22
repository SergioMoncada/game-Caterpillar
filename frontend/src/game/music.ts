import Phaser from "phaser";
import { COLORS } from "./theme";
import { isMuted, setMuted, playClick } from "./sound";

/**
 * Música de fondo: una sola pista en bucle que suena en todas las escenas.
 * El SoundManager de Phaser es global al juego, así que la pista sigue sonando al cambiar de escena.
 * Pesa ~7 MB: el menú la descarga en segundo plano y empieza a sonar cuando el jugador da JUGAR.
 */
const KEY = "musica-fondo";
const URL = "assets/audio/cat_x_jbeat_instrumental_1.mp3";
const VOLUME = 0.5;

/** Crédito de la pista, se muestra junto a los avisos legales del Game Over */
export const MUSIC_CREDIT = 'Música: "Instrumental 1 (Trap Vibe)" – CAT x JBEAT. Todos los derechos reservados.';

type Track = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;

function track(scene: Phaser.Scene) {
  return scene.sound.get(KEY) as Track | null;
}

/** Deja la pista lista en memoria sin reproducirla (se llama desde el menú). */
export function preloadMusic(scene: Phaser.Scene) {
  if (scene.cache.audio.exists(KEY) || scene.load.isLoading()) return;
  scene.load.audio(KEY, URL);
  scene.load.start();
}

/**
 * Arranca la música si no está sonando (la continúa si ya venía de otra escena).
 * Si la descarga no ha terminado, la pista empieza apenas esté lista.
 */
export function startMusic(scene: Phaser.Scene, fromStart = false) {
  const current = track(scene);
  if (current?.isPlaying && !fromStart) return;

  const play = () => {
    const existing = track(scene);
    if (existing) {
      if (existing.isPlaying && !fromStart) return;
      existing.stop(); // play() de una pista detenida arranca desde el principio
      existing.setMute(isMuted());
      existing.play();
      return;
    }
    const music = scene.sound.add(KEY, { loop: true, volume: VOLUME });
    music.setMute(isMuted());
    // Si el navegador todavía no deja sonar audio, Phaser lo arranca con el primer toque del jugador
    music.play();
  };

  if (scene.cache.audio.exists(KEY)) {
    play();
    return;
  }
  scene.load.audio(KEY, URL);
  scene.load.once(`filecomplete-audio-${KEY}`, play);
  if (!scene.load.isLoading()) scene.load.start();
}

/** Cada partida empieza con la pista desde el principio (también al dar JUGAR DE NUEVO). */
export function restartMusic(scene: Phaser.Scene) {
  startMusic(scene, true);
}

/** Silencio en el menú: la música queda esperando a que empiece la siguiente partida. */
export function stopMusic(scene: Phaser.Scene) {
  track(scene)?.stop();
}

/**
 * Botón cuadrado de sonido con parlante pixel, en estilo arcade (borde amarillo sobre negro).
 * Controla la música y los efectos. (right, top) es su esquina superior derecha.
 */
export function musicToggle(scene: Phaser.Scene, right: number, top: number, depth = 950) {
  const SIZE = 34, BORDER = 3;
  const x = right - SIZE, y = top;
  const g = scene.add.graphics().setDepth(depth);

  const draw = () => {
    const muted = isMuted();
    g.clear();
    g.fillStyle(COLORS.yellow, 1).fillRect(x, y, SIZE, SIZE);
    g.fillStyle(COLORS.black, 1).fillRect(x + BORDER, y + BORDER, SIZE - BORDER * 2, SIZE - BORDER * 2);

    // Parlante: caja + cono, en bloques de 2px para que se vea pixel
    const cx = x + 9, cy = y + SIZE / 2;
    const ink = muted ? 0x8a8a8a : COLORS.yellow;
    g.fillStyle(ink, 1);
    g.fillRect(cx, cy - 3, 4, 6);
    g.fillTriangle(cx + 3, cy - 3, cx + 9, cy - 8, cx + 9, cy + 3);
    g.fillTriangle(cx + 3, cy + 3, cx + 9, cy + 8, cx + 9, cy - 3);

    if (muted) {
      // X roja = silenciado
      g.lineStyle(3, COLORS.red, 1);
      g.lineBetween(cx + 12, cy - 5, cx + 20, cy + 5);
      g.lineBetween(cx + 20, cy - 5, cx + 12, cy + 5);
    } else {
      // Ondas de sonido
      g.fillRect(cx + 12, cy - 3, 2, 6);
      g.fillRect(cx + 16, cy - 6, 2, 12);
    }
  };
  draw();

  const zone = scene.add.zone(x - 6, y - 6, SIZE + 12, SIZE + 12)
    .setOrigin(0, 0)
    .setDepth(depth)
    .setInteractive({ useHandCursor: true });
  zone.on("pointerup", () => {
    const muted = !isMuted();
    setMuted(muted);
    track(scene)?.setMute(muted);
    draw();
    if (!muted) playClick(scene); // al reactivar, el clic confirma que ya hay sonido
  });
  return zone;
}
