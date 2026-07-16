-- Historical pre-Drizzle auth migration 5.
ALTER TABLE operator_sessions RENAME TO auth_sessions;
DROP INDEX idx_operator_sessions_user_id;
CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id);
INSERT INTO auth_schema_migrations (id, name, applied_at)
  VALUES (5, 'auth-session-terminology', 5);
