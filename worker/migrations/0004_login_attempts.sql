-- ログイン失敗のIP単位記録（レートリミット用）
CREATE TABLE login_attempts (
  ip TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  last_failed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
