# Plan: move `.env` secrets to Bitwarden via Varlock

## Goal

Stop copying `.env` files between machines and environments. Keep secret contracts in git with Varlock schemas, and resolve actual secret values from Bitwarden Secrets Manager at runtime.

## 1. Use Bitwarden Secrets Manager

Prefer Bitwarden Secrets Manager over regular Bitwarden vault items because Varlock has a first-class plugin for it:

```env
# @plugin(@varlock/bitwarden-plugin)
```

The plugin uses a Bitwarden machine account access token supplied as `BITWARDEN_ACCESS_TOKEN`.

Fallback: regular Bitwarden CLI reads via `exec(...)`, but that is less portable and harder to use in CI.

## 2. Inventory existing local env files

Migrate the keys from current local secret files, without committing or pasting secret values:

```text
apps/yeehaa.io/.env
apps/rizom-foundation/.env
shell/ai-evaluation/.env
shell/ai-evaluation/evals/.env
brains/*/test-apps/*/.env
```

Keep values local during migration. Only commit schemas and documentation.

## 3. Create Bitwarden project structure

Suggested Bitwarden Secrets Manager layout:

```text
brains / yeehaa.io / dev
brains / yeehaa.io / prod
brains / rizom-foundation / dev
brains / eval
```

Use secret names that match environment variable names:

```text
AI_API_KEY
GIT_SYNC_TOKEN
MCP_AUTH_TOKEN
DISCORD_BOT_TOKEN
CLOUDFLARE_API_TOKEN
```

After creating each secret, copy its Bitwarden secret UUID for use in the Varlock schema.

## 4. Add app-level `.env.schema` files

Each app/environment should have its own schema that maps env vars to Bitwarden secret UUIDs.

Example:

```env
# This env file uses @env-spec - see https://varlock.dev/env-spec
#
# @plugin(@varlock/bitwarden-plugin)
# @initBitwarden(accessToken=$BITWARDEN_ACCESS_TOKEN)
# @defaultRequired=false @defaultSensitive=false
# ----------

# Bootstrap token supplied by shell/CI only
# @required @sensitive @type=bitwardenAccessToken
BITWARDEN_ACCESS_TOKEN=

# @required @sensitive
AI_API_KEY=bitwarden("UUID_HERE")

# @required @sensitive
GIT_SYNC_TOKEN=bitwarden("UUID_HERE")

# @sensitive
MCP_AUTH_TOKEN=bitwarden("UUID_HERE")
```

Keep model-level schemas as contracts. Use app-level schemas for actual secret source wiring.

## 5. Install the Varlock Bitwarden plugin

At repo root:

```bash
bun add -D @varlock/bitwarden-plugin
```

Alternative if avoiding a repo dependency: pin the plugin version in each schema:

```env
# @plugin(@varlock/bitwarden-plugin@1.0.0)
```

## 6. Local development workflow

Set only the Bitwarden machine account token locally:

```bash
export BITWARDEN_ACCESS_TOKEN=...
```

Run apps through Varlock:

```bash
cd apps/yeehaa.io
bunx varlock run --path .env.schema -- brain start
```

Optional later improvement: add package scripts or shell aliases for common app starts.

## 7. CI/deploy workflow

Store only this bootstrap secret in CI/deploy secret storage:

```text
BITWARDEN_ACCESS_TOKEN
```

Then resolve environment values with Varlock:

```bash
npx -y varlock load --path .env.schema --format json --compact
```

or run commands with injected values:

```bash
npx -y varlock run --path .env.schema -- your-command
```

## 8. Cleanup after validation

After schemas are filled with UUIDs and local runs pass:

```bash
rm apps/yeehaa.io/.env
rm apps/rizom-foundation/.env
```

Keep templates and schemas tracked:

```text
.env.example
.env.schema
```

Run a secret scan:

```bash
bunx varlock scan
```

## 9. Documentation to maintain

Add or expand docs with:

- how to create/get `BITWARDEN_ACCESS_TOKEN`
- how to add a new Bitwarden secret
- how to find secret UUIDs
- local run commands
- CI/deploy expectations
- reminder to never commit `.env` files

## Proposed first implementation slice

1. Add `@varlock/bitwarden-plugin`.
2. Add `apps/yeehaa.io/.env.schema` with UUID placeholders.
3. Add `apps/rizom-foundation/.env.schema` with UUID placeholders.
4. Keep existing `.env` files untouched until UUIDs are filled and tested locally.
5. Delete local `.env` files only after validation succeeds.
