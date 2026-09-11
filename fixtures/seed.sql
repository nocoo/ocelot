-- Local-only fixtures. Never apply this file to a production database.
CREATE TABLE IF NOT EXISTS mock_state (id INTEGER PRIMARY KEY CHECK (id = 1), scenario TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mock_requests (kind TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO mock_state VALUES (1, 'healthy');
INSERT OR IGNORE INTO repositories (id, owner, name, branch, private, description, added_at) VALUES
  (101, 'ocelot-demo', 'fieldnotes', 'main', 1, '一座关于阅读、观察与思考的数字花园', 1),
  (102, 'ocelot-demo', 'studio-notes', 'main', 0, 'Design decisions, working notes & small experiments', 2);
