// El juego y la API viven en el mismo dominio (un solo Worker), asi que basta la ruta relativa.
// En desarrollo, Vite reenvia /api al Worker local (ver vite.config.ts).
import { AuthError, clearToken, getToken } from "./auth";

const API_BASE = "/api/scores";
const TIMEOUT_MS = 5000;

export interface StartSessionResponse {
  session_id: number;
  started_at: string;
  best_score: number;
}

export interface SubmitResult {
  status: "ok" | "rejected" | "error";
  total_coins?: number;
  reason?: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const token = getToken();
  if (!token) throw new AuthError();

  const res = await fetch(`${API_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS), // si el backend no responde, no se queda colgado
  });
  if (res.status === 401) {
    clearToken();
    throw new AuthError();
  }
  return res.json() as Promise<T>;
}

export function startSession() {
  return post<StartSessionResponse>("start-session/", {});
}

export function submitResult(sessionId: number, coins: number, score: number) {
  return post<SubmitResult>("submit-result/", { session_id: sessionId, coins, score });
}
