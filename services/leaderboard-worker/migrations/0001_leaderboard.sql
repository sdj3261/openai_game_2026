CREATE TABLE leaderboard_runs (
  id TEXT PRIMARY KEY NOT NULL,
  client_submission_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  simulation_version INTEGER NOT NULL,
  ruleset_id TEXT NOT NULL,
  seed INTEGER NOT NULL,
  proof_json TEXT NOT NULL CHECK (json_valid(proof_json)),
  proof_sha256 TEXT NOT NULL CHECK (length(proof_sha256) = 64),
  callsign TEXT NOT NULL CHECK (length(callsign) BETWEEN 1 AND 18),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 1200),
  end_year INTEGER NOT NULL CHECK (end_year BETWEEN 2026 AND 2126),
  grade TEXT NOT NULL CHECK (grade IN ('S', 'A', 'B', 'C', 'D')),
  temperature REAL NOT NULL CHECK (temperature BETWEEN 1 AND 5),
  nature INTEGER NOT NULL CHECK (nature BETWEEN 0 AND 100),
  trust INTEGER NOT NULL CHECK (trust BETWEEN 0 AND 100),
  resilience INTEGER NOT NULL CHECK (resilience BETWEEN 0 AND 100),
  strategy_json TEXT NOT NULL CHECK (json_valid(strategy_json)),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  submitted_at TEXT NOT NULL,
  verified_at TEXT
);

CREATE INDEX idx_leaderboard_season_rank
  ON leaderboard_runs (
    season_id,
    verified DESC,
    end_year DESC,
    score DESC,
    temperature ASC,
    submitted_at ASC
  );

CREATE INDEX idx_leaderboard_proof_audit
  ON leaderboard_runs (season_id, proof_sha256);

CREATE UNIQUE INDEX idx_leaderboard_season_submission
  ON leaderboard_runs (season_id, client_submission_id);
