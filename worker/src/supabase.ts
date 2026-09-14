/**
 * Cliente minimo sobre la API REST de Supabase (PostgREST).
 * Las tablas son las que creo Django: scores_player y scores_gamesession.
 */

export interface Player {
  id: number;
  email: string;
  total_coins: number;
  best_score: number;
}

export interface GameSession {
  id: number;
  player_id: number;
  started_at: string;
}

export class SupabaseError extends Error {}

export class Supabase {
  private readonly base: string;
  private readonly headers: Record<string, string>;

  constructor(url: string, secretKey: string) {
    this.base = `${url.replace(/\/+$/, "")}/rest/v1`;
    // Las claves nuevas (sb_secret_...) van solo en `apikey`, nunca como Authorization: Bearer.
    this.headers = {
      apikey: secretKey,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, init: RequestInit & { prefer?: string }): Promise<T> {
    const { prefer, ...rest } = init;
    const res = await fetch(`${this.base}${path}`, {
      ...rest,
      headers: prefer ? { ...this.headers, Prefer: prefer } : this.headers,
    });

    if (!res.ok) {
      throw new SupabaseError(`${res.status} en ${path}: ${await res.text()}`);
    }
    // Las respuestas 204 (sin representacion) no traen cuerpo.
    return res.status === 204 ? (null as T) : ((await res.json()) as T);
  }

  private select<T>(table: string, query: string): Promise<T[]> {
    return this.request<T[]>(`/${table}?${query}`, { method: "GET" });
  }

  /** Equivalente a Player.objects.get_or_create(email=email) */
  async getOrCreatePlayer(email: string): Promise<Player> {
    const found = await this.select<Player>(
      "scores_player",
      `email=eq.${encodeURIComponent(email)}&select=id,email,total_coins,best_score&limit=1`,
    );
    if (found.length > 0) return found[0];

    try {
      const created = await this.request<Player[]>("/scores_player", {
        method: "POST",
        // created_at viene de auto_now_add en Django, no hay default en la BD.
        body: JSON.stringify({
          email,
          total_coins: 0,
          best_score: 0,
          created_at: new Date().toISOString(),
        }),
        prefer: "return=representation",
      });
      return created[0];
    } catch (err) {
      // Si otra peticion lo creo primero, el unique de email revienta: lo releemos.
      const raced = await this.select<Player>(
        "scores_player",
        `email=eq.${encodeURIComponent(email)}&select=id,email,total_coins,best_score&limit=1`,
      );
      if (raced.length > 0) return raced[0];
      throw err;
    }
  }

  async createSession(playerId: number): Promise<GameSession> {
    const created = await this.request<GameSession[]>("/scores_gamesession", {
      method: "POST",
      body: JSON.stringify({
        player_id: playerId,
        started_at: new Date().toISOString(), // auto_now_add, tampoco tiene default en la BD
        coins_reported: 0,
        score_reported: 0,
        is_valid: true,
        rejection_reason: "",
      }),
      prefer: "return=representation",
    });
    return created[0];
  }

  async getSession(id: number): Promise<GameSession | null> {
    const found = await this.select<GameSession>(
      "scores_gamesession",
      `id=eq.${id}&select=id,player_id,started_at&limit=1`,
    );
    return found[0] ?? null;
  }

  async getPlayer(id: number): Promise<Player | null> {
    const found = await this.select<Player>(
      "scores_player",
      `id=eq.${id}&select=id,email,total_coins,best_score&limit=1`,
    );
    return found[0] ?? null;
  }

  async updateSession(id: number, fields: Record<string, unknown>): Promise<void> {
    await this.request<null>(`/scores_gamesession?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
  }

  async updatePlayer(id: number, fields: Record<string, unknown>): Promise<void> {
    await this.request<null>(`/scores_player?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
  }
}
