-- A tree can recur after a revert; article dates belong to commits, not tree/blob hashes.
CREATE TABLE revisions (
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL,
  tree_sha TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (repository_id, commit_sha)
);
INSERT INTO revisions (repository_id, commit_sha, tree_sha, created_at)
  SELECT repository_id, commit_sha, tree_sha, created_at FROM snapshots;
INSERT OR IGNORE INTO revisions (repository_id, commit_sha, tree_sha, created_at)
  SELECT id, commit_sha, tree_sha, checked_at FROM repositories
  WHERE commit_sha IS NOT NULL AND tree_sha IS NOT NULL;
