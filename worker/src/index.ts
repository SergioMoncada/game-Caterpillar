/**
 * Worker del juego. Reemplaza a backend/scores/views.py.
 * Los archivos del juego (frontend/dist) los sirve Cloudflare directamente;
 * este codigo solo corre para las rutas /api/* (ver run_worker_first en wrangler.jsonc):
 *   POST /api/scores/start-session/
 *   POST /api/scores/submit-result/
 */
import { Database } from "./db";
import { validateSession } from "./anticheat";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

type Body = Record<string, unknown>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Los enteros del cliente no son de fiar: los normalizamos antes de validar. */
function toInt(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function startSession(body: Body, db: Database) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ status: "error", reason: "email inválido" }, 400);
  }

  const player = await db.getOrCreatePlayer(email);
  const session = await db.createSession(player.id);

  return json(
    { session_id: session.id, started_at: session.started_at, best_score: player.best_score },
    200,
  );
}

async function submitResult(body: Body, db: Database) {
  const session = await db.getSession(toInt(body.session_id));
  if (!session) return json({ status: "error", reason: "sesión no encontrada" }, 404);
  if (session.ended_at) return json({ status: "rejected", reason: "la partida ya fue registrada" }, 409);

  const coins = toInt(body.coins);
  const score = toInt(body.score);
  const { isValid, reason } = validateSession(session.started_at, coins, score);

  // Cada sesión se cierra una sola vez: un resultado reenviado no vuelve a contar.
  const closed = await db.closeSession(session.id, coins, score, isValid, reason);
  if (!closed) return json({ status: "rejected", reason: "la partida ya fue registrada" }, 409);

  if (!isValid) return json({ status: "rejected", reason }, 400);

  const totalCoins = await db.recordBest(session.player_id, coins, score);
  if (totalCoins === null) return json({ status: "error", reason: "jugador no encontrado" }, 404);

  return json({ status: "ok", total_coins: totalCoins }, 200);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Cualquier ruta fuera de la API se resuelve con los archivos del juego.
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (request.method !== "POST") return json({ status: "error", reason: "método no permitido" }, 405);

    let body: Body;
    try {
      body = await request.json();
    } catch {
      return json({ status: "error", reason: "JSON inválido" }, 400);
    }

    const db = new Database(env.DB);
    const path = url.pathname.replace(/\/+$/, "");

    try {
      switch (path) {
        case "/api/scores/start-session":
          return await startSession(body, db);
        case "/api/scores/submit-result":
          return await submitResult(body, db);
        default:
          return json({ status: "error", reason: "ruta no encontrada" }, 404);
      }
    } catch (err) {
      console.error(err); // queda en los logs de Cloudflare, no se expone al cliente
      return json({ status: "error", reason: "error interno" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
