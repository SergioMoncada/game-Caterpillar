/**
 * Worker del juego. Reemplaza a backend/scores/views.py.
 * Los archivos del juego (frontend/dist) los sirve Cloudflare directamente;
 * este codigo solo corre para las rutas /api/* (ver run_worker_first en wrangler.jsonc):
 *   POST /api/auth/login              correo + token de Turnstile -> JWT del jugador
 *   POST /api/scores/start-session/   (Bearer JWT)
 *   POST /api/scores/submit-result/   (Bearer JWT)
 */
import { Database } from "./db";
import { validateSession } from "./anticheat";
import { signPlayerToken, verifyPlayerToken, type PlayerClaims } from "./auth";
import { verifyTurnstile } from "./turnstile";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  LOGIN_LIMITER: RateLimit;
  SCORES_LIMITER: RateLimit;
  /** Secretos: `npx wrangler secret put ...` en producción, .dev.vars en local. */
  JWT_SECRET: string;
  TURNSTILE_SECRET: string;
  /** Opcional, separados por coma. Solo para desarrollo (p. ej. el servidor de Vite). */
  EXTRA_ALLOWED_ORIGINS?: string;
}

type Body = Record<string, unknown>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** Los enteros del cliente no son de fiar: los normalizamos antes de validar. */
function toInt(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * La API solo la llama el propio juego, que vive en el mismo dominio. Cada cliente entra por su
 * propio subdominio, así que en vez de una lista fija se exige que el Origin sea el mismo host
 * que recibió la petición. Los navegadores siempre mandan Origin en un POST.
 */
function isAllowedOrigin(request: Request, url: URL, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  if (origin === url.origin) return true;
  const extra = (env.EXTRA_ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  return extra.includes(origin);
}

async function login(body: Body, db: Database, env: Env, ip: string | null) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ status: "error", reason: "email inválido" }, 400);
  }

  const turnstileToken = typeof body.turnstile_token === "string" ? body.turnstile_token : "";
  if (!(await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET, ip))) {
    return json({ status: "error", reason: "verificación anti-bots fallida" }, 403);
  }

  const player = await db.getOrCreatePlayer(email);
  const token = await signPlayerToken({ playerId: player.id, email: player.email }, env.JWT_SECRET);
  return json({ token, best_score: player.best_score }, 200);
}

async function startSession(player: PlayerClaims, db: Database) {
  const found = await db.getPlayer(player.playerId);
  if (!found) return json({ status: "error", reason: "jugador no encontrado" }, 401);

  const session = await db.createSession(found.id);
  return json(
    { session_id: session.id, started_at: session.started_at, best_score: found.best_score },
    200,
  );
}

async function submitResult(body: Body, player: PlayerClaims, db: Database) {
  const session = await db.getSession(toInt(body.session_id));
  // Una partida de otro jugador se trata igual que una inexistente: no revela que existe.
  if (!session || session.player_id !== player.playerId) {
    return json({ status: "error", reason: "sesión no encontrada" }, 404);
  }
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

const TOO_MANY = () => json({ status: "error", reason: "demasiadas solicitudes, espera un momento" }, 429, { "Retry-After": "60" });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Cualquier ruta fuera de la API se resuelve con los archivos del juego.
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (request.method !== "POST") return json({ status: "error", reason: "método no permitido" }, 405);

    // Solo peticiones del propio juego y en JSON. Exigir application/json obliga a otros sitios
    // a pasar por la verificación previa de CORS, que este Worker nunca aprueba.
    if (!isAllowedOrigin(request, url, env)) {
      console.warn("Origen rechazado", request.headers.get("Origin"), "esperado", url.origin);
      return json({ status: "error", reason: "origen no permitido" }, 403);
    }
    const contentType = request.headers.get("Content-Type") ?? "";
    if (!/^application\/json\s*(;|$)/i.test(contentType)) {
      return json({ status: "error", reason: "se requiere Content-Type: application/json" }, 415);
    }

    let body: Body;
    try {
      body = await request.json();
    } catch {
      return json({ status: "error", reason: "JSON inválido" }, 400);
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return json({ status: "error", reason: "JSON inválido" }, 400);
    }

    const db = new Database(env.DB);
    const path = url.pathname.replace(/\/+$/, "");
    const ip = request.headers.get("CF-Connecting-IP");

    try {
      if (path === "/api/auth/login") {
        if (!(await env.LOGIN_LIMITER.limit({ key: ip ?? "sin-ip" })).success) return TOO_MANY();
        return await login(body, db, env, ip);
      }

      if (path === "/api/scores/start-session" || path === "/api/scores/submit-result") {
        const player = await verifyPlayerToken(request.headers.get("Authorization"), env.JWT_SECRET);
        if (!player) return json({ status: "error", reason: "token inválido o vencido" }, 401, { "WWW-Authenticate": "Bearer" });
        // Por jugador y no por IP: en un evento muchos juegan desde la misma red Wi-Fi.
        if (!(await env.SCORES_LIMITER.limit({ key: `jugador:${player.playerId}` })).success) return TOO_MANY();

        return path === "/api/scores/start-session"
          ? await startSession(player, db)
          : await submitResult(body, player, db);
      }

      return json({ status: "error", reason: "ruta no encontrada" }, 404);
    } catch (err) {
      console.error(err); // queda en los logs de Cloudflare, no se expone al cliente
      return json({ status: "error", reason: "error interno" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
