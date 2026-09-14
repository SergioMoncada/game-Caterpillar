export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 720;

export const CAR_START_SPEED = 200;       // px/segundo, velocidad de scroll base
export const SPEED_INCREASE_PER_SEC = 4;  // cuánto sube la velocidad cada segundo
export const STARTING_LIVES = 3;

export const COIN_SPAWN_INTERVAL = 900;   // ms
export const POINTS_PER_COIN = 10;

// Spawn de obstáculos: el intervalo baja con el tiempo (más difícil progresivamente)
export const OBSTACLE_SPAWN_INTERVAL_START = 1200; // ms al inicio
export const OBSTACLE_SPAWN_INTERVAL_MIN = 400;     // ms mínimo (nunca más rápido que esto)
export const SPAWN_INTERVAL_DECAY_PER_SEC = 15;     // cuánto baja el intervalo cada segundo

// Sistema de carriles
export const LANE_COUNT = 3;
export const LANE_CHANGE_DURATION = 120; // ms que tarda el "salto" entre carriles

// Layout de la pista (según el mockup: barreras de 40px a cada lado)
export const BARRIER_WIDTH = 40;
export const ROAD_LEFT = BARRIER_WIDTH;
export const ROAD_RIGHT = GAME_WIDTH - BARRIER_WIDTH;
export const ROAD_WIDTH = ROAD_RIGHT - ROAD_LEFT;
export const PLAYER_Y = GAME_HEIGHT - 107; // bottom: 90px en el mockup

export interface LevelDefinition {
  name: string;
  city: string;
  minSpeed: number;
  roadColor: number; // color del asfalto en ese nivel
}

export const LEVELS: LevelDefinition[] = [
  { name: "Nivel 1", city: "Bogotá",  minSpeed: 0,   roadColor: 0x26232b },
  { name: "Nivel 2", city: "Peoria",  minSpeed: 260, roadColor: 0x2b2233 },
  { name: "Nivel 3", city: "Houston", minSpeed: 320, roadColor: 0x2e2226 },
  { name: "Nivel 4", city: "Tokio",   minSpeed: 380, roadColor: 0x1f2433 },
];
