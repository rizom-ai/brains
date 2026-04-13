# Plan: migrate per-user secrets from GitHub Secrets to age-encrypted YAML files

## Status

Proposed.

## Context

Per-user secrets (Discord bot tokens, MCP auth tokens, git sync tokens) are currently stored as individual GitHub Secrets with a handle-suffixed naming convention (`GIT_SYNC_TOKEN_ALICE`, `MCP_AUTH_TOKEN_ALICE`). This creates three layers of indirection: generated `.env` files store secret _names_ (`GIT_SYNC_TOKEN_SECRET=GIT_SYNC_TOKEN_ALICE`), the deploy workflow resolves those names via `secrets[name]`, and the container receives the values as env vars. Adding a new per-user secret touches 5+ files.

The goal is to replace this with age-encrypted YAML files committed to the repo — one file per user, easy to handwrite, no naming convention.

## Target state

```yaml
# users/alice.secrets.yaml (plaintext, before encryption)
gitSyncToken: "ghp_..."
mcpAuthToken: "mcp_..."
discordBotToken: "tok_..." # only if discord.enabled
aiApiKey: "sk-..." # only if overriding the shared key
```

Encrypted to `users/alice.secrets.yaml.age` with `age`, committed to the repo. One GitHub Secret: `AGE_SECRET_KEY` for decryption at deploy time. Shared infra secrets (`HCLOUD_TOKEN`, `CF_API_TOKEN`, TLS certs, etc.) remain as GitHub Secrets.

## What changes

### Delete

- `src/user-secret-names.ts` — the naming convention goes away entirely

### Rewrite

- `src/secrets-push.ts` → `src/secrets-encrypt.ts`
  - Reads local env values (reuses existing `readLocalEnvValues`/`resolveLocalEnvValue`)
  - Builds a typed secrets object from: `GIT_SYNC_TOKEN`, `MCP_AUTH_TOKEN`, `DISCORD_BOT_TOKEN` (if discord enabled), `AI_API_KEY` (if operator provides a per-user override)
  - Reads `pilot.yaml.agePublicKey` for encryption
  - Encrypts to `users/<handle>.secrets.yaml.age`
  - Auto-deletes plaintext `users/<handle>.secrets.yaml` if present
  - Supports `--dry-run`

### Simplify

- `src/default-user-runner.ts` (lines 82-101)
  - `renderUserEnv` drops all `*_SECRET` lines and `effectiveAiApiKey`
  - Output becomes: `BRAIN_VERSION=...\nCONTENT_REPO=...\n`
  - `renderUserBrainYaml` unchanged — still uses `${GIT_SYNC_TOKEN}` etc.
  - Remove import of `deriveUserSecretNames`

- `src/content-repo.ts` (lines 139-153)
  - `resolveGitSyncToken` simplifies to just check `GIT_SYNC_TOKEN` env var — no more per-user suffix lookup
  - Remove import of `deriveUserSecretNames`

### Update schemas

- `src/schema.ts`
  - Add `agePublicKey: z.string().startsWith("age1").min(1)` to `pilotSchema`
  - Remove `aiApiKeyOverride` from `userSchema` and `cohortSchema`

- `src/load-registry.ts`
  - Remove `effectiveAiApiKey` from `ResolvedUserIdentity`
  - Remove resolution logic
  - Remove `aiApiKeyOverride` from `ResolvedCohort` and its propagation

### Update CLI routing

- `src/run-command.ts` — rename `secrets:push` case to `secrets:encrypt`, import new function, update help text

### Update deploy templates

All paths relative to `packages/brains-ops/templates/rover-pilot/`:

- **New file: `deploy/scripts/decrypt-user-secrets.ts`**
  - Reads `AGE_SECRET_KEY` from env
  - Reads `users/<handle>.secrets.yaml.age`
  - Decrypts using `age-encryption` npm package
  - Parses YAML, writes each secret to `$GITHUB_ENV`
  - Sets `has_per_user_ai_key` output flag

- **`.github/workflows/deploy.yml`**
  - Remove the "Resolve selected user secret names" step (handle-suffix derivation)
  - Add a "Decrypt user secrets" step early (after install, before reconcile):
    ```yaml
    env:
      AGE_SECRET_KEY: ${{ secrets.AGE_SECRET_KEY }}
    run: bun deploy/scripts/decrypt-user-secrets.ts "$HANDLE"
    ```
  - Simplify all subsequent steps: per-user secrets come from `$GITHUB_ENV`, no more `secrets[name]` lookups
  - AI_API_KEY fallback: `${{ env.AI_API_KEY || secrets[env.AI_API_KEY_SECRET_NAME] }}` (use per-user if decrypted, else shared)
  - Add `users/*.secrets.yaml.age` to deploy trigger paths

- **`deploy/scripts/resolve-user-config.ts`**
  - Remove outputs: `ai_api_key_secret_name`, `git_sync_token_secret_name`, `mcp_auth_token_secret_name`, `discord_bot_token_secret_name`

- **`deploy/scripts/resolve-deploy-handles.ts`**
  - Add `users/<handle>.secrets.yaml.age` changes as a deploy trigger for that handle

