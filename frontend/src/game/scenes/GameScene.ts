import Phaser from "phaser";
import {
  GAME_WIDTH, GAME_HEIGHT, CAR_START_SPEED, SPEED_INCREASE_PER_SEC,
  STARTING_LIVES, COIN_SPAWN_INTERVAL, POINTS_PER_COIN,
  OBSTACLE_SPAWN_INTERVAL_START, OBSTACLE_SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_DECAY_PER_SEC,
  LEVELS, LANE_COUNT, LANE_CHANGE_DURATION,
  BARRIER_WIDTH, ROAD_LEFT, ROAD_RIGHT, ROAD_WIDTH, PLAYER_Y,
} from "../constants";
import { COLORS, CSS, PIXEL_FONT, hex } from "../theme";
import { ensureTextures, OBSTACLE_KEYS, preloadDesignAssets, recordBannerTexture } from "../textures";
import { addScanlines, addScreenFrame, borderedPanel } from "../ui";
import { startSession, submitResult, type SubmitResult } from "../../api/scores";
import { restartMusic, musicToggle } from "../music";
import { playCoin, playHit } from "../sound";

const OBSTACLE_TOP_ZONE_Y = 200;
const DESPAWN_Y = GAME_HEIGHT + 60;

type ArcadeImage = Phaser.Types.Physics.Arcade.ImageWithDynamicBody;

// Tamaños en juego según la spec (u); las texturas vienen a 3x
const PLAYER_SIZE = 106; // ~78% del ancho de un carril (400 / 3 ≈ 133px)
const OBSTACLE_SIZE = 64;
const COIN_SIZE = 32;
const TEX_SCALE = 3;
/** La spec pide que la parte sólida ocupe >= 70% de la caja: el choque usa ese cuadrado centrado */
const OBSTACLE_HITBOX_RATIO = 0.7;

// ── Escenario superior (spec 5.4 y 6) ──
// Todo en colores planos: el cielo es el color de la ciudad rebajado con la noche para que no queme,
// y la silueta va en blanco, que es lo que la hace legible sobre cualquiera de las ocho paletas.
const SKY_DEPTH = 25;       // sobre obstáculos (10) y paredes (20), bajo el jugador (30) y el HUD (100)
const HAZE_DEPTH = 24;      // la neblina tapa la salida de los obstáculos en el horizonte
const NIGHT = 0x160d22;
const SKY_TINT = 0.62;      // cuánto color de la ciudad entra al cielo; el resto es noche, que le baja la luz
const SILHOUETTE_COLOR = 0xffffff;
const SILHOUETTE_ALPHA = 1;
const FLASH_MIX = 0.3;      // fuerza del destello con el color de la ciudad al cambiar de escenario
/** Bandas planas escalonadas bajo el horizonte: [alto en u, opacidad] */
const HAZE_BANDS: [number, number][] = [[6, 0.85], [8, 0.55], [12, 0.25]];
const APPROACH_FROM = 0.8;  // escala relativa de la silueta al empezar el nivel ("lejos")
const APPROACH_TO = 1.15;   // escala al llegar
const LEVEL_DURATION_MS = 10000;

