-- 麻雀スコア記録 初期スキーマ
CREATE TABLE players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  played_at TEXT NOT NULL,          -- YYYY-MM-DD
  rule TEXT NOT NULL CHECK (rule IN ('5-10', '10-30')),
  kicker_seat INTEGER,              -- 起家の席 0-3（同点があった試合のみ）
  remarks TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE game_results (
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id),
  seat INTEGER NOT NULL CHECK (seat BETWEEN 0 AND 3), -- 0=下(自分),1=右,2=上,3=左
  final_score INTEGER NOT NULL,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 4),
  point REAL NOT NULL,
  PRIMARY KEY (game_id, player_id)
);

CREATE INDEX idx_games_played_at ON games(played_at);
CREATE INDEX idx_results_player ON game_results(player_id);
