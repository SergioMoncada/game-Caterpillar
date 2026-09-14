/**
 * API de puntajes del juego. Reemplaza a backend/scores/views.py.
 * Rutas (mismas que consume el frontend):
 *   POST /api/scores/start-session/
 *   POST /api/scores/submit-result/
 */
import { Supabase } from "./supabase";
import { validateSession } from "./anticheat";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ALLOWED_ORIGINS: string;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  const origin = request.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

/** Los enteros del cliente no son de fiar: los normalizamos antes de validar. */
function toInt(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function startSession(body: any, db: Supabase, cors: Record<string, string>) {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) return json({ status: "error", reason: "email requerido" }, 400, cors);

  const player = await db.getOrCreatePlayer(email);
  const session = await db.createSession(player.id);

  return json(
    { session_id: session.id, started_at: session.started_at, best_score: player.best_score },
    200,
    cors,
  );
}

async function submitResult(body: any, db: Supabase, cors: Record<string, string>) {
  const session = await db.getSession(toInt(body.session_id));
  if (!session) return json({ status: "error", reason: "sesión no encontrada" }, 404, cors);

  const coins = toInt(body.coins);
  const score = toInt(body.score);
  const { isValid, reason } = validateSession(session.started_at, coins, score);

  await db.updateSession(session.id, {
    ended_at: new Date().toISOString(),
    coins_reported: coins,
    score_reported: score,
    is_valid: isValid,
    rejection_reason: reason,
  });

  if (!isValid) return json({ status: "rejected", reason }, 400, cors);

  const player = await db.getPlayer(session.player_id);
  if (!player) return json({ status: "error", reason: "jugador no encontrado" }, 404, cors);

  // Se guarda el mejor resultado, no la suma (igual que en views.py).
  const totalCoins = Math.max(player.total_coins, coins);
  await db.updatePlayer(player.id, {
    total_coins: totalCoins,
    best_score: Math.max(player.best_score, score),
  });

  return json({ status: "ok", total_coins: totalCoins }, 200, cors);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ status: "error", reason: "método no permitido" }, 405, cors);

    const path = new URL(request.url).pathname.replace(/\/+$/, "");

    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ status: "error", reason: "JSON inválido" }, 400, cors);
    }

    const db = new Supabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    try {
      switch (path) {
        case "/api/scores/start-session":
          return await startSession(body, db, cors);
        case "/api/scores/submit-result":
          return await submitResult(body, db, cors);
        default:
          return json({ status: "error", reason: "ruta no encontrada" }, 404, cors);
      }
    } catch (err) {
      console.error(err); // queda en los logs de Cloudflare, no se expone al cliente
      return json({ status: "error", reason: "error interno" }, 500, cors);
    }
  },
} satisfies ExportedHandler<Env>;
