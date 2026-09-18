import Phaser from "phaser";
import "./style.css";
import { gameConfig } from "./game/config";

/**
 * Phaser dibuja el texto en canvas, así que la fuente pixel debe estar cargada ANTES de crear el juego:
 * si llegara después, el texto ya horneado se queda con la de respaldo hasta que se recargue la página.
 * La fuente se sirve desde el propio proyecto (public/fonts), así que esto resuelve de inmediato; el
 * tope de 3s queda solo como red de seguridad para no dejar el juego colgado si algo fallara.
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
