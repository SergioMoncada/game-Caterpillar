// En producción el Worker sirve juego y API en el mismo dominio, así que basta la ruta relativa.
// En desarrollo Vite redirige /api al backend local (ver vite.config.ts).
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
  const res = await fetch(`${API_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS), // si el backend no responde, no se queda colgado
  });
  return res.json() as Promise<T>;
}

export function startSession(email: string) {
  return post<StartSessionResponse>("start-session/", { email });
}

export function submitResult(sessionId: number, coins: number, score: number) {
  return post<SubmitResult>("submit-result/", { session_id: sessionId, coins, score });
}
