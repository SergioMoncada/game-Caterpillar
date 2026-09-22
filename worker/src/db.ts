/**
 * Acceso a la base del juego en Cloudflare D1.
 * Tablas: players y game_sessions (ver migrations/0001_tablas_iniciales.sql).
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
  ended_at: string | null;
}

export class Database {
  constructor(private readonly db: D1Database) {}

  /** Busca el jugador por correo y lo crea si no existe, en un solo viaje a la base. */
  async getOrCreatePlayer(email: string): Promise<Player> {
    const [, found] = await this.db.batch<Player>([
      this.db.prepare("INSERT INTO players (email) VALUES (?) ON CONFLICT (email) DO NOTHING").bind(email),
      this.db.prepare("SELECT id, email, total_coins, best_score FROM players WHERE email = ?").bind(email),
    ]);
    return found.results[0];
  }

  async createSession(playerId: number): Promise<GameSession> {
    const created = await this.db
      .prepare("INSERT INTO game_sessions (player_id) VALUES (?) RETURNING id, player_id, started_at, ended_at")
      .bind(playerId)
      .first<GameSession>();
    return created!;
  }

  getSession(id: number): Promise<GameSession | null> {
    return this.db
      .prepare("SELECT id, player_id, started_at, ended_at FROM game_sessions WHERE id = ?")
      .bind(id)
      .first<GameSession>();
  }

  /**
   * Cierra la sesión con lo reportado. Solo afecta sesiones abiertas, así que devuelve
   * false si otra petición ya la cerró (evita enviar dos veces el resultado de una partida).
   */
  async closeSession(id: number, coins: number, score: number, isValid: boolean, reason: string): Promise<boolean> {
    const res = await this.db
      .prepare(
        `UPDATE game_sessions
            SET ended_at = ?, coins_reported = ?, score_reported = ?, is_valid = ?, rejection_reason = ?
          WHERE id = ? AND ended_at IS NULL`,
      )
      .bind(new Date().toISOString(), coins, score, isValid ? 1 : 0, reason, id)
      .run();
    return res.meta.changes > 0;
  }

  /** Guarda el mejor resultado, no la suma (igual que en backend/scores/views.py). */
  async recordBest(playerId: number, coins: number, score: number): Promise<number | null> {
    const row = await this.db
      .prepare(
        `UPDATE players
            SET total_coins = MAX(total_coins, ?), best_score = MAX(best_score, ?)
          WHERE id = ?
      RETURNING total_coins`,
      )
      .bind(coins, score, playerId)
      .first<{ total_coins: number }>();
    return row?.total_coins ?? null;
  }
}
