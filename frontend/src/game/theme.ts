/** Paleta y tipografía del estilo arcade (amarillo/negro industrial + synthwave). */
export const COLORS = {
  yellow: 0xffcd11,
  orange: 0xff7a1a,
  red: 0xd8202f,
  redDark: 0x8a1420,
  yellowDark: 0x8a6e00,
  black: 0x1a1a1a,
  asphalt: 0x26232b,
  night: 0x0a0a12,
  muted: 0x6a5a2a,
  white: 0xffffff,
} as const;

export const CSS = {
  yellow: "#FFCD11",
  orange: "#ff7a1a",
  red: "#d8202f",
  black: "#1a1a1a",
  white: "#ffffff",
  muted: "#6a5a2a",
} as const;

export const PIXEL_FONT = '"Press Start 2P", monospace';

/** Convierte 0xRRGGBB a "#rrggbb" */
export const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
