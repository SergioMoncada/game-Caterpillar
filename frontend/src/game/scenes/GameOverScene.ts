import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../constants";
import { COLORS, CSS, PIXEL_FONT } from "../theme";
import { ensureTextures, recordBannerTexture } from "../textures";
import { addCautionStrips, addScreenFrame, arcadeButton, borderedPanel, catLegalFooter, layeredText } from "../ui";
import type { GameOverData } from "./GameScene";

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super("GameOverScene");
  }

  private leaving = false;

  create(data: Partial<GameOverData>) {
    ensureTextures(this);
    this.leaving = false;

    const score = data.score ?? 0;
    const coins = data.coins ?? 0;
    const previousBest = data.previousBest ?? 0;
    const result = data.result ?? { status: "error" as const };
    const isRecord = result.status === "ok" && score > previousBest;

    this.add.image(0, 0, "bg-gameover").setOrigin(0, 0);
    this.add.image(0, 0, "vignette-strong").setOrigin(0, 0);
    addCautionStrips(this, "caution-red");

    const cx = GAME_WIDTH / 2;

    // ── Logo CAT + aviso legal, pegados al borde inferior (sobre la franja de precaución) ──
    // Se construye primero: el resto del layout se reparte en el espacio que queda arriba.
    catLegalFooter(this, GAME_HEIGHT - 26);

    let y = 64;

    // ── GAME OVER con glitch ──
    const title = layeredText(
      this, cx, y, "GAME\nOVER",
      { fontSize: "30px", color: CSS.white, lineSpacing: 6 },
      [{ dx: 4, dy: 4, color: CSS.red }, { dx: 8, dy: 8, color: "rgba(0,0,0,0.5)" }]
    );
    this.startGlitch(title.container);
    y += title.main.height + 20;

    // ── Panel de estadísticas ──
    const LINE = 12 * 2.4;
    const scoreLine = this.add.text(0, 0, `SCORE: ${score}`, { fontFamily: PIXEL_FONT, fontSize: "12px", color: CSS.white }).setOrigin(0.5);
    const coinsLabel = this.add.text(0, 0, "CATCOINS: ", { fontFamily: PIXEL_FONT, fontSize: "12px", color: CSS.white }).setOrigin(0, 0.5);
    const coinsValue = this.add.text(0, 0, String(coins), { fontFamily: PIXEL_FONT, fontSize: "12px", color: CSS.yellow }).setOrigin(0, 0.5);

    const contentW = Math.max(scoreLine.width, coinsLabel.width + coinsValue.width);
    const panelW = Math.round(contentW + 26 * 2 + 6);
    const panelH = Math.round(LINE * 2 + 18 * 2 + 6);
    borderedPanel(this, Math.round(cx - panelW / 2), y, panelW, panelH, 3, COLORS.yellow, 0x000000, 0.5);

    const line1 = y + 3 + 18 + LINE / 2;
    scoreLine.setPosition(cx, line1).setDepth(1);
    const coinsX = cx - (coinsLabel.width + coinsValue.width) / 2;
    coinsLabel.setPosition(coinsX, line1 + LINE).setDepth(1);
    coinsValue.setPosition(coinsX + coinsLabel.width, line1 + LINE).setDepth(1);
    y += panelH + 14;

    // ── Récord / estado del guardado ──
    if (isRecord) {
      const label = this.add.text(0, 0, "★ ¡NUEVO RÉCORD! ★", { fontFamily: PIXEL_FONT, fontSize: "13px", color: CSS.black }).setOrigin(0.5);
      const w = Math.round(label.width + 40 + 6);
      const h = Math.round(13 * 1.2 + 20 + 6);
      const banner = this.add.container(cx, y + h / 2);
      const frame = this.add.graphics();
      frame.lineStyle(3, COLORS.black, 1).strokeRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3);
      const shine = this.add.rectangle(0, 0, w, h, 0xffffff, 0);
      banner.add([this.add.image(0, 0, recordBannerTexture(this, w, h)), shine, frame, label]);
      this.tweens.add({ targets: shine, fillAlpha: 0.25, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      y += h + 16;
    } else if (result.status !== "ok") {
      const prefix = result.status === "rejected" ? "PUNTAJE RECHAZADO" : "SIN CONEXIÓN";
      const msg = this.add.text(cx, y, `${prefix}:\n${(result.reason ?? "no se guardó el puntaje").toUpperCase()}`, {
        fontFamily: PIXEL_FONT, fontSize: "8px", color: CSS.red, align: "center",
        lineSpacing: 6, wordWrap: { width: GAME_WIDTH - 80, useAdvancedWrap: true },
      }).setOrigin(0.5, 0);
      y += msg.height + 16;
    } else {
      y += 2;
    }

    // ── Botón reintentar ──
    const retry = arcadeButton(
      this, cx, y, "↻ JUGAR DE NUEVO",
      {
        fontSize: 13, padX: 24, padY: 16,
        fill: COLORS.asphalt, border: COLORS.yellow, textColor: CSS.yellow,
        depthColor: COLORS.yellowDark,
      },
      () => this.leaveTo("GameScene")
    );
    y += retry.height + 10;

    this.add.text(cx, y, `MEJOR PUNTAJE ANTERIOR: ${previousBest}`, {
      fontFamily: PIXEL_FONT, fontSize: "9px", color: CSS.muted,
    }).setOrigin(0.5, 0);
    y += 9 + 14;

    // Volver al menú (para cambiar de correo)
    const menuLink = this.add.text(cx, y, "◂ MENÚ PRINCIPAL", {
      fontFamily: PIXEL_FONT, fontSize: "8px", color: CSS.muted,
    }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
    menuLink.on("pointerover", () => menuLink.setColor(CSS.yellow));
    menuLink.on("pointerout", () => menuLink.setColor(CSS.muted));
    menuLink.on("pointerup", () => this.leaveTo("MenuScene"));

    // ENTER / ESPACIO = jugar de nuevo
    const keyboard = this.input.keyboard;
    keyboard?.once("keydown-ENTER", () => retry.trigger());
    keyboard?.once("keydown-SPACE", () => retry.trigger());

    addScreenFrame(this, COLORS.red, "rgba(216,32,47,0.35)");
  }

  /** Evita arrancar dos veces la siguiente escena (click + tecla al mismo tiempo) */
  private leaveTo(sceneKey: "GameScene" | "MenuScene") {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(sceneKey);
  }

  private startGlitch(target: Phaser.GameObjects.Container) {
    // keyframes: 89% (-2,1) .8 · 90% (2,-1) 1 · 91% (-1,0) .9 · 92% reset  (ciclo de 2.4s)
    const CYCLE = 2400;
    const step = CYCLE * 0.01;
    const baseX = target.x, baseY = target.y;
    const frames: [number, number, number][] = [[-2, 1, 0.8], [2, -1, 1], [-1, 0, 0.9], [0, 0, 1]];
    this.time.addEvent({
      delay: CYCLE,
      loop: true,
      startAt: CYCLE * 0.11,
      callback: () => {
        frames.forEach(([dx, dy, a], i) =>
          this.time.delayedCall(step * i, () => target.setPosition(baseX + dx, baseY + dy).setAlpha(a))
        );
      },
    });
  }
}
