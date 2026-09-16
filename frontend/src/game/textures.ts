import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, BARRIER_WIDTH, LEVELS } from "./constants";
import { CSS } from "./theme";

/**
 * Todas las texturas del juego se generan por código con Canvas 2D (sin archivos de imagen).
 * Los sprites pixel-art se copiaron 1:1 de los SVG de los mockups.
 */

type PixelRect = [x: number, y: number, w: number, h: number, color: string];

interface PixelSpriteDef {
  w: number; // ancho del viewBox
  h: number; // alto del viewBox
  rects: PixelRect[];
}

export const SPRITES = {
  jeepMenu: {
    w: 20, h: 12,
    rects: [
      [2, 4, 16, 4, CSS.yellow], [4, 1, 11, 3, CSS.yellow],
      [5, 2, 4, 2, CSS.black], [10, 2, 4, 2, CSS.black],
      [1, 8, 18, 1, CSS.black],
      [17, 5, 2, 2, CSS.red], [1, 5, 1, 2, CSS.red],
      [3, 9, 3, 3, CSS.black], [14, 9, 3, 3, CSS.black],
      [4, 10, 1, 1, "#555555"], [15, 10, 1, 1, "#555555"],
    ],
  },
  jeep: {
    w: 20, h: 14,
    rects: [
      [2, 5, 16, 6, CSS.yellow], [4, 1, 11, 4, CSS.yellow],
      [5, 2, 4, 2, CSS.black], [10, 2, 4, 2, CSS.black],
      [1, 10, 18, 1, CSS.black],
      [17, 6, 2, 2, CSS.red], [1, 6, 1, 2, CSS.red],
      [3, 11, 3, 3, CSS.black], [14, 11, 3, 3, CSS.black],
    ],
  },
  rock: {
    w: 12, h: 12,
    rects: [[2, 4, 8, 5, "#6b6b6b"], [3, 2, 6, 2, "#8a8a8a"], [4, 3, 2, 1, "#4a4a4a"]],
  },
  cone: {
    w: 12, h: 12,
    rects: [
      [5, 1, 2, 2, CSS.orange], [4, 3, 4, 2, CSS.orange], [3, 5, 6, 2, CSS.orange],
      [4, 6, 4, 1, "#ffffff"], [1, 8, 10, 2, CSS.black],
    ],
  },
  barrel: {
    w: 12, h: 12,
    rects: [
      [2, 2, 8, 9, CSS.red], [2, 4, 8, 1, CSS.black], [2, 7, 8, 1, CSS.black], [3, 1, 6, 1, CSS.yellow],
    ],
  },
  coin: {
    w: 8, h: 8,
    rects: [[2, 1, 4, 6, CSS.yellow], [1, 2, 6, 4, CSS.yellow], [3, 3, 2, 2, "#d89a00"]],
  },
} satisfies Record<string, PixelSpriteDef>;

const HEART_ROWS = [
  ".XX.XX.",
  "XXXXXXX",
  "XXXXXXX",
  ".XXXXX.",
  "..XXX..",
  "...X...",
];

export const OBSTACLE_KEYS = ["obst-ajedrez", "obst-dado", "obst-naipe"] as const;

/** PRUEBA DE DISEÑO: assets entregados en la carpeta GAME NIGHT (exportados a los tamaños de la spec) */
export function preloadDesignAssets(scene: Phaser.Scene) {
  const img = (key: string, path: string) => {
    if (!scene.textures.exists(key)) scene.load.image(key, `assets/${path}`);
  };
  img("jugador", "jugador/jugador@3x.png");
  img("jugador-menu", "jugador/jugador_menu.png");
  img("catcoin", "monedas/catcoin@3x.png");
  img("catcoin-hud", "monedas/catcoin_hud@3x.png");
  img("obst-ajedrez", "obstaculos/obstaculo_ajedrez_01@3x.png");
  img("obst-dado", "obstaculos/obstaculo_dado_01@3x.png");
  img("obst-naipe", "obstaculos/obstaculo_naipe_01@3x.png");
  img("pared", "paredes/pared@3x.png");
  LEVELS.forEach((l) => img(l.skyline, `ciudades/${l.skyline}@4x.png`));
  if (!scene.textures.exists("logo-cat-blanco")) {
    scene.load.svg("logo-cat-blanco", "assets/logos/logo_cat_blanco.svg", { width: 240, height: 179 });
  }
}

