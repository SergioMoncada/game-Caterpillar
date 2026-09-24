/**
 * Sesión del jugador con JWT. Al tocar "Jugar" se pasa Turnstile y el servidor entrega un token
 * que el juego envía en cada llamada a /api/scores/*. Se guarda en sessionStorage: dura lo que la
 * pestaña, y no queda en el navegador de un computador compartido después de cerrarla.
 */
import { getTurnstileToken } from "./turnstile";

const TOKEN_KEY = "playerToken";
const TIMEOUT_MS = 10000; // incluye la verificación de Turnstile en el servidor

/** El servidor rechazó el token (vencido o inválido): hay que volver a entrar desde el menú. */
export class AuthError extends Error {}

/** El servidor pide esperar por exceso de solicitudes. */
export class RateLimitError extends Error {}

let memoryToken: string | null = null;

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken; // modo privado o almacenamiento bloqueado
  }
}

function setToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // queda solo en memoria
  }
}

export function clearToken() {
  setToken(null);
}

export async function login(email: string): Promise<void> {
  const turnstileToken = await getTurnstileToken();
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, turnstile_token: turnstileToken }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 429) throw new RateLimitError();
  const data = (await res.json()) as { token?: string; reason?: string };
  if (!res.ok || !data.token) throw new Error(data.reason ?? "No se pudo iniciar sesión");
  setToken(data.token);
}
