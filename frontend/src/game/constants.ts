export const GAME_WIDTH = 480;

/**
 * El ancho es fijo (carriles y controles no cambian) y el alto se ajusta a la pantalla al cargar:
 * en un celular en vertical, más alargado que 2:3, el juego crece hacia abajo en vez de dejar
 * franjas negras arriba y abajo. Todo el layout se calcula a partir de GAME_HEIGHT.
 */
const BASE_HEIGHT = 720;  // 2:3, el formato del diseño
const MAX_HEIGHT = 1080;  // ~9:20, cubre los celulares más alargados

function fitHeight() {
  const ratio = window.innerHeight / window.innerWidth;
  // Algunos navegadores embebidos cargan la página antes de tener tamaño (0x0): ahí va el formato base
  if (!Number.isFinite(ratio)) return BASE_HEIGHT;
  return Math.round(Math.min(Math.max(GAME_WIDTH * ratio, BASE_HEIGHT), MAX_HEIGHT));
}

export const GAME_HEIGHT = fitHeight();

/** Línea de horizonte del menú: separa el cielo del piso en perspectiva */
export const MENU_HORIZON_Y = 230;

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
  city: string;
  roadColor: number; // color del asfalto en ese nivel
  skyline: string;   // clave/archivo de la silueta (ciudad_0N_nombre)
  skyTop: string;    // paleta de la diseñadora: cielo arriba, cielo abajo, silueta
  skyBottom: string;
  skylineColor: number;
}

// PRUEBA DE DISEÑO: orden según la spec (numeración de los archivos); colores de
// "CÓDIGOS HEXADECIMAL COLORES JUEGO.txt", asumiendo el orden cielo arriba / cielo abajo / silueta.
// No hay niveles numerados: las ciudades se recorren en bucle, así que tras la última se vuelve a la primera.
export const LEVELS: LevelDefinition[] = [
  { city: "Bogotá",         roadColor: 0x423e4c, skyline: "ciudad_01_bogota",        skyTop: "#ED713B", skyBottom: "#C4D556", skylineColor: 0x7f4885 },
  { city: "Cali",           roadColor: 0x423e4c, skyline: "ciudad_02_cali",          skyTop: "#3E54A0", skyBottom: "#CF4893", skylineColor: 0x00956e },
  { city: "Medellín",       roadColor: 0x423e4c, skyline: "ciudad_03_medellin",      skyTop: "#E73E3F", skyBottom: "#C4D556", skylineColor: 0xeb666f },
  { city: "Ibagué",         roadColor: 0x423e4c, skyline: "ciudad_04_ibague",        skyTop: "#7F4885", skyBottom: "#00956E", skylineColor: 0xe73e3f },
  { city: "Villavicencio",  roadColor: 0x423e4c, skyline: "ciudad_05_villavicencio", skyTop: "#CF4893", skyBottom: "#ED713B", skylineColor: 0xe73e3f },
  { city: "Valledupar",     roadColor: 0x423e4c, skyline: "ciudad_06_valledupar",    skyTop: "#3E54A0", skyBottom: "#ED713B", skylineColor: 0xcf4893 },
  { city: "Montería",       roadColor: 0x423e4c, skyline: "ciudad_07_monteria",      skyTop: "#00956E", skyBottom: "#EB666F", skylineColor: 0x7f4885 },
  { city: "Neiva",          roadColor: 0x423e4c, skyline: "ciudad_08_neiva",         skyTop: "#ED713B", skyBottom: "#CF4893", skylineColor: 0xe73e3f },
];
