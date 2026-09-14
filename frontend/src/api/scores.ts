// En produccion se define VITE_API_BASE (ej. https://tu-backend.com/api/scores).
// Sin esa variable cae al backend local de desarrollo.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000/api/scores";
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