/** Degradado del cielo de cada nivel (franja superior de 200u) */
export function skyTexture(scene: Phaser.Scene, top: string, bottom: string, h: number) {
  const key = `sky-${top}-${bottom}`;
  canvasTexture(scene, key, GAME_WIDTH, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_WIDTH, h);
  });
  return key;
}

/** Margen transparente alrededor de los sprites que llevan sombra "drop-shadow" horneada */
export const SHADOW_PAD = 10;

function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void
) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h));
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}

function drawPixels(
  ctx: CanvasRenderingContext2D,
  def: PixelSpriteDef,
  scale: number,
  offX = 0,
  offY = 0
) {
  for (const [x, y, w, h, color] of def.rects) {
    const x0 = Math.round(offX + x * scale);
    const y0 = Math.round(offY + y * scale);
    const x1 = Math.round(offX + (x + w) * scale);
    const y1 = Math.round(offY + (y + h) * scale);
    ctx.fillStyle = color;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
}

function pixelSprite(scene: Phaser.Scene, key: string, def: PixelSpriteDef, scale: number, shadow?: { blur: number; offsetY: number; alpha: number }) {
  const pad = shadow ? SHADOW_PAD : 0;
  canvasTexture(scene, key, def.w * scale + pad * 2, def.h * scale + pad * 2, (ctx) => {
    if (shadow) {
      // drop-shadow: se dibuja la silueta en un canvas aparte y se proyecta su sombra
      const tmp = document.createElement("canvas");
      tmp.width = Math.ceil(def.w * scale);
      tmp.height = Math.ceil(def.h * scale);
      drawPixels(tmp.getContext("2d")!, def, scale);
      ctx.save();
      ctx.shadowColor = `rgba(0,0,0,${shadow.alpha})`;
      ctx.shadowBlur = shadow.blur;
      ctx.shadowOffsetY = shadow.offsetY;
      ctx.drawImage(tmp, pad, pad);
      ctx.restore();
      ctx.clearRect(pad, pad, tmp.width, tmp.height);
      ctx.drawImage(tmp, pad, pad);
    } else {
      drawPixels(ctx, def, scale);
    }
  });
}

/** Franja diagonal a 45° (estilo cinta de precaución). `period` = largo del patrón en el eje de repetición. */
function diagonalStripes(scene: Phaser.Scene, key: string, w: number, h: number, period: number, a: string, b: string) {
  canvasTexture(scene, key, w, h, (ctx) => {
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = a;
    // Bandas "\" : se pintan paralelogramos y se repiten en ambos sentidos para que el tile encaje
    for (let k = -Math.ceil((w + h) / period) - 1; k <= Math.ceil((w + h) / period) + 1; k++) {
      const s = k * period;
      ctx.beginPath();
      ctx.moveTo(s, 0);
      ctx.lineTo(s + period / 2, 0);
      ctx.lineTo(s + period / 2 + h, h);
      ctx.lineTo(s + h, h);
      ctx.closePath();
      ctx.fill();
    }
  });
}

function verticalGradient(scene: Phaser.Scene, key: string, stops: [number, string][]) {
  canvasTexture(scene, key, GAME_WIDTH, GAME_HEIGHT, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  });
}

/** Equivalente a `box-shadow: inset 0 0 <size>px rgba(0,0,0,<alpha>)` */
function vignette(scene: Phaser.Scene, key: string, size: number, alpha: number) {
  canvasTexture(scene, key, GAME_WIDTH, GAME_HEIGHT, (ctx) => {
    const W = GAME_WIDTH, H = GAME_HEIGHT, s = size / 2;
    const edge = (x0: number, y0: number, x1: number, y1: number) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(0,0,0,${alpha})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      return g;
    };
    ctx.fillStyle = edge(0, 0, 0, s); ctx.fillRect(0, 0, W, s);
    ctx.fillStyle = edge(0, H, 0, H - s); ctx.fillRect(0, H - s, W, s);
    ctx.fillStyle = edge(0, 0, s, 0); ctx.fillRect(0, 0, s, H);
    ctx.fillStyle = edge(W, 0, W - s, 0); ctx.fillRect(W - s, 0, s, H);
  });
}