- **`.env.schema`** — keep per-user secrets listed (Kamal still needs them as env vars), but add comments noting they come from decrypted secrets file

- **`.gitignore` generation in `src/init.ts`** — add `users/*.secrets.yaml` (plaintext must never be committed; `.age` files are committed)

### Update package dependencies

- `packages/brains-ops/package.json` — add `age-encryption` to devDependencies
- `templates/rover-pilot/package.json` — add `age-encryption` to dependencies (needed at deploy time)

### Update tests

- `test/secrets-push.test.ts` → `test/secrets-encrypt.test.ts`
  - Encrypt from local env to `.age` file
  - Round-trip: encrypt then decrypt
  - Skip discord token when disabled
  - Include `aiApiKey` when provided
  - Dry-run mode
  - Error when no secrets available

- `test/cli.test.ts`
  - Update `.env` assertions: no `*_SECRET` lines
  - Rename `secrets:push` references to `secrets:encrypt`

- `test/load-registry.test.ts`
  - Remove `effectiveAiApiKey` from expected objects
  - Remove `aiApiKeyOverride` from test fixtures
  - Add `agePublicKey` to test `pilot.yaml`

- `test/reconcile.test.ts`
  - Remove `effectiveAiApiKey` from runner assertions
  - Update `.env` content assertions

### Update docs

- `templates/rover-pilot/docs/onboarding-checklist.md`
  - Step 8 becomes: `bunx brains-ops secrets:encrypt <repo> <handle>`
  - Step 9: commit and push the `.age` file
  - Add prerequisite: `AGE_SECRET_KEY` GitHub Secret (one-time setup)

- `templates/rover-pilot/docs/operator-playbook.md`
  - Add age encryption model explanation
  - Document one-time keypair generation and GitHub Secret setup

## New operator flow

```
# One-time fleet setup:
1. age-keygen -o key.txt
2. Add public key to pilot.yaml as agePublicKey
3. gh secret set AGE_SECRET_KEY < key.txt
4. Store key.txt in password manager

# Per-user onboarding:
1. Add users/<handle>.yaml
2. Add handle to a cohort
3. Set GIT_SYNC_TOKEN, MCP_AUTH_TOKEN, etc. in .env.local
4. bunx brains-ops secrets:encrypt <repo> <handle>
5. git add users/<handle>.secrets.yaml.age && git commit && git push
6. bunx brains-ops onboard <repo> <handle>
7. CI deploys
```

## New deploy workflow flow

```
checkout → install → decrypt user secrets (age) →
reconcile/onboard (GIT_SYNC_TOKEN from env) →
resolve user config (no secret names) →
validate secrets (per-user from env, shared from GitHub Secrets) →
seed content → docker login → wait for image → kamal deploy
```

## Migration for existing pilot repos

1. Update `@rizom/ops` to version with age support
2. Generate age keypair, set `agePublicKey` in `pilot.yaml`, set `AGE_SECRET_KEY` as GitHub Secret
3. Re-scaffold deploy contract files via `brains-ops init`
4. For each user: retrieve secrets from `.env.local`, run `secrets:encrypt`, commit `.age` file
5. Run `brains-ops reconcile-all` to regenerate `.env` files (now without `*_SECRET` lines)
6. Push — CI uses new flow
7. Delete old per-user GitHub Secrets (`gh secret delete GIT_SYNC_TOKEN_ALICE` etc.)

## Implementation order

1. Schema changes (`schema.ts`, `load-registry.ts`) + add `age-encryption` dependency
2. New `secrets-encrypt.ts`, delete `user-secret-names.ts` and `secrets-push.ts`
3. CLI routing update (`run-command.ts`)
4. Simplify `.env` generation (`default-user-runner.ts`, `content-repo.ts`)
5. Deploy template changes (workflow, scripts, new `decrypt-user-secrets.ts`)
6. `.gitignore` and `init.ts` updates
7. Tests
8. Docs

Ship as a single PR — the old and new flows are incompatible, so there's no useful intermediate state.

## Verification

1. Run `bun test` in `packages/brains-ops` — all tests pass
2. In a test pilot repo:
   - Generate keypair, configure `pilot.yaml` with `agePublicKey`
   - Set `AGE_SECRET_KEY` as GitHub Secret
   - Run `secrets:encrypt` for a test user — verify `.age` file is created, plaintext is deleted
   - Run `onboard` — verify `.env` has no `*_SECRET` lines
   - Push and verify deploy workflow succeeds end-to-end
   - Verify the deployed brain has working Discord, MCP, and content sync
3. Verify `secrets:encrypt --dry-run` logs intended actions without writing files

## Risks

- **`age-encryption` npm package**: WebAssembly-based. If it has bun compatibility issues, fall back to shelling out to the `age` CLI binary.
- **Lost secrets during migration**: Operators must have original secret values in `.env.local` before running `secrets:encrypt`. Document clearly.
- **Secret rotation**: Simpler than before — update `.env.local`, re-run `secrets:encrypt`, commit, push. No `gh secret set` needed.
