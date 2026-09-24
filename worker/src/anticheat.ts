// Traduccion de backend/scores/anticheat.py

// Ajusta esto segun el diseno real del juego (cuantas monedas por segundo es realista)
export const MAX_COINS_PER_SECOND = 2;

// Igual que en frontend/src/game/constants.ts. Hoy el puntaje sale solo de las monedas;
// si el juego agrega puntos por otra cosa, hay que subir estos topes.
export const POINTS_PER_COIN = 10;
export const MAX_SCORE_PER_SECOND = MAX_COINS_PER_SECOND * POINTS_PER_COIN;

export interface ValidationResult {
  isValid: boolean;
  reason: string;
}

export function validateSession(
  startedAt: string,
  coinsReported: number,
  scoreReported: number,
): ValidationResult {
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;

  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    return { isValid: false, reason: "duración inválida" };
  }

  const maxPossibleCoins = Math.floor(elapsed * MAX_COINS_PER_SECOND);
  if (coinsReported > maxPossibleCoins) {
    return {
      isValid: false,
      reason: `monedas (${coinsReported}) exceden el máximo posible (${maxPossibleCoins}) para ${elapsed.toFixed(1)}s`,
    };
  }

  const maxPossibleScore = Math.floor(elapsed * MAX_SCORE_PER_SECOND);
  if (scoreReported > maxPossibleScore) {
    return {
      isValid: false,
      reason: `score (${scoreReported}) excede el máximo posible (${maxPossibleScore}) para ${elapsed.toFixed(1)}s`,
    };
  }

  if (scoreReported < coinsReported) {
    return { isValid: false, reason: "score reportado es menor a las monedas (inconsistente)" };
  }

  if (scoreReported > coinsReported * POINTS_PER_COIN) {
    return { isValid: false, reason: "score reportado es mayor al que dan las monedas (inconsistente)" };
  }

  return { isValid: true, reason: "" };
}
