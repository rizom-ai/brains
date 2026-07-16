-- Historical pre-Drizzle auth migration 6. Requires the v5 fixture.
CREATE TABLE auth_people (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  profile_entity_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_auth_people_profile_entity_id
  ON auth_people(profile_entity_id) WHERE profile_entity_id IS NOT NULL;

ALTER TABLE auth_users
  ADD COLUMN person_id TEXT REFERENCES auth_people(id) ON DELETE RESTRICT;
INSERT INTO auth_people
  (id, display_name, profile_entity_id, created_at, updated_at)
  SELECT
    CASE
      WHEN id LIKE 'usr_%' THEN 'prsn_' || substr(id, 5)
      ELSE 'prsn_' || id
    END,
    display_name,
    NULL,
    created_at,
    updated_at
  FROM auth_users;
UPDATE auth_users
  SET person_id = CASE
    WHEN id LIKE 'usr_%' THEN 'prsn_' || substr(id, 5)
    ELSE 'prsn_' || id
  END
  WHERE person_id IS NULL;
CREATE UNIQUE INDEX idx_auth_users_person_id ON auth_users(person_id);

ALTER TABLE auth_identities
  ADD COLUMN person_id TEXT REFERENCES auth_people(id) ON DELETE CASCADE;
UPDATE auth_identities
  SET person_id = (
    SELECT auth_users.person_id
    FROM auth_users
    WHERE auth_users.id = auth_identities.user_id
  )
  WHERE person_id IS NULL;
CREATE INDEX idx_auth_identities_person_id ON auth_identities(person_id);

CREATE TABLE agent_person_links (
  agent_id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES auth_people(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
  created_by_user_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  consented_by_user_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_agent_person_links_person_id
  ON agent_person_links(person_id);

INSERT INTO auth_schema_migrations (id, name, applied_at)
  VALUES (6, 'person-subjects', 6);
