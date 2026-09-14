import Phaser from "phaser";
import {
  GAME_WIDTH, GAME_HEIGHT, CAR_START_SPEED, SPEED_INCREASE_PER_SEC,
  STARTING_LIVES, COIN_SPAWN_INTERVAL, POINTS_PER_COIN,
  OBSTACLE_SPAWN_INTERVAL_START, OBSTACLE_SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_DECAY_PER_SEC,
  LEVELS, LANE_COUNT, LANE_CHANGE_DURATION,
  BARRIER_WIDTH, ROAD_LEFT, ROAD_RIGHT, ROAD_WIDTH, PLAYER_Y,
} from "../constants";
import { COLORS, CSS, PIXEL_FONT } from "../theme";
import { ensureTextures, OBSTACLE_KEYS, SHADOW_PAD, recordBannerTexture } from "../textures";
import { addScanlines, addScreenFrame, borderedPanel } from "../ui";
import { startSession, submitResult, type SubmitResult } from "../../api/scores";

const OBSTACLE_TOP_ZONE_Y = 200;
const DESPAWN_Y = GAME_HEIGHT + 60;

type ArcadeImage = Phaser.Types.Physics.Arcade.ImageWithDynamicBody;

/** Hitbox de cada obstáculo (en px, relativo a su sprite de 48x48) */
const OBSTACLE_HITBOX: Record<(typeof OBSTACLE_KEYS)[number], { w: number; h: number; ox: number; oy: number }> = {
  rock:   { w: 32, h: 26, ox: 8, oy: 10 },
  cone:   { w: 32, h: 34, ox: 8, oy: 6 },
  barrel: { w: 32, h: 38, ox: 8, oy: 6 },
};

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
  }

  async create() {
    ensureTextures(this);

    const laneWidth = ROAD_WIDTH / LANE_COUNT;
    this.laneX = Array.from({ length: LANE_COUNT }, (_, i) => ROAD_LEFT + laneWidth * i + laneWidth / 2);

    this.buildTrack(laneWidth);

    // ── Jeep del jugador ──
    this.car = this.physics.add.image(this.laneX[this.currentLane], PLAYER_Y, "jeep").setDepth(30);
    const carW = this.car.width - SHADOW_PAD * 2;
    const carH = this.car.height - SHADOW_PAD * 2;
    this.car.body.setSize(carW - 8, carH - 6).setOffset(SHADOW_PAD + 4, SHADOW_PAD + 3);
    this.car.body.setAllowGravity(false);

    this.obstacles = this.physics.add.group();
    this.coins = this.physics.add.group();

    // ── Controles: flechas, A/D o tocar mitad izquierda/derecha ──
    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.moveLane(pointer.x < GAME_WIDTH / 2 ? -1 : 1);
    });

    this.buildHud();
    addScanlines(this);
    addScreenFrame(this, COLORS.yellow, "rgba(255,205,17,0.25)");

    this.physics.add.overlap(this.car, this.obstacles, this.onHitObstacle as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.car, this.coins, this.onCollectCoin as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);

    const connecting = this.add.text(GAME_WIDTH / 2, 300, "CONECTANDO...", {
      fontFamily: PIXEL_FONT, fontSize: "10px", color: CSS.white,
    }).setOrigin(0.5).setDepth(60);

    // IMPORTANTE: esperamos la sesión y el récord real del backend ANTES de dejar que el juego
    // empiece a generar monedas/obstáculos, para que la comparación de récord sea correcta desde el inicio.
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

    // La escena pudo cerrarse mientras esperábamos al servidor
    if (!this.sys.isActive()) return;
    connecting.destroy();

    // Los timers de spawn arrancan DESPUÉS de tener el récord real
    this.isRunning = true;
    const first = LEVELS[0];
    this.showBanner(`${first.name.toUpperCase()} — ${first.city.toUpperCase()}`, "level");
    this.time.addEvent({ delay: COIN_SPAWN_INTERVAL, loop: true, callback: this.spawnCoin, callbackScope: this });
    this.scheduleNextObstacle();
  }

  update(_time: number, delta: number) {
    if (this.isGameOver) return;

    if (Phaser.Input.Keyboard.JustDown(this.cursors.left!) || Phaser.Input.Keyboard.JustDown(this.keyA)) this.moveLane(-1);
    if (Phaser.Input.Keyboard.JustDown(this.cursors.right!) || Phaser.Input.Keyboard.JustDown(this.keyD)) this.moveLane(1);

    // La pista se mueve siempre (también mientras conecta), pero la dificultad solo corre con la partida
    const dt = delta / 1000;
    if (this.isRunning) {
      this.elapsedMs += delta;
      this.currentSpeed = CAR_START_SPEED + (this.elapsedMs / 1000) * SPEED_INCREASE_PER_SEC;
    }
    this.laneDividers.forEach((d) => (d.tilePositionY -= this.currentSpeed * dt));
    this.barriers.forEach((b) => (b.tilePositionY -= this.currentSpeed * dt));

    const nextLevel = LEVELS[this.currentLevelIndex + 1];
    if (this.isRunning && nextLevel && this.currentSpeed >= nextLevel.minSpeed) {
      this.currentLevelIndex++;
      this.road.setFillStyle(nextLevel.roadColor);
      this.showBanner(`${nextLevel.name.toUpperCase()} — ${nextLevel.city.toUpperCase()}`, "level");
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

  // ───────────────────────── Construcción de la escena ─────────────────────────

  private buildTrack(laneWidth: number) {
    this.add.image(0, 0, "bg-game").setOrigin(0, 0);
    this.road = this.add.rectangle(ROAD_LEFT, 0, ROAD_WIDTH, GAME_HEIGHT, LEVELS[0].roadColor).setOrigin(0, 0);

    for (let i = 1; i < LANE_COUNT; i++) {
      const x = ROAD_LEFT + laneWidth * i;
      this.laneDividers.push(this.add.tileSprite(Math.round(x) - 2, 0, 4, GAME_HEIGHT, "lane-dash").setOrigin(0, 0));
    }

    this.barriers.push(this.add.tileSprite(0, 0, BARRIER_WIDTH, GAME_HEIGHT, "barrier").setOrigin(0, 0).setDepth(20));
    this.barriers.push(this.add.tileSprite(ROAD_RIGHT, 0, BARRIER_WIDTH, GAME_HEIGHT, "barrier").setOrigin(0, 0).setDepth(20));
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
    this.coinsLabel = this.add.text(right, top, "MONEDAS: ", style).setOrigin(1, 0).setDepth(HUD_DEPTH);
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
    const obstacle = this.physics.add.image(this.laneX[lane], -30, kind).setDepth(10);
    const hb = OBSTACLE_HITBOX[kind];
    this.obstacles.add(obstacle);
    obstacle.body.setSize(hb.w, hb.h).setOffset(hb.ox, hb.oy);
    obstacle.body.setAllowGravity(false);
  }

  private spawnCoin() {
    if (this.isGameOver) return;
    const lane = Phaser.Math.Between(0, LANE_COUNT - 1);
    const coin = this.physics.add.image(this.laneX[lane], -30, "coin").setDepth(10);
    this.coins.add(coin);
    coin.body.setAllowGravity(false);
  }

  private onHitObstacle(_car: unknown, obstacle: unknown) {
    if (this.isGameOver) return;
    (obstacle as ArcadeImage).destroy();

    this.lives -= 1;
    this.refreshHud();
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
