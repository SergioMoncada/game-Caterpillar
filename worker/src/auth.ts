/**
 * Tokens JWT del jugador. Se emiten en /api/auth/login (después de pasar Turnstile)
 * y el juego los envía en cada llamada a /api/scores/* como "Authorization: Bearer <token>".
 * Firmados con HS256 y la clave JWT_SECRET (secreto del Worker, nunca sale del servidor).
 */
import { SignJWT, jwtVerify } from "jose";

const ISSUER = "catgame";
const AUDIENCE = "catgame-api";
const ALGORITHM = "HS256";
// Alcanza para una tarde de partidas; al vencer, el juego vuelve al menú a pedir uno nuevo.
const TOKEN_TTL = "2h";

export interface PlayerClaims {
  playerId: number;
  email: string;
}

function key(secret: string): Uint8Array {
  if (secret.length < 32) throw new Error("JWT_SECRET debe tener al menos 32 caracteres");
  return new TextEncoder().encode(secret);
}

export function signPlayerToken(claims: PlayerClaims, secret: string): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(String(claims.playerId))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(key(secret));
}

/** Devuelve los datos del jugador si el token es válido y vigente; null en cualquier otro caso. */
export async function verifyPlayerToken(authorization: string | null, secret: string): Promise<PlayerClaims | null> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALGORITHM], // solo HS256: evita que un token con "alg": "none" u otro algoritmo pase
    });
    const playerId = Number(payload.sub);
    if (!Number.isSafeInteger(playerId) || typeof payload.email !== "string") return null;
    return { playerId, email: payload.email };
  } catch {
    return null; // firma inválida, vencido, emisor/audiencia distintos...
  }
}