/** Genera (una sola vez) todas las texturas. Se puede llamar desde cualquier escena. */
export function ensureTextures(scene: Phaser.Scene) {
  // Fondos
  verticalGradient(scene, "bg-menu", [[0, "#1a0a2e"], [0.4, "#16081f"], [1, "#0a0a12"]]);
  verticalGradient(scene, "bg-game", [[0, "#2a1a3d"], [0.6, "#1a1028"], [1, "#0a0a12"]]);
  canvasTexture(scene, "bg-gameover", GAME_WIDTH, GAME_HEIGHT, (ctx) => {
    const lg = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    lg.addColorStop(0, "#1a0a12");
    lg.addColorStop(1, "#0a0a12");
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    // radial-gradient(ellipse at center, rgba(216,32,47,.25) 0%, transparent 60%)
    const rx = (GAME_WIDTH / 2) * Math.SQRT2;
    const ry = (GAME_HEIGHT / 2) * Math.SQRT2;
    ctx.save();
    ctx.translate(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    ctx.scale(1, ry / rx);
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    rg.addColorStop(0, "rgba(216,32,47,0.25)");
    rg.addColorStop(0.6, "rgba(216,32,47,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  });
  vignette(scene, "vignette-soft", 60, 0.6);
  vignette(scene, "vignette-strong", 80, 0.7);

  // Sol synthwave (160px + margen para el glow)
  canvasTexture(scene, "sun", 300, 300, (ctx) => {
    const c = 150, r = 80;
    ctx.save();
    ctx.shadowColor = "rgba(255,205,17,0.4)";
    ctx.shadowBlur = 60;
    ctx.fillStyle = CSS.orange;
    ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.clip();
    const g = ctx.createLinearGradient(0, c - r, 0, c + r);
    g.addColorStop(0, CSS.yellow);
    g.addColorStop(0.55, CSS.orange);
    g.addColorStop(1, CSS.red);
    ctx.fillStyle = g;
    ctx.fillRect(c - r, c - r, r * 2, r * 2);
    // rayas en el 55% inferior: 5px transparente, 4px color de fondo
    ctx.fillStyle = "#16081f";
    const stripesTop = c + r - r * 2 * 0.55;
    for (let y = stripesTop + 5; y < c + r; y += 9) ctx.fillRect(c - r, y, r * 2, 4);
    ctx.restore();
  });

  // Franjas de precaución y barreras
  diagonalStripes(scene, "caution-yellow", 40, 14, 40, CSS.yellow, CSS.black);
  diagonalStripes(scene, "caution-red", 40, 14, 40, CSS.red, CSS.black);
  diagonalStripes(scene, "barrier", BARRIER_WIDTH, 34, 34, CSS.yellow, CSS.black);

  // Línea discontinua de carril (24px amarillo, 24px vacío)
  canvasTexture(scene, "lane-dash", 4, 48, (ctx) => {
    ctx.fillStyle = CSS.yellow;
    ctx.fillRect(0, 0, 4, 24);
  });

  // Scanlines CRT
  canvasTexture(scene, "scanlines", GAME_WIDTH, GAME_HEIGHT, (ctx) => {
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    for (let y = 0; y < GAME_HEIGHT; y += 3) ctx.fillRect(0, y, GAME_WIDTH, 1);
  });

  // Sprites pixel-art
  pixelSprite(scene, "jeep-menu", SPRITES.jeepMenu, 5.5, { blur: 6, offsetY: 6, alpha: 0.6 });
  pixelSprite(scene, "jeep", SPRITES.jeep, 3, { blur: 4, offsetY: 4, alpha: 0.6 });
  pixelSprite(scene, "rock", SPRITES.rock, 4);
  pixelSprite(scene, "cone", SPRITES.cone, 4);
  pixelSprite(scene, "barrel", SPRITES.barrel, 4);
  pixelSprite(scene, "coin", SPRITES.coin, 3.5);

  // Corazones del HUD
  const heart = (key: string, color: string) =>
    canvasTexture(scene, key, 14, 12, (ctx) => {
      ctx.fillStyle = color;
      HEART_ROWS.forEach((row, y) =>
        [...row].forEach((ch, x) => ch === "X" && ctx.fillRect(x * 2, y * 2, 2, 2))
      );
    });
  heart("heart", CSS.red);
  heart("heart-empty", "#3a3440");
}

/** Fondo degradado amarillo→naranja→amarillo del banner de récord (se genera por tamaño) */
export function recordBannerTexture(scene: Phaser.Scene, w: number, h: number) {
  const key = `record-banner-${Math.round(w)}x${Math.round(h)}`;
  canvasTexture(scene, key, w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, CSS.yellow);
    g.addColorStop(0.5, CSS.orange);
    g.addColorStop(1, CSS.yellow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return key;
}
