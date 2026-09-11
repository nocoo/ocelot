PRAGMA foreign_keys = ON;

CREATE TABLE repositories (
  id INTEGER PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  branch TEXT NOT NULL,
  private INTEGER NOT NULL CHECK (private IN (0, 1)),
  description TEXT NOT NULL DEFAULT '',
  commit_sha TEXT,
  tree_sha TEXT,
  etag TEXT,
  checked_at INTEGER NOT NULL DEFAULT 0,
  authorized_at INTEGER NOT NULL DEFAULT 0,
  authorization TEXT NOT NULL DEFAULT 'unknown',
  retry_at INTEGER NOT NULL DEFAULT 0,
  lease TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL,
  UNIQUE(owner, name)
);

CREATE TABLE snapshots (
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  tree_sha TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (repository_id, tree_sha)
);

CREATE TABLE connection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'unknown',
  expires_at TEXT,
  checked_at INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO connection (id) VALUES (1);
