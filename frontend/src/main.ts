import Phaser from "phaser";
import "./style.css";
import { gameConfig } from "./game/config";

/**
 * Phaser dibuja el texto en canvas, así que la fuente pixel debe estar cargada ANTES de crear el juego.
 * Si no carga en 3s (sin internet), arranca igual con la fuente monospace de respaldo.
 */
async function boot() {
  try {
    await Promise.race([
      document.fonts.load('16px "Press Start 2P"'),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // seguimos con la fuente de respaldo
  }
  const game = new Phaser.Game(gameConfig);
  // PRUEBA DE DISEÑO: acceso desde la consola para avanzar fotogramas con la pestaña en segundo plano
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
}

void boot();
