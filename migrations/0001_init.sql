CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE oauth_states (id TEXT PRIMARY KEY, verifier TEXT NOT NULL, nonce TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE tasks (user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('todo','doing','done')), createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, mutationId TEXT NOT NULL, PRIMARY KEY(user_id,id));
CREATE TABLE ai_usage (user_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,day));
