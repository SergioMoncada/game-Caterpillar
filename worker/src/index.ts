// Un solo Worker: sirve el juego (frontend/dist) y atiende /api/scores/*.
// Replica los endpoints de backend/scores/views.py contra Supabase.
import { Supabase } from "./supabase";
import { validateSession } from "./anticheat";

export interface Env {
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
}

type Body = Record<string, unknown>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toInt(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function startSession(body: Body, db: Supabase): Promise<Response> {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ status: "error", reason: "email inválido" }, 400);
  }

  const player = await db.getOrCreatePlayer(email);
  const session = await db.createSession(player.id);
  return json({ session_id: session.id, started_at: session.started_at, best_score: player.best_score }, 200);
}

async function submitResult(body: Body, db: Supabase): Promise<Response> {
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
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (request.method !== "POST") return json({ status: "error", reason: "método no permitido" }, 405);

    const missing = (["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const).filter((name) => !env[name]);
    if (missing.length > 0) {
      console.error(`Faltan variables del Worker: ${missing.join(", ")}`);
      return json({ status: "error", reason: "servidor sin configurar" }, 500);
    }

    let body: Body;
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
      console.error(err);
      return json({ status: "error", reason: "error interno" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
