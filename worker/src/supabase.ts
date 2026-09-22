// Cliente mínimo para la API REST de Supabase (PostgREST).
// Usa la clave secreta, que salta RLS: nunca debe llegar al navegador.

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

const PLAYER_FIELDS = "id,email,total_coins,best_score";

export class Supabase {
  private base: string;
  private headers: Record<string, string>;

  constructor(url: string, secretKey: string) {
    this.base = `${url.replace(/\/+$/, "")}/rest/v1`;
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
    return (res.status === 204 || res.headers.get("Content-Length") === "0" ? null : await res.json()) as T;
  }

  private select<T>(table: string, query: string): Promise<T[]> {
    return this.request<T[]>(`/${table}?${query}`, { method: "GET" });
  }

  /** Equivalente a Player.objects.get_or_create(email=email) */
  async getOrCreatePlayer(email: string): Promise<Player> {
    const byEmail = `email=eq.${encodeURIComponent(email)}&select=${PLAYER_FIELDS}&limit=1`;
    const found = await this.select<Player>("scores_player", byEmail);
    if (found.length > 0) return found[0];

    try {
      const created = await this.request<Player[]>("/scores_player", {
        method: "POST",
        // created_at viene de auto_now_add en Django, no hay default en la BD.
        body: JSON.stringify({ email, total_coins: 0, best_score: 0, created_at: new Date().toISOString() }),
        prefer: "return=representation",
      });
      return created[0];
    } catch (err) {
      // Dos pestañas creando el mismo correo a la vez: el UNIQUE rechaza una y la buscamos de nuevo.
      const raced = await this.select<Player>("scores_player", byEmail);
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
    const found = await this.select<GameSession>("scores_gamesession", `id=eq.${id}&select=id,player_id,started_at&limit=1`);
    return found[0] ?? null;
  }

  async getPlayer(id: number): Promise<Player | null> {
    const found = await this.select<Player>("scores_player", `id=eq.${id}&select=${PLAYER_FIELDS}&limit=1`);
    return found[0] ?? null;
  }

  async updateSession(id: number, fields: Record<string, unknown>): Promise<void> {
    await this.request(`/scores_gamesession?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(fields) });
  }

  async updatePlayer(id: number, fields: Record<string, unknown>): Promise<void> {
    await this.request(`/scores_player?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(fields) });
  }
}