/** Mezcla lineal de dos colores 0xRRGGBB */
function mixColor(a: number, b: number, t: number) {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
const hexToInt = (h: string) => parseInt(h.replace("#", ""), 16);
const skyColorOf = (i: number) => mixColor(NIGHT, hexToInt(LEVELS[i].skyTop), SKY_TINT);

export interface GameOverData {
  score: number;
  coins: number;
  previousBest: number;
  result: SubmitResult;
}

export default class GameScene extends Phaser.Scene {
  private car!: ArcadeImage;
  private obstacles!: Phaser.Physics.Arcade.Group;
  private coins!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;

  private road!: Phaser.GameObjects.Rectangle;
  private laneDividers: Phaser.GameObjects.TileSprite[] = [];
  private barriers: Phaser.GameObjects.TileSprite[] = [];
  private sky!: Phaser.GameObjects.Rectangle;
  private haze: Phaser.GameObjects.Rectangle[] = [];
  private horizonLine!: Phaser.GameObjects.Rectangle;
  private skyline!: Phaser.GameObjects.Image;
  private skylineTween?: Phaser.Tweens.Tween;
  private skyColor = NIGHT;

  private laneX: number[] = [];
  private currentLane = 1;
  private isChangingLane = false;
  private currentLevelIndex = 0;

  private lives = STARTING_LIVES;
  private coinsCollected = 0;
  private score = 0;
  private currentSpeed = CAR_START_SPEED;
  private elapsedMs = 0;
  private sessionId: number | null = null;

  private previousBest = 0;
  private recordAnnounced = false;
  private isRunning = false;   // true cuando ya tenemos sesión y arrancó el spawn
  private isGameOver = false;

  // HUD
  private hearts: Phaser.GameObjects.Image[] = [];
  private coinsValue!: Phaser.GameObjects.Text;
  private coinsLabel!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private banners: Partial<Record<"level" | "record", Phaser.GameObjects.Container>> = {};

  constructor() {
    super("GameScene");
  }

  /** Se ejecuta SIEMPRE antes de create(), incluso al reiniciar la misma escena. Resetea todo el estado de la partida. */
  init() {
    this.lives = STARTING_LIVES;
    this.coinsCollected = 0;
    this.score = 0;
    this.currentSpeed = CAR_START_SPEED;
    this.elapsedMs = 0;
    this.sessionId = null;
    this.currentLevelIndex = 0;
    this.currentLane = Math.floor(LANE_COUNT / 2);
    this.isChangingLane = false;
    this.recordAnnounced = false;
    this.previousBest = 0; // se actualiza con el valor real del backend antes de que arranque el spawn
    this.isRunning = false;
    this.isGameOver = false;
    this.hearts = [];
    this.laneDividers = [];
    this.barriers = [];
    this.banners = {};
    this.haze = [];
  }

  preload() {
    preloadDesignAssets(this);
  }

  async create() {
    ensureTextures(this);

    const laneWidth = ROAD_WIDTH / LANE_COUNT;
    this.laneX = Array.from({ length: LANE_COUNT }, (_, i) => ROAD_LEFT + laneWidth * i + laneWidth / 2);

    this.buildTrack(laneWidth);

    // ── Zapato del jugador ── (216px de textura; el zapato ocupa ~x 3-213, y 50-167)
    this.car = this.physics.add.image(this.laneX[this.currentLane], PLAYER_Y, "jugador")
      .setDisplaySize(PLAYER_SIZE, PLAYER_SIZE)
      .setDepth(30);
    this.car.body.setSize(180, 100).setOffset(18, 58);
    this.car.body.setAllowGravity(false);

    this.obstacles = this.physics.add.group();
    this.coins = this.physics.add.group();

    // ── Controles: flechas, A/D o tocar mitad izquierda/derecha ──
    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    // Un toque sobre un botón (p. ej. el de música) no mueve el carro
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.isRunning && over.length === 0) this.moveLane(pointer.x < GAME_WIDTH / 2 ? -1 : 1);
    });

    this.buildHud();
    restartMusic(this); // cada partida arranca la pista desde el principio
    musicToggle(this, GAME_WIDTH - 52, 46); // bajo CATCOINS / SCORE
    addScanlines(this);
    addScreenFrame(this, COLORS.yellow, "rgba(255,205,17,0.25)");

    this.physics.add.overlap(this.car, this.obstacles, this.onHitObstacle as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.car, this.coins, this.onCollectCoin as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);

    const connecting = this.add.text(GAME_WIDTH / 2, 300, "CONECTANDO...", {
      fontFamily: PIXEL_FONT, fontSize: "10px", color: CSS.white,
    }).setOrigin(0.5).setDepth(60).setVisible(false); // solo si el jugador toca antes de que responda el servidor

    // IMPORTANTE: esperamos la sesión y el récord real del backend ANTES de dejar que el juego
    // empiece a generar monedas/obstáculos, para que la comparación de récord sea correcta desde el inicio.
    // Mientras tanto se muestran los controles; la partida arranca cuando hay sesión Y el jugador tocó.
    const session = (async () => {
      try {
        const email = localStorage.getItem("playerEmail") ?? "invitado@test.com";
        const res = await startSession(email);
        this.sessionId = res.session_id ?? null;
        this.previousBest = res.best_score ?? 0;
      } catch (err) {
        console.error("No se pudo iniciar sesión de juego", err);
        this.sessionId = null;
        this.previousBest = 0;
      }
    })();
    await Promise.all([session, this.showControlsHint().then(() => connecting.setVisible(true))]);

    // La escena pudo cerrarse mientras esperábamos al servidor
    if (!this.sys.isActive()) return;
    connecting.destroy();

    // Los timers de spawn arrancan DESPUÉS de tener el récord real
    this.isRunning = true;
    this.announceCity(0);
    this.time.addEvent({ delay: COIN_SPAWN_INTERVAL, loop: true, callback: this.spawnCoin, callbackScope: this });
    this.scheduleNextObstacle();
  }

  update(_time: number, delta: number) {
    if (this.isGameOver) return;

    // JustDown se lee siempre para consumir la tecla: así una pulsación durante las instrucciones no mueve el carro al arrancar
    const left = Phaser.Input.Keyboard.JustDown(this.cursors.left!) || Phaser.Input.Keyboard.JustDown(this.keyA);
    const right = Phaser.Input.Keyboard.JustDown(this.cursors.right!) || Phaser.Input.Keyboard.JustDown(this.keyD);
    if (this.isRunning && left) this.moveLane(-1);
    if (this.isRunning && right) this.moveLane(1);

    // La pista se mueve siempre (también mientras conecta), pero la dificultad solo corre con la partida
    const dt = delta / 1000;
    if (this.isRunning) {
      this.elapsedMs += delta;
      this.currentSpeed = CAR_START_SPEED + (this.elapsedMs / 1000) * SPEED_INCREASE_PER_SEC;
    }
    this.laneDividers.forEach((d) => (d.tilePositionY -= this.currentSpeed * dt));
    // tilePosition va en px de textura (3x): se compensa la escala para que la pared vaya a la velocidad de la pista
    this.barriers.forEach((b) => (b.tilePositionY -= this.currentSpeed * dt * TEX_SCALE));

    // Las ciudades se recorren en bucle, una cada LEVEL_DURATION_MS: al pasar la última se vuelve a la primera
    if (this.isRunning) {
      const city = Math.floor(this.elapsedMs / LEVEL_DURATION_MS) % LEVELS.length;
      if (city !== this.currentLevelIndex) {
        this.currentLevelIndex = city;
        this.road.setFillStyle(LEVELS[city].roadColor);
        this.arriveAtCity(city);
      }
    }

    this.obstacles.getChildren().forEach((obj) => {
      const o = obj as ArcadeImage;
      o.body.setVelocityY(this.currentSpeed);
      if (o.y > DESPAWN_Y) o.destroy();
    });
    this.coins.getChildren().forEach((obj) => {
      const c = obj as ArcadeImage;
      c.body.setVelocityY(this.currentSpeed);
      if (c.y > DESPAWN_Y) c.destroy();
    });
  }

  // ───────────────────────── Instrucciones ─────────────────────────

  /**
   * Antes de cada partida: cada mitad de la pista muestra hacia dónde mueve el carro.
   * Se cierra con el primer toque, click o tecla; ese toque solo arranca, no mueve el carro.
   */
  private showControlsHint(): Promise<void> {
    const touch = this.sys.game.device.input.touch;
    const top = OBSTACLE_TOP_ZONE_Y;
    const midY = Math.round((top + PLAYER_Y) / 2);
    const text = (x: number, y: number, s: string, size: number, color: string) =>
      this.add.text(x, y, s, {
        fontFamily: PIXEL_FONT, fontSize: `${size}px`, color, align: "center",
        shadow: { offsetX: 2, offsetY: 2, color: CSS.black, fill: true },
      }).setOrigin(0.5);

    const overlay = this.add.container(0, 0).setDepth(200);
    overlay.add(this.add.rectangle(0, top, GAME_WIDTH, GAME_HEIGHT - top, COLORS.night, 0.65).setOrigin(0, 0));

    // Divisor punteado: marca la frontera entre las dos zonas de toque
    const divider = this.add.graphics();
    divider.fillStyle(COLORS.yellow, 0.6);
    for (let y = top + 70; y < GAME_HEIGHT - 30; y += 24) divider.fillRect(GAME_WIDTH / 2 - 1, y, 2, 12);
    overlay.add(divider);

    overlay.add(text(GAME_WIDTH / 2, top + 36, "CÓMO JUGAR", 16, CSS.yellow));

    const sides: [dir: -1 | 1, label: string, key: string][] = [[-1, "IZQUIERDA", "A"], [1, "DERECHA", "D"]];
    for (const [dir, label, key] of sides) {
      const cx = GAME_WIDTH / 2 + dir * (GAME_WIDTH / 4);

      // Flecha pixel con sombra dura roja, apuntando hacia su lado
      const arrow = this.add.graphics();
      const tri = (dx: number, dy: number, color: number) => {
        arrow.fillStyle(color, 1);
        arrow.fillTriangle(dir * 26 + dx, dy, -dir * 14 + dx, -30 + dy, -dir * 14 + dx, 30 + dy);
        arrow.fillRect(-dir * 14 - (dir > 0 ? 22 : 0) + dx, -10 + dy, 22, 20);
      };
      tri(4, 4, COLORS.red);
      tri(0, 0, COLORS.yellow);
      arrow.setPosition(cx, midY - 40);
      overlay.add(arrow);
      this.tweens.add({ targets: arrow, x: cx + dir * 10, duration: 450, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

      overlay.add(text(cx, midY + 20, touch ? "TOCA AQUÍ" : `TECLA ${key}`, 12, CSS.white));
      overlay.add(text(cx, midY + 44, `PARA IR A LA\n${label}`, 8, CSS.yellow).setLineSpacing(6));
    }

    const start = text(GAME_WIDTH / 2, midY + 130, touch ? "TOCA PARA EMPEZAR" : "CLICK O TECLA PARA EMPEZAR", 10, CSS.orange);
    overlay.add(start);
    this.tweens.add({ targets: start, alpha: 0.2, duration: 500, yoyo: true, repeat: -1, ease: "Stepped" });

    return new Promise((resolve) => {
      let done = false;
      const close = (_pointer?: unknown, over?: Phaser.GameObjects.GameObject[]) => {
        if (done || over?.length) return; // tocar el botón de música no cierra las instrucciones
        done = true;
        this.input.off("pointerdown", close);
        this.input.keyboard?.off("keydown", close);
        this.tweens.add({ targets: overlay, alpha: 0, duration: 150, onComplete: () => overlay.destroy(true) });
        resolve();
      };
      this.input.on("pointerdown", close);
      this.input.keyboard?.on("keydown", close);
    });
  }

  // ───────────────────────── Construcción de la escena ─────────────────────────

  private buildTrack(laneWidth: number) {
    this.add.image(0, 0, "bg-game").setOrigin(0, 0);
    this.road = this.add.rectangle(ROAD_LEFT, 0, ROAD_WIDTH, GAME_HEIGHT, LEVELS[0].roadColor).setOrigin(0, 0);

    for (let i = 1; i < LANE_COUNT; i++) {
      const x = ROAD_LEFT + laneWidth * i;
      this.laneDividers.push(this.add.tileSprite(Math.round(x) - 2, 0, 4, GAME_HEIGHT, "lane-dash").setOrigin(0, 0));
    }

    // Paredes laterales: el tile (120x402) va reflejado en vertical, así que el scroll no muestra costura
    for (const x of [0, ROAD_RIGHT]) {
      this.barriers.push(
        this.add.tileSprite(x, 0, BARRIER_WIDTH, GAME_HEIGHT, "pared").setOrigin(0, 0).setTileScale(1 / TEX_SCALE).setDepth(20)
      );
    }

    this.buildSkyline();
  }

  /** Franja superior de 200u: cielo plano, silueta de la ciudad y neblina escalonada que la une con la carretera */
  private buildSkyline() {
    this.skyColor = skyColorOf(0);
    this.sky = this.add.rectangle(0, 0, GAME_WIDTH, OBSTACLE_TOP_ZONE_Y, this.skyColor).setOrigin(0, 0).setDepth(SKY_DEPTH);
    this.skyline = this.add.image(GAME_WIDTH / 2, OBSTACLE_TOP_ZONE_Y, LEVELS[0].skyline)
      .setOrigin(0.5, 1)
      .setTint(SILHOUETTE_COLOR)
      .setAlpha(SILHOUETTE_ALPHA)
      .setDepth(SKY_DEPTH);

    let y = OBSTACLE_TOP_ZONE_Y;
    for (const [h, alpha] of HAZE_BANDS) {
      this.haze.push(this.add.rectangle(0, y, GAME_WIDTH, h, this.skyColor, alpha).setOrigin(0, 0).setDepth(HAZE_DEPTH));
      y += h;
    }
    this.horizonLine = this.add.rectangle(0, OBSTACLE_TOP_ZONE_Y - 1, GAME_WIDTH, 2, SILHOUETTE_COLOR, 0.35)
      .setOrigin(0, 0)
      .setDepth(SKY_DEPTH);
    this.approach(APPROACH_FROM);
  }

  /** La ciudad crece durante el nivel: "nos acercamos" */
  private approach(from: number) {
    const base = GAME_WIDTH / this.skyline.width;
    this.skylineTween?.remove();
    this.skyline.setScale(base * from);
    this.skylineTween = this.tweens.add({
      targets: this.skyline, scale: base * APPROACH_TO, duration: LEVEL_DURATION_MS, ease: "Sine.easeIn",
    });
  }

  /** Paso de nivel en una sola animación: la ciudad actual pasa de largo, destello, cambia el cielo y aparece la siguiente a lo lejos */
  private arriveAtCity(index: number) {
    // 1. La ciudad que dejamos atrás se agranda y se desvanece
    const leaving = this.add.image(this.skyline.x, this.skyline.y, this.skyline.texture.key)
      .setOrigin(0.5, 1)
      .setScale(this.skyline.scale)
      .setTint(this.skyline.tintTopLeft)
      .setAlpha(this.skyline.alpha)
      .setDepth(SKY_DEPTH);
    this.tweens.add({
      targets: leaving, scale: this.skyline.scale * 1.6, alpha: 0, duration: 700, ease: "Quad.easeIn",
      onComplete: () => leaving.destroy(),
    });

    // 2. Destello plano del color de la nueva ciudad y cambio de cielo
    const to = skyColorOf(index);
    const flash = mixColor(this.skyColor, LEVELS[index].skylineColor, FLASH_MIX);
    this.paintSky(flash);
    this.tweens.addCounter({
      from: 0, to: 1, delay: 120, duration: 700,
      onUpdate: (tw) => this.paintSky(mixColor(flash, to, tw.getValue() ?? 1)),
      onComplete: () => this.paintSky(to),
    });
    this.skyColor = to;
    this.horizonLine.setFillStyle(SILHOUETTE_COLOR, 0.35);

    // 3. La nueva ciudad aparece más lejos de lo normal y empieza a acercarse
    this.skyline.setTexture(LEVELS[index].skyline).setTint(SILHOUETTE_COLOR).setAlpha(0);
    this.approach(APPROACH_FROM * 0.75);
    this.tweens.add({ targets: this.skyline, alpha: SILHOUETTE_ALPHA, duration: 600, delay: 300 });

    this.announceCity(index);
  }

  private paintSky(color: number) {
    this.sky.setFillStyle(color);
    this.haze.forEach((band) => band.setFillStyle(color, band.fillAlpha));
  }

  /** Nombre de la ciudad sobre el horizonte, en su color (reemplaza el banner en caja que tapaba la silueta) */
  private announceCity(index: number) {
    const level = LEVELS[index];
    this.banners.level?.destroy();
    const label = this.add.text(GAME_WIDTH / 2, OBSTACLE_TOP_ZONE_Y + 18, level.city.toUpperCase(), {
      fontFamily: PIXEL_FONT,
      fontSize: "11px",
      color: hex(SILHOUETTE_COLOR),
      shadow: { offsetX: 2, offsetY: 2, color: hex(skyColorOf(index)), blur: 0, fill: true },
    }).setOrigin(0.5, 0);
    const container = this.add.container(0, 0, [label]).setDepth(SKY_DEPTH + 1).setAlpha(0);
    this.banners.level = container;
    this.tweens.add({
      targets: container, alpha: 1, y: { from: -6, to: 0 }, duration: 350, delay: 250, yoyo: true, hold: 1800,
      onComplete: () => {
        container.destroy();
        if (this.banners.level === container) delete this.banners.level;
      },
    });
  }

  private buildHud() {
    const HUD_DEPTH = 100;
    const left = 52, right = GAME_WIDTH - 52, top = 12;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: PIXEL_FONT,
      fontSize: "10px",
      color: CSS.white,
      shadow: { offsetX: 2, offsetY: 2, color: "#000", blur: 0, fill: true },
    };

    for (let i = 0; i < STARTING_LIVES; i++) {
      this.hearts.push(this.add.image(left + i * 16, top, "heart").setOrigin(0, 0).setDepth(HUD_DEPTH));
    }

    this.coinsValue = this.add.text(right, top, "0", { ...style, color: CSS.yellow }).setOrigin(1, 0).setDepth(HUD_DEPTH);
    this.coinsLabel = this.add.text(right, top, "CATCOINS: ", style).setOrigin(1, 0).setDepth(HUD_DEPTH);
    this.scoreText = this.add.text(right, top + 16, "SCORE: 0", style).setOrigin(1, 0).setDepth(HUD_DEPTH);
    this.refreshHud();
  }

  private refreshHud() {
    this.hearts.forEach((h, i) => h.setTexture(i < this.lives ? "heart" : "heart-empty"));
    this.coinsValue.setText(String(this.coinsCollected));
    this.coinsLabel.setX(this.coinsValue.x - this.coinsValue.width);
    this.scoreText.setText(`SCORE: ${this.score}`);
  }

  /** Banner reutilizable: "level" = caja negra con borde amarillo, "record" = degradado amarillo/naranja */
  private showBanner(text: string, variant: "level" | "record") {
    this.banners[variant]?.destroy();

    const isRecord = variant === "record";
    const fontSize = 13;
    const padX = isRecord ? 20 : 18;
    const padY = 10;
    const border = 3;

    const label = this.add.text(0, 0, text, {
      fontFamily: PIXEL_FONT,
      fontSize: `${fontSize}px`,
      color: isRecord ? CSS.black : CSS.white,
    }).setOrigin(0.5);

    const w = Math.round(label.width + padX * 2 + border * 2);
    const h = Math.round(fontSize * 1.2 + padY * 2 + border * 2);
    const container = this.add.container(GAME_WIDTH / 2, (isRecord ? 230 : 150) + h / 2).setDepth(80).setAlpha(0);

    if (isRecord) {
      const bg = this.add.image(0, 0, recordBannerTexture(this, w, h));
      const frame = this.add.graphics();
      frame.lineStyle(border, COLORS.black, 1).strokeRect(-w / 2 + border / 2, -h / 2 + border / 2, w - border, h - border);
      container.add([bg, frame, label]);
    } else {
      container.add([borderedPanel(this, -w / 2, -h / 2, w, h, border, COLORS.yellow, 0x000000, 0.75), label]);
    }

    this.banners[variant] = container;
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 250,
      yoyo: true,
      hold: 1600,
      onComplete: () => {
        container.destroy();
        if (this.banners[variant] === container) delete this.banners[variant];
      },
    });
    if (isRecord) {
      this.tweens.add({ targets: container, scale: { from: 0.8, to: 1 }, duration: 250, ease: "Back.easeOut" });
    }
  }

  // ───────────────────────── Lógica de juego ─────────────────────────

  private moveLane(direction: -1 | 1) {
    if (this.isChangingLane || this.isGameOver) return;

    const targetLane = Phaser.Math.Clamp(this.currentLane + direction, 0, LANE_COUNT - 1);
    if (targetLane === this.currentLane) return;

    this.currentLane = targetLane;
    this.isChangingLane = true;

    this.tweens.add({
      targets: this.car,
      x: this.laneX[this.currentLane],
      duration: LANE_CHANGE_DURATION,
      ease: "Quad.easeOut",
      onComplete: () => { this.isChangingLane = false; },
    });
  }

  private scheduleNextObstacle() {
    const elapsedSec = this.elapsedMs / 1000;
    const interval = Math.max(
      OBSTACLE_SPAWN_INTERVAL_MIN,
      OBSTACLE_SPAWN_INTERVAL_START - elapsedSec * SPAWN_INTERVAL_DECAY_PER_SEC
    );

    this.time.addEvent({
      delay: interval,
      callback: () => {
        if (this.isGameOver) return;
        this.spawnObstacle();
        this.scheduleNextObstacle();
      },
    });
  }

  /** Genera un obstáculo garantizando que siempre quede al menos un carril libre para esquivar. */
  private spawnObstacle() {
    const occupiedLanes = new Set<number>();
    this.obstacles.getChildren().forEach((obj) => {
      const o = obj as ArcadeImage;
      if (o.y < OBSTACLE_TOP_ZONE_Y) {
        const lane = this.laneX.indexOf(o.x);
        if (lane !== -1) occupiedLanes.add(lane);
      }
    });

    const allLanes = Array.from({ length: LANE_COUNT }, (_, i) => i);
    const freeLanes = allLanes.filter((l) => !occupiedLanes.has(l));

    let lane: number;
    if (freeLanes.length > 1) {
      lane = Phaser.Utils.Array.GetRandom(freeLanes);
    } else if (freeLanes.length === 1) {
      const blockedLanes = allLanes.filter((l) => l !== freeLanes[0]);
      lane = Phaser.Utils.Array.GetRandom(blockedLanes);
    } else {
      return;
    }

    const kind = Phaser.Utils.Array.GetRandom([...OBSTACLE_KEYS]);
    const obstacle = this.physics.add.image(this.laneX[lane], -40, kind).setDisplaySize(OBSTACLE_SIZE, OBSTACLE_SIZE).setDepth(10);
    this.obstacles.add(obstacle);
    const hb = obstacle.width * OBSTACLE_HITBOX_RATIO;
    obstacle.body.setSize(hb, hb, true);
    obstacle.body.setAllowGravity(false);
  }

  private spawnCoin() {
    if (this.isGameOver) return;
    const lane = Phaser.Math.Between(0, LANE_COUNT - 1);
    const coin = this.physics.add.image(this.laneX[lane], -30, "catcoin").setDisplaySize(COIN_SIZE, COIN_SIZE).setDepth(10);
    this.coins.add(coin);
    coin.body.setAllowGravity(false);
  }

  private onHitObstacle(_car: unknown, obstacle: unknown) {
    if (this.isGameOver) return;
    (obstacle as ArcadeImage).destroy();

    this.lives -= 1;
    this.refreshHud();
    playHit(this);
    this.cameras.main.shake(180, 0.012);
    this.tweens.add({ targets: this.car, alpha: 0.25, duration: 70, yoyo: true, repeat: 3, onComplete: () => this.car.setAlpha(1) });

    if (this.lives <= 0) void this.endGame();
  }

  private onCollectCoin(_car: unknown, coin: unknown) {
    if (this.isGameOver) return;
    const c = coin as ArcadeImage;
    this.floatingText(c.x, c.y, `+${POINTS_PER_COIN}`);
    c.destroy();

    this.coinsCollected += 1;
    this.score += POINTS_PER_COIN;
    this.refreshHud();
    playCoin(this);

    // Anuncia el récord en tiempo real, apenas se supera el récord real del jugador (una sola vez por partida)
    if (!this.recordAnnounced && this.previousBest > 0 && this.score > this.previousBest) {
      this.recordAnnounced = true;
      this.showBanner("★ ¡NUEVO RÉCORD! ★", "record");
    }
  }

  private floatingText(x: number, y: number, text: string) {
    const t = this.add.text(x, y, text, {
      fontFamily: PIXEL_FONT, fontSize: "10px", color: CSS.yellow,
      shadow: { offsetX: 2, offsetY: 2, color: "#000", blur: 0, fill: true },
    }).setOrigin(0.5).setDepth(70);
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 550, ease: "Quad.easeOut", onComplete: () => t.destroy() });
  }

  private async endGame() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.physics.pause();
    this.time.removeAllEvents();

    const submit = async (): Promise<SubmitResult> => {
      if (this.sessionId === null) {
        return { status: "error", reason: "No se pudo conectar con el servidor al iniciar la partida" };
      }
      try {
        return await submitResult(this.sessionId, this.coinsCollected, this.score);
      } catch {
        return { status: "error", reason: "No se pudo conectar con el servidor al guardar el resultado" };
      }
    };

    // Pequeña pausa para que se vea el choque mientras se guarda el puntaje
    const [result] = await Promise.all([submit(), new Promise((r) => setTimeout(r, 700))]);

    const data: GameOverData = {
      result,
      score: this.score,
      coins: this.coinsCollected,
      previousBest: this.previousBest,
    };
    if (this.sys.isActive()) this.scene.start("GameOverScene", data);
  }
}
