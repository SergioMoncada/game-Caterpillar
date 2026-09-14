import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "./constants";
import GameScene from "./scenes/GameScene";
import MenuScene from "./scenes/menuScene";
import GameOverScene from "./scenes/GameOverScene";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  backgroundColor: "#0a0a12",
  dom: { createContainer: true },
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scene: [MenuScene, GameScene, GameOverScene],
};
