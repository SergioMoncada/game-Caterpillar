import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../constants";
import { COLORS, CSS, PIXEL_FONT } from "../theme";
import { ensureTextures, preloadDesignAssets } from "../textures";
import { addCautionStrips, addScreenFrame, arcadeButton, layeredText } from "../ui";

const HORIZON_Y = 230;
const GRID_COLOR = 0x2a0a3d;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HINT_TEXT = "TOCA IZQ / DER PARA MOVERTE";

export default class MenuScene extends Phaser.Scene {
  private emailInputEl!: HTMLInputElement;
  private grid!: Phaser.GameObjects.Graphics;
  private gridOffset = 0;
  private hint!: Phaser.GameObjects.Text;
  private starting = false;

  constructor() {
    super("MenuScene");
  }

  preload() {
    preloadDesignAssets(this);
  }

  create() {
    ensureTextures(this);
    this.starting = false;
    this.gridOffset = 0;

    // Si venimos del juego, liberamos las flechas/espacio para poder escribir en el input
    this.input.keyboard?.clearCaptures();

    // ── Fondo synthwave ──
    this.add.image(0, 0, "bg-menu").setOrigin(0, 0);
    this.add.image(0, 0, "vignette-soft").setOrigin(0, 0);
    this.add.image(GAME_WIDTH / 2, 40 + 80, "sun");
    this.grid = this.add.graphics();
    this.drawHorizon();

    addCautionStrips(this, "caution-yellow");

    // PRUEBA DE DISEÑO: logo CAT (blanco) junto al título, sobre el sol
    this.add.image(GAME_WIDTH / 2, 195, "logo-cat-blanco").setDisplaySize(96, 71).setDepth(3);

    // ── Título con doble sombra + parpadeo ──
    const title = layeredText(
      this, GAME_WIDTH / 2, 262, "CARRO\nCOLECCIONISTA",
      { fontSize: "24px", color: CSS.white, lineSpacing: 12 },
      [{ dx: 3, dy: 3, color: CSS.red }, { dx: 6, dy: 6, color: "rgba(0,0,0,0.4)" }]
    );
    this.startFlicker(title.container);

    const subtitleY = 262 + title.main.height + 10;
    this.add.text(GAME_WIDTH / 2, subtitleY, "◆ EDICIÓN ARCADE ◆", {
      fontFamily: PIXEL_FONT, fontSize: "9px", color: CSS.yellow, letterSpacing: 1,
    }).setOrigin(0.5, 0);

    // ── Input de correo (DOM, estilizado en style.css) ──
    const inputTop = subtitleY + 9 + 40;
    this.emailInputEl = document.createElement("input");
    this.emailInputEl.type = "email";
    this.emailInputEl.className = "arcade-email";
    this.emailInputEl.placeholder = "tu@correo.com";
    this.emailInputEl.autocomplete = "email";
    this.emailInputEl.value = localStorage.getItem("playerEmail") ?? "";
    this.add.dom(GAME_WIDTH / 2, inputTop, this.emailInputEl).setOrigin(0.5, 0);
    this.emailInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") playButton.trigger();
    });
    this.emailInputEl.addEventListener("input", () => this.resetHint());

    // ── Botón JUGAR ──
    const buttonTop = inputTop + 44 + 30;
    const playButton = arcadeButton(
      this, GAME_WIDTH / 2, buttonTop, "▶ JUGAR",
      {
        fontSize: 14, padX: 28, padY: 16,
        fill: COLORS.red, border: COLORS.yellow, textColor: CSS.white,
        depthColor: COLORS.redDark, pulse: true,
      },
      () => this.tryStart()
    );

    this.hint = this.add.text(GAME_WIDTH / 2, buttonTop + playButton.height + 26, HINT_TEXT, {
      fontFamily: PIXEL_FONT, fontSize: "8px", color: CSS.muted,
    }).setOrigin(0.5, 0);

    // ── Zapato rebotando ── (jugador_menu.png: 360px = 120u)
    const jeep = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT - 50 - 45, "jugador-menu").setDisplaySize(120, 120).setDepth(40);
    this.tweens.add({ targets: jeep, y: jeep.y - 3, duration: 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    addScreenFrame(this, COLORS.yellow, "rgba(255,205,17,0.25)");
  }

  update(_time: number, delta: number) {
    // la grilla avanza 40px cada 1.2s, como la animación CSS del mockup
    this.gridOffset = (this.gridOffset + delta / 1200) % 1;
    this.drawGrid();
  }

  private tryStart() {
    if (this.starting) return;
    const email = this.emailInputEl.value.trim().toLowerCase();

    if (!EMAIL_RE.test(email)) {
      this.hint.setText(email ? "ESE CORREO NO ES VÁLIDO" : "ESCRIBE TU CORREO PRIMERO").setColor(CSS.red);
      this.emailInputEl.classList.remove("shake");
      void this.emailInputEl.offsetWidth; // reinicia la animación CSS
      this.emailInputEl.classList.add("shake", "invalid");
      this.emailInputEl.focus();
      return;
    }

    this.starting = true;
    localStorage.setItem("playerEmail", email);
    this.cameras.main.fadeOut(180, 10, 10, 18);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start("GameScene"));
  }

  private resetHint() {
    this.hint.setText(HINT_TEXT).setColor(CSS.muted);
    this.emailInputEl.classList.remove("invalid");
  }

  private startFlicker(target: Phaser.GameObjects.Container) {
    // keyframes: 93% → .6, 94% → 1, 95% → .7, 96% → 1  (ciclo de 3.5s)
    const CYCLE = 3500;
    const step = CYCLE * 0.01;
    this.time.addEvent({
      delay: CYCLE,
      loop: true,
      startAt: CYCLE * 0.07,
      callback: () => {
        target.setAlpha(0.6);
        this.time.delayedCall(step, () => target.setAlpha(1));
        this.time.delayedCall(step * 2, () => target.setAlpha(0.7));
        this.time.delayedCall(step * 3, () => target.setAlpha(1));
      },
    });
  }

  /** Línea de horizonte amarilla con resplandor */
  private drawHorizon() {
    const g = this.add.graphics().setDepth(2);
    [[10, 0.05], [6, 0.1], [3, 0.2]].forEach(([spread, alpha]) => {
      g.fillStyle(COLORS.yellow, alpha).fillRect(0, HORIZON_Y - spread, GAME_WIDTH, 2 + spread * 2);
    });
    g.fillStyle(COLORS.yellow, 1).fillRect(0, HORIZON_Y, GAME_WIDTH, 2);
  }

  /** Piso en perspectiva que avanza hacia el jugador */
  private drawGrid() {
    const g = this.grid;
    const cx = GAME_WIDTH / 2;
    const top = HORIZON_Y + 2;
    const depth = GAME_HEIGHT - top;
    g.clear();
    g.lineStyle(1, GRID_COLOR, 1);

    // líneas que convergen al punto de fuga
    for (let i = -12; i <= 12; i++) {
      g.lineBetween(cx + i * 16, top, cx + i * 96, GAME_HEIGHT);
    }
    // líneas horizontales: más juntas cerca del horizonte
    const ROWS = 12;
    for (let k = 0; k < ROWS; k++) {
      const t = (k + this.gridOffset) / ROWS;
      const y = top + depth * t * t;
      g.lineBetween(0, y, GAME_WIDTH, y);
    }
  }
}
