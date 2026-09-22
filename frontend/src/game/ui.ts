import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "./constants";
import { PIXEL_FONT } from "./theme";
import { playClick } from "./sound";

export interface TextShadow {
  dx: number;
  dy: number;
  color: string;
}

/**
 * Texto con varias sombras duras (como `text-shadow: 3px 3px 0 red, 6px 6px 0 black`).
 * Phaser solo permite una sombra por Text, así que se apilan varias copias en un Container.
 */
export function layeredText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  shadows: TextShadow[] = [],
  origin: [number, number] = [0.5, 0]
) {
  const container = scene.add.container(x, y);
  const base: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: PIXEL_FONT, align: "center", ...style };

  // de la sombra más lejana a la más cercana
  [...shadows].reverse().forEach((s) => {
    const t = scene.add.text(s.dx, s.dy, text, { ...base, color: s.color }).setOrigin(...origin);
    container.add(t);
  });
  const main = scene.add.text(0, 0, text, base).setOrigin(...origin);
  container.add(main);
  return { container, main };
}

/** Marco de 4px de la "pantalla arcade" + glow exterior aplicado al canvas via CSS */
export function addScreenFrame(scene: Phaser.Scene, color: number, glow: string) {
  const g = scene.add.graphics().setDepth(1000);
  g.lineStyle(4, color, 1);
  g.strokeRect(2, 2, GAME_WIDTH - 4, GAME_HEIGHT - 4);
  scene.game.canvas.style.boxShadow = `0 0 40px ${glow}`;
  return g;
}

/** Franjas de precaución arriba y abajo (dentro del marco de 4px) */
export function addCautionStrips(scene: Phaser.Scene, key: "caution-yellow" | "caution-red") {
  const inner = GAME_WIDTH - 8;
  scene.add.tileSprite(4, 4, inner, 14, key).setOrigin(0, 0).setDepth(50);
  scene.add.tileSprite(4, GAME_HEIGHT - 18, inner, 14, key).setOrigin(0, 0).setDepth(50);
}

export function addScanlines(scene: Phaser.Scene) {
  return scene.add.image(0, 0, "scanlines").setOrigin(0, 0).setDepth(900);
}

export interface ArcadeButtonOptions {
  fontSize: number;
  padX: number;
  padY: number;
  fill: number;
  border: number;
  textColor: string;
  depthColor: number; // color del "borde inferior" 3D (box-shadow: 0 6px 0)
  pulse?: boolean;    // animación de brillo
}

/**
 * Botón arcade con relieve: al presionarlo baja 6px y desaparece el borde inferior,
 * igual que `button:active { transform: translateY(6px); box-shadow: none }` del mockup.
 */
export function arcadeButton(
  scene: Phaser.Scene,
  centerX: number,
  topY: number,
  label: string,
  opts: ArcadeButtonOptions,
  onClick: () => void
) {
  const BORDER = 4, DEPTH = 6;
  const text = scene.add.text(0, 0, label, {
    fontFamily: PIXEL_FONT,
    fontSize: `${opts.fontSize}px`,
    color: opts.textColor,
  }).setOrigin(0.5);

  const w = Math.round(text.width + opts.padX * 2 + BORDER * 2);
  const h = Math.round(opts.fontSize * 1.2 + opts.padY * 2 + BORDER * 2);
  const x0 = Math.round(centerX - w / 2);

  const shadow = scene.add.rectangle(x0, topY + DEPTH, w, h, opts.depthColor).setOrigin(0, 0);
  const face = scene.add.container(x0, topY);
  const bg = scene.add.graphics();
  bg.fillStyle(opts.border, 1).fillRect(0, 0, w, h);
  bg.fillStyle(opts.fill, 1).fillRect(BORDER, BORDER, w - BORDER * 2, h - BORDER * 2);
  text.setPosition(w / 2, h / 2);
  const shine = scene.add.rectangle(0, 0, w, h, 0xffffff, 0).setOrigin(0, 0);
  face.add([bg, text, shine]);

  if (opts.pulse) {
    scene.tweens.add({ targets: shine, fillAlpha: 0.12, duration: 800, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  let pressed = false;
  const setPressed = (p: boolean) => {
    pressed = p;
    face.y = topY + (p ? DEPTH : 0);
    shadow.setVisible(!p);
  };

  const zone = scene.add.zone(x0, topY, w, h + DEPTH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
  zone.on("pointerdown", () => {
    setPressed(true);
    playClick(scene);
  });
  zone.on("pointerout", () => setPressed(false));
  zone.on("pointerup", () => {
    if (!pressed) return;
    setPressed(false);
    onClick();
  });

  /** Simula un click (para ENTER / ESPACIO): baja, espera y dispara */
  const trigger = () => {
    setPressed(true);
    playClick(scene);
    scene.time.delayedCall(90, () => {
      setPressed(false);
      onClick();
    });
  };

  return { face, shadow, zone, text, width: w, height: h + DEPTH, trigger };
}

/** Aviso legal que acompaña al logo entregado en `Logo_game_over` (transcrito del asset) */
const LEGAL_NOTICE = [
  "© 2026 Caterpillar. All Rights Reserved.",
  
  "CAT, CATERPILLAR, LET'S DO THE WORK,",
  'their respective logos, "Caterpillar Corporate Yellow",',
  'the "Power Edge" and Cat "Modern Hex" trade dress',
  "as well as corporate and product identity used herein,",
  "are trademarks of Caterpillar and",
  "may not be used without permission.",
].join("\n");

/**
 * Logo CAT + aviso legal, anclados por su borde inferior a `bottomY`.
 * El texto NO se recorta del JPEG (allí mide 4px por línea y es ilegible): se redibuja
 * con una sans del sistema para que se lea a cualquier escala del canvas.
 */
export function catLegalFooter(scene: Phaser.Scene, bottomY: number, logoWidth = 168, credit?: string) {
  const GAP = 10;

  // Crédito opcional (p. ej. la música) en la última línea, más tenue que el aviso de marca
  const creditText = credit
    ? scene.add.text(GAME_WIDTH / 2, bottomY, credit, {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "10px",
        color: "#c9b8e8",
        align: "center",
        wordWrap: { width: GAME_WIDTH - 60 },
      }).setOrigin(0.5, 1)
    : null;
  const creditH = creditText ? creditText.height + 6 : 0;

  const legal = scene.add.text(GAME_WIDTH / 2, bottomY - creditH, LEGAL_NOTICE, {
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "11px",
    color: "#ffffff",
    align: "center",
    lineSpacing: 3,
  }).setOrigin(0.5, 1);

  const logoTex = scene.textures.get("logo-game-over").getSourceImage();
  const logoH = Math.round(logoWidth * (logoTex.height / logoTex.width));
  const logo = scene.add.image(GAME_WIDTH / 2, bottomY - creditH - legal.height - GAP, "logo-game-over")
    .setOrigin(0.5, 1)
    .setDisplaySize(logoWidth, logoH);

  const height = logoH + GAP + legal.height + creditH;
  return { logo, legal, creditText, height, top: bottomY - height };
}

/** Panel con borde sólido y fondo semitransparente */
export function borderedPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  border: number,
  borderColor: number,
  fill: number,
  fillAlpha: number
) {
  const g = scene.add.graphics();
  g.fillStyle(fill, fillAlpha).fillRect(x, y, w, h);
  g.lineStyle(border, borderColor, 1).strokeRect(x + border / 2, y + border / 2, w - border, h - border);
  return g;
}

