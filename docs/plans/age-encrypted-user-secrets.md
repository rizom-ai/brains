# Plan: migrate rover-pilot secrets to age-encrypted user secret files

## Status

Proposed. Revised for shared-by-default AI/Git/MCP secrets and Discord-first pilot defaults.

## Context

Per-user deploy secrets currently mix three different patterns:

1. shared GitHub Secrets for infra and some app secrets
2. handle-suffixed GitHub Secrets for per-user app secrets
3. generated `.env` files that store secret _names_ rather than values

That makes the rover-pilot flow harder to reason about:

- generated `users/<handle>/.env` stores selectors like `GIT_SYNC_TOKEN_SECRET=GIT_SYNC_TOKEN_ALICE`
- the deploy workflow derives or reads those selectors
- GitHub Actions resolves `secrets[name]`
- the container finally receives the actual env vars

The original age-encryption plan assumed `GIT_SYNC_TOKEN` and `MCP_AUTH_TOKEN` were always per-user. That is not how the pilot actually operates today.

### Actual pilot secret model

- `AI_API_KEY` — **shared by default**, optional cohort/user override
- `GIT_SYNC_TOKEN` — **shared by default**, optional cohort/user override
- `MCP_AUTH_TOKEN` — **shared by default**, optional cohort/user override
- `DISCORD_BOT_TOKEN` — effectively **per-user**, and Discord should be treated as the primary pilot interface
- infra secrets (`HCLOUD_TOKEN`, `CF_API_TOKEN`, TLS certs, SSH key, registry password) remain shared GitHub Secrets

## Goals

1. Replace handle-suffixed GitHub Secrets with `age`-encrypted files committed to the repo.
2. Preserve the current shared-by-default override model for AI/Git/MCP secrets.
3. Keep deploy-time fallback simple: use decrypted override when present, else shared GitHub Secret.
4. Make Discord enabled by default in scaffolded pilot users, since it is the primary interface during pilot.
5. Keep migration of the real `~/Documents/rover-pilot` repo explicit and low-risk.

## Target state

### Shared defaults

`pilot.yaml` continues to define the shared secret selectors for the fleet. For symmetry, shared selectors should exist for all shared-by-default app secrets:

```yaml
schemaVersion: 1
brainVersion: 0.2.0-alpha.x
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
mcpAuthToken: MCP_AUTH_TOKEN
agePublicKey: age1...
```

### Override selectors in desired state

User/cohort config keeps the existing override semantics, but those fields now mean “which local secret source should be encrypted for this user”, not “which GitHub Secret should Actions read directly”.

```yaml
# cohorts/canary.yaml
members:
  - alice
aiApiKeyOverride: CANARY_AI_API_KEY
gitSyncTokenOverride: CANARY_GIT_SYNC_TOKEN
mcpAuthTokenOverride: CANARY_MCP_AUTH_TOKEN
```

```yaml
# users/alice.yaml
handle: alice
discord:
  enabled: true
  anchorUserId: "123..."
aiApiKeyOverride: ALICE_AI_API_KEY
```

### Encrypted per-user file

The checked-in encrypted file contains only the secrets that must be user-specific at deploy time.

For AI/Git/MCP, that means **only overrides**, not shared defaults.

```yaml
# users/alice.secrets.yaml (plaintext before encryption)
discordBotToken: "tok_..." # usually present because Discord is primary
aiApiKey: "sk-..." # only if alice overrides shared AI key
gitSyncToken: "ghp_..." # only if alice/cohort overrides shared git token
mcpAuthToken: "mcp_..." # only if alice/cohort overrides shared MCP token
```

Encrypted to `users/alice.secrets.yaml.age` and committed.

### Deploy-time resolution model

At deploy time:

- decrypt `users/<handle>.secrets.yaml.age`
- export any present override env vars into `$GITHUB_ENV`
- fall back to shared GitHub Secrets from `pilot.yaml` when override is absent

So the logic becomes:

- `AI_API_KEY = decrypted override ?? secrets[pilot.aiApiKey]`
- `GIT_SYNC_TOKEN = decrypted override ?? secrets[pilot.gitSyncToken]`
- `MCP_AUTH_TOKEN = decrypted override ?? secrets[pilot.mcpAuthToken]`
- `DISCORD_BOT_TOKEN = decrypted value when discord is enabled`

## What changes

### Delete

- `src/user-secret-names.ts`
  - handle-suffixed GitHub Secret naming convention goes away entirely

### Rewrite

- `src/secrets-push.ts` → `src/secrets-encrypt.ts`
  - Reads local env values via existing local env/file-backed helpers
  - Resolves effective selectors with precedence:
    1. user override
    2. cohort override
    3. pilot shared selector
  - Builds encrypted payload per user:
    - always include `discordBotToken` when `discord.enabled`
    - include `aiApiKey` only when effective selector differs from pilot shared selector
    - include `gitSyncToken` only when effective selector differs from pilot shared selector
    - include `mcpAuthToken` only when effective selector differs from pilot shared selector
  - Encrypts to `users/<handle>.secrets.yaml.age`
  - Deletes plaintext `users/<handle>.secrets.yaml` if present
  - Supports `--dry-run`

