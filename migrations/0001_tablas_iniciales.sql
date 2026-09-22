-- Esquema de la base del juego en Cloudflare D1 (SQLite).
-- Se aplica con: npx wrangler d1 migrations apply game-caterpillar-db --local | --remote
-- Las fechas se guardan como texto ISO 8601 en UTC (mismo formato que Date.toISOString()).

CREATE TABLE players (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT    NOT NULL UNIQUE,
  total_coins INTEGER NOT NULL DEFAULT 0 CHECK (total_coins >= 0),
  best_score  INTEGER NOT NULL DEFAULT 0 CHECK (best_score >= 0),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Se crea una sesión cuando el jugador da click en "Jugar", no al terminar.
CREATE TABLE game_sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id        INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  started_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ended_at         TEXT,
  coins_reported   INTEGER NOT NULL DEFAULT 0,
  score_reported   INTEGER NOT NULL DEFAULT 0,
  is_valid         INTEGER NOT NULL DEFAULT 1,
  rejection_reason TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX game_sessions_player_id_idx ON game_sessions (player_id);
