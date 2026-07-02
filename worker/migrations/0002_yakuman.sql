CREATE TABLE yakuman (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  winner_player_id INTEGER NOT NULL REFERENCES players(id),
  loser_player_id INTEGER REFERENCES players(id),   -- NULL = ツモ/放銃者なし
  is_dealer INTEGER NOT NULL CHECK (is_dealer IN (0,1)),  -- 1=親, 0=子
  yaku1 TEXT NOT NULL,
  yaku2 TEXT, yaku3 TEXT, yaku4 TEXT
);
CREATE INDEX idx_yakuman_game ON yakuman(game_id);