### Keep override semantics, but repurpose them

The original plan removed `aiApiKeyOverride`. That no longer fits reality.

Instead:

- keep `aiApiKeyOverride` on `userSchema` and `cohortSchema`
- add `gitSyncTokenOverride` on `userSchema` and `cohortSchema`
- add `mcpAuthTokenOverride` on `userSchema` and `cohortSchema`
- treat all of them as _local source selectors for encryption resolution_, not direct deploy-time GitHub Secret references

### Add shared selectors to pilot config

Update `src/schema.ts` / `pilotSchema` to include:

- `aiApiKey`
- `gitSyncToken`
- `mcpAuthToken`
- `agePublicKey`

This makes shared-vs-override behavior explicit and symmetric.

### Load registry changes

- `src/load-registry.ts`
  - keep resolution logic for shared/override secret selectors
  - expose effective selector fields needed by `secrets:encrypt`
  - generated deploy artifacts no longer consume those selectors directly

Concretely, the registry still needs to know the effective source for AI/Git/MCP during encryption, but `.env` generation should stop emitting selector lines.

### Simplify generated per-user env

- `src/default-user-runner.ts`
  - `renderUserEnv` drops all `*_SECRET` lines
  - output becomes only durable generated config such as:
    - `BRAIN_VERSION=...`
    - `CONTENT_REPO=...`
  - `brain.yaml` still references `${GIT_SYNC_TOKEN}`, `${MCP_AUTH_TOKEN}`, `${DISCORD_BOT_TOKEN}`

### Simplify content repo sync

- `src/content-repo.ts`
  - `resolveGitSyncToken` checks only `GIT_SYNC_TOKEN`
  - no handle-suffix lookup

### Update CLI routing

- `src/run-command.ts`
  - rename `secrets:push` → `secrets:encrypt`
  - update help text and tests

### Update deploy templates

All paths relative to `packages/brains-ops/templates/rover-pilot/`.

#### New file

- `deploy/scripts/decrypt-user-secrets.ts`
  - reads `AGE_SECRET_KEY`
  - decrypts `users/<handle>.secrets.yaml.age`
  - parses YAML
  - writes present values to `$GITHUB_ENV`
  - emits flags such as `has_ai_api_key_override`, `has_git_sync_token_override`, `has_mcp_auth_token_override`

#### Workflow changes

- `.github/workflows/deploy.yml`
  - remove secret-name derivation step
  - add decrypt step early
  - use decrypted overrides when present
  - otherwise resolve shared GitHub Secrets from `pilot.yaml`
  - add `users/*.secrets.yaml.age` to deploy trigger paths

#### Resolve-user-config changes

- `deploy/scripts/resolve-user-config.ts`
  - no longer emits per-user secret-name outputs
  - instead emits:
    - shared selectors from `pilot.yaml`
    - deploy metadata (`brain_version`, `content_repo`, domains, etc.)

#### Resolve-deploy-handles changes

- `deploy/scripts/resolve-deploy-handles.ts`
  - treat `users/<handle>.secrets.yaml.age` as a deploy trigger for that handle

#### `.env.schema`

Keep `AI_API_KEY`, `GIT_SYNC_TOKEN`, `MCP_AUTH_TOKEN`, `DISCORD_BOT_TOKEN` listed because Kamal still needs actual env vars. Update comments to explain they come from either:

- decrypted override file, or
- shared GitHub Secret fallback

### Discord-first default

Scaffolded pilot users should default to:

```yaml
discord:
  enabled: true
```

Update:

- `templates/rover-pilot/users/alice.yaml`
- onboarding docs
- operator playbook
- tests that assume Discord is off by default

This does **not** force every existing migrated user to enable Discord. It only changes the default scaffold and the operator guidance.

### Init / gitignore changes

- generated `.gitignore` should ignore plaintext `users/*.secrets.yaml`
- encrypted `users/*.secrets.yaml.age` remains tracked

### Package dependencies

- `packages/brains-ops/package.json` — add `age-encryption`
- `templates/rover-pilot/package.json` — add `age-encryption`

## New operator flow

### One-time fleet setup

Add automation similar to the SSH bootstrap flow.

Preferred UX:

```sh
bunx brains-ops age-key:bootstrap <repo> --push-to gh
```

Expected behavior:

1. create or reuse a repo-local age identity under an ignored path such as `.brains-ops/age/identity.txt`
2. derive the matching public recipient
3. write/update `pilot.yaml.agePublicKey`
4. push the private identity to GitHub as `AGE_SECRET_KEY` when `--push-to gh` is used
5. refuse silent key drift unless an explicit regen/force mode is requested later

Why keep a local canonical copy?

- it matches the existing SSH bootstrap ergonomics
- it makes the fleet key type unambiguous
- it allows safe re-push / drift detection / recovery
- it keeps operator setup reproducible

Technically the age key does not have to live locally forever, but for this fleet we should treat the operator-local ignored copy as the canonical source, just like other repo-local bootstrap artifacts.

