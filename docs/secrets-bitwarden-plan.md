# Plan: move `.env` secrets to Bitwarden via Varlock

## Goal

Stop copying `.env` files between machines and environments. Keep secret contracts in git with Varlock schemas, and resolve actual secret values from Bitwarden Secrets Manager at runtime.

## Status

Implemented and smoke-tested:

- `brain secrets:push --push-to bitwarden`
- Bitwarden project discovery/creation by current instance directory name
- secret create/update via `@bitwarden/sdk-napi` so secret values are not passed on CLI argv
- automatic `.env.schema` rewrite to pinned Varlock Bitwarden refs
- Varlock resolution through `@varlock/bitwarden-plugin@1.0.0`

The CLI package still needs a release before standalone installs/CI that use `@rizom/brain` from npm can use the new command.

## 1. Use Bitwarden Secrets Manager

Use **Bitwarden Secrets Manager**, not regular Password Manager vault items. Varlock has a first-class plugin for Secrets Manager:

```env
# @plugin(@varlock/bitwarden-plugin@1.0.0)
# @initBitwarden(accessToken=$BWS_ACCESS_TOKEN)
```

The plugin uses a Bitwarden machine account access token supplied as `BWS_ACCESS_TOKEN`.

Use separate machine accounts:

- local migration/operator: read/write access
- CI/deploy/runtime: read-only access

## 2. Inventory existing local env files

Migrate keys from current local secret files without committing or pasting secret values:

```text
apps/yeehaa.io/.env
apps/rizom-foundation/.env
shell/ai-evaluation/.env
shell/ai-evaluation/evals/.env
brains/*/test-apps/*/.env
```

Keep values local during migration. Only commit schemas and documentation.

## 3. Bitwarden project structure

Convention: `brain secrets:push --push-to bitwarden` infers the Bitwarden project name from the current instance directory name.

Examples:

```text
/whatever/doc        -> project: doc
/whatever/yeehaa.io  -> project: yeehaa.io
/whatever/relay      -> project: relay
```

Missing projects are created automatically. Secret names match environment variable names:

```text
AI_API_KEY
GIT_SYNC_TOKEN
MCP_AUTH_TOKEN
DISCORD_BOT_TOKEN
CLOUDFLARE_API_TOKEN
KAMAL_SSH_PRIVATE_KEY
```

If separate dev/prod projects are needed, use separate instance directories or perform the initial migration from directories named with the desired project convention.

## 4. App-level `.env.schema` files

Each app/environment should have its own schema mapping env vars to Bitwarden secret UUIDs.

Generated example:

```env
# This env file uses @env-spec - see https://varlock.dev/env-spec
#
# @plugin(@varlock/bitwarden-plugin@1.0.0)
# @initBitwarden(accessToken=$BWS_ACCESS_TOKEN)
# @defaultRequired=false @defaultSensitive=false
# ----------

# Bootstrap token supplied by shell/CI only
# @required @sensitive @type=string
BWS_ACCESS_TOKEN=

# @required @sensitive
AI_API_KEY=bitwarden("UUID_HERE")

# @required @sensitive
GIT_SYNC_TOKEN=bitwarden("UUID_HERE")

# @sensitive
MCP_AUTH_TOKEN=bitwarden("UUID_HERE")
```

Model-level schemas stay as contracts. App-level schemas wire those contracts to real secret sources.

## 5. Push local values to Bitwarden

From the instance directory, with local `.env`, `.env.local`, or process env values available:

```bash
BWS_ACCESS_TOKEN="$(cat /tmp/bws-token)" brain secrets:push --push-to bitwarden --dry-run
BWS_ACCESS_TOKEN="$(cat /tmp/bws-token)" brain secrets:push --push-to bitwarden
```

Behavior:

1. Read expected keys from `.env.schema`.
2. Read local values from `.env`, `.env.local`, and `process.env` using the existing secret loading path.
3. Resolve file-backed secrets such as `KAMAL_SSH_PRIVATE_KEY_FILE` without passing values through argv.
4. Find or create the Bitwarden project named after the current directory.
5. Create or update matching Bitwarden Secrets Manager secrets.
6. Rewrite `.env.schema` with `bitwarden("<uuid>")` refs and Bitwarden plugin bootstrap wiring.

`bws` is required for the push/migration command because it handles project metadata. Secret values are written through the Bitwarden SDK, not through `bws` command arguments.

## 6. Local development workflow

Set only the Bitwarden machine account token locally:

```bash
export BWS_ACCESS_TOKEN=...
```

Run apps through Varlock:

```bash
bunx varlock run --path .env.schema -- brain start
```

Or inspect resolved values without exposing full secret values:

```bash
bunx varlock load --path .env.schema --show-all
```

## 7. CI/deploy workflow

Use a hybrid model: GitHub Actions secrets are only the bootstrap layer, and Bitwarden Secrets Manager is the source of truth.

Store only this bootstrap secret in CI/deploy secret storage:

```text
BWS_ACCESS_TOKEN
```

The GitHub Actions token should usually belong to a read-only Bitwarden machine account. Local migration/push workflows can use a separate read/write machine account token.

Resolve environment values with Varlock:

```bash
bunx varlock@1.1.0 load --path .env.schema --format json --compact > /tmp/varlock-env.json
```

or run commands with injected values:

```bash
bunx varlock@1.1.0 run --path .env.schema -- your-command
```

Keep multiline deploy secrets in Bitwarden and pass them through Varlock JSON, not shell heredocs. This preserves exact newlines for SSH keys and PEM material.

Examples:

```env
# @required @sensitive
KAMAL_SSH_PRIVATE_KEY=bitwarden("UUID_HERE")

# @required @sensitive
CERTIFICATE_PEM=bitwarden("UUID_HERE")

# @required @sensitive
PRIVATE_KEY_PEM=bitwarden("UUID_HERE")
```

CI/deploy scripts should read `/tmp/varlock-env.json` and write the necessary runtime files:

- `KAMAL_SSH_PRIVATE_KEY` → `~/.ssh/...`, then `chmod 600`
- `CERTIFICATE_PEM` and `PRIVATE_KEY_PEM` → cert/key files or `.kamal/secrets`, depending on the deploy path
- other runtime/deploy variables → `.kamal/secrets` or `GITHUB_ENV` as needed

After migration, GitHub Secrets should no longer contain app/runtime secrets like `AI_API_KEY`, `GIT_SYNC_TOKEN`, `MCP_AUTH_TOKEN`, `KAMAL_SSH_PRIVATE_KEY`, `CERTIFICATE_PEM`, or `PRIVATE_KEY_PEM`; those live in Bitwarden.

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

## 9. Release gate

Before relying on this in standalone repos or CI that installs `@rizom/brain` from npm:

1. Add a changeset for `@rizom/brain`.
2. Push `main`.
3. Let CI pass.
4. Let the release workflow publish the next alpha.
5. Verify the published CLI exposes:

```bash
brain secrets:push --push-to bitwarden --dry-run
```

Until then, only the local monorepo checkout has the new command.

## 10. Operator checklist

1. Create/revoke tokens only in Bitwarden Secrets Manager machine accounts.
2. Never paste tokens or secret values into chat or commit history.
3. Use `/tmp/bws-token` with `umask 077` for local operator runs.
4. Run `--dry-run` first.
5. Run the real push.
6. Verify `.env.schema` refs.
7. Verify Varlock resolution.
8. Rotate temporary/write-capable tokens when finished.
