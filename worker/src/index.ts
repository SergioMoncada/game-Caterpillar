/**
 * Worker del juego. Reemplaza a backend/scores/views.py.
 * Los archivos del juego (frontend/dist) los sirve Cloudflare directamente;
 * este codigo solo corre para las rutas /api/* (ver run_worker_first en wrangler.jsonc):
 *   POST /api/scores/start-session/
 *   POST /api/scores/submit-result/
 */
import { Supabase } from "./supabase";
import { validateSession } from "./anticheat";

interface Env {
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
}

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

async function startSession(body: any, db: Supabase) {
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) return json({ status: "error", reason: "email requerido" }, 400);

  const player = await db.getOrCreatePlayer(email);
  const session = await db.createSession(player.id);

  return json(
    { session_id: session.id, started_at: session.started_at, best_score: player.best_score },
    200,
  );
}

async function submitResult(body: any, db: Supabase) {
  const session = await db.getSession(toInt(body.session_id));
  if (!session) return json({ status: "error", reason: "sesión no encontrada" }, 404);

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

  if (!isValid) return json({ status: "rejected", reason }, 400);

  const player = await db.getPlayer(session.player_id);
  if (!player) return json({ status: "error", reason: "jugador no encontrado" }, 404);

  // Se guarda el mejor resultado, no la suma (igual que en views.py).
  const totalCoins = Math.max(player.total_coins, coins);
  await db.updatePlayer(player.id, {
    total_coins: totalCoins,
    best_score: Math.max(player.best_score, score),
  });

  return json({ status: "ok", total_coins: totalCoins }, 200);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Cualquier ruta fuera de la API se resuelve con los archivos del juego.
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (request.method !== "POST") return json({ status: "error", reason: "método no permitido" }, 405);

    const missing = (["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const).filter((name) => !env[name]);
    if (missing.length > 0) {
      console.error(`Faltan variables del Worker: ${missing.join(", ")}`);
      return json({ status: "error", reason: "servidor sin configurar" }, 500);
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ status: "error", reason: "JSON inválido" }, 400);
    }

    const db = new Supabase(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
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