### Per-user onboarding

```sh
bun install
bunx brains-ops secrets:encrypt <repo> <handle>
git add users/<handle>.secrets.yaml.age
git commit && git push
bunx brains-ops onboard <repo> <handle>
```

Operationally:

1. add/edit `users/<handle>.yaml`
2. add user to cohort
3. keep raw secret material operator-local for now (`.env.local`, file-backed vars, or equivalent local inputs)
4. ensure local env has shared secrets plus any cohort/user override source keys
5. run `secrets:encrypt`
6. commit encrypted file
7. run `onboard`
8. CI deploys using decrypted overrides + shared fallback

This means the operator local machine is the temporary source of truth for raw user secret material, while the repo becomes the durable source of truth for encrypted per-user deploy secrets.

## Migration for the real `~/Documents/rover-pilot` repo

This repo needs an explicit migration sequence.

### Phase 1: upgrade contract, no secret deletion yet

1. bump `@rizom/ops` to age-capable version
2. run `brains-ops age-key:bootstrap ~/Documents/rover-pilot --push-to gh`
3. re-scaffold deploy contract files via `brains-ops init`
4. update `pilot.yaml`:
   - confirm `agePublicKey`
   - add `gitSyncToken`
   - add `mcpAuthToken`
   - keep existing `brainVersion` unchanged
5. commit workflow/script/template changes
6. do **not** delete old GitHub Secrets yet

### Phase 2: generate encrypted files for existing users

For each existing user in `~/Documents/rover-pilot`:

1. inspect effective override source:
   - user override > cohort override > pilot shared selector
2. run `bunx brains-ops secrets:encrypt ~/Documents/rover-pilot <handle>`
3. verify resulting `users/<handle>.secrets.yaml.age`
   - contains Discord token if Discord enabled
   - contains AI/Git/MCP only when overridden from shared
4. run `bunx brains-ops onboard ~/Documents/rover-pilot <handle>`
5. verify generated `users/<handle>/.env` no longer contains `*_SECRET` lines

### Phase 3: push and verify deploy path

1. commit `.age` files and regenerated user config
2. push
3. verify deploy workflow succeeds end-to-end
4. confirm deployed instances still have:
   - Discord access
   - MCP auth
   - content sync

### Phase 4: remove legacy GitHub Secrets

Only after all users are migrated and deploys are green:

- delete old handle-suffixed secrets such as `GIT_SYNC_TOKEN_ALICE`
- keep shared GitHub Secrets (`AI_API_KEY`, `GIT_SYNC_TOKEN`, `MCP_AUTH_TOKEN`, infra secrets)

## Implementation order

1. Update this plan and lock the shared-by-default model
2. Schema changes:
   - add `pilot.gitSyncToken`
   - add `pilot.mcpAuthToken`
   - add `pilot.agePublicKey`
   - retain/add cohort/user override selector fields
3. New `secrets-encrypt.ts`
4. CLI rename to `secrets:encrypt`
5. Simplify generated `.env`
6. Simplify `content-repo.ts`
7. Deploy workflow + decrypt script
8. Discord-default scaffold/doc updates
9. Tests
10. Migrate `~/Documents/rover-pilot`

## Tests to update

### Replace

- `test/secrets-push.test.ts` → `test/secrets-encrypt.test.ts`
  - encrypts `.age` file
  - round-trip decrypt test
  - Discord token included when enabled
  - AI/Git/MCP included only when overridden
  - dry-run
  - plaintext deletion

### Update

- `test/cli.test.ts`
  - `secrets:push` → `secrets:encrypt`
  - generated `.env` assertions remove `*_SECRET` lines
  - scaffold/default Discord expectations update

- `test/load-registry.test.ts`
  - add `agePublicKey`, `gitSyncToken`, `mcpAuthToken` to `pilot.yaml`
  - keep override precedence tests for user/cohort/shared resolution

- `test/reconcile.test.ts`
  - `.env` content assertions simplify
  - runner assertions should no longer depend on generated selector lines

- deploy script/workflow tests
  - decrypt + fallback behavior
  - changed-handle detection for `.age` files

## Verification

1. `cd packages/brains-ops && bun test`
2. `cd packages/brains-ops && bun run typecheck`
3. `cd packages/brains-ops && bun run lint`
4. In a temp pilot repo:
   - generate age keypair
   - set `pilot.agePublicKey`
   - run `secrets:encrypt`
   - verify `.age` file written and plaintext deleted
   - run `onboard`
   - verify `.env` contains no secret selectors
5. In real `~/Documents/rover-pilot`:
   - migrate one low-risk user first
   - push and verify deploy
   - then migrate remaining users

## Risks

- **Mismatch between shared defaults and encrypted overrides**
  - mitigate by resolving effective selectors in one place inside `secrets:encrypt`
- **Duplicate cohort override values across multiple user `.age` files**
  - acceptable tradeoff for simpler deploy logic
- **Discord default change surprises operators**
  - mitigate with doc updates and clear scaffold comments
- **Lost migration window**
  - do not delete old handle-suffixed GitHub Secrets until all users are migrated and verified
