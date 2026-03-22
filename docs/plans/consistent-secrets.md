# Plan: Consistent Secret Handling — All Secrets in brain.yaml

## Context

Secrets currently flow through two paths:

1. **Env mappers** (TypeScript in brain model): `MATRIX_ACCESS_TOKEN`, `DISCORD_BOT_TOKEN`, `MCP_AUTH_TOKEN`, `LINKEDIN_ACCESS_TOKEN`, `BUTTONDOWN_API_KEY`, `CLOUDFLARE_*`
2. **brain.yaml `${...}` interpolation**: `GIT_SYNC_TOKEN`, `A2A_TOKEN_*`

This is confusing — two mechanisms for the same thing. The fix: **all secrets in brain.yaml via `${...}`**. Brain models become secret-free.

## Why brain.yaml, not env mappers

- A2A tokens have per-instance structure (`{ ${TOKEN}: identity }`) that can't be expressed in an env mapper
- brain.yaml `${...}` already handles this correctly (interpolates both values and keys)
- brain.yaml is the single instance config file — secrets should live next to the config that uses them
- Brain models become truly reusable — no env var names baked in

## Design

### Before (mixed)

```typescript
// Brain model — knows env var names
["discord", DiscordInterface, (env) =>
  env["DISCORD_BOT_TOKEN"] ? { botToken: env["DISCORD_BOT_TOKEN"] } : null
],
```

```yaml
# brain.yaml — also has secrets
plugins:
  directory-sync:
    git:
      authToken: ${GIT_SYNC_TOKEN}
```

### After (consistent)

```typescript
// Brain model — secret-free, just default config
["discord", DiscordInterface, () => ({})],
```

```yaml
# brain.yaml — ALL secrets here
plugins:
  discord:
    botToken: ${DISCORD_BOT_TOKEN}
  matrix:
    accessToken: ${MATRIX_ACCESS_TOKEN}
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
  directory-sync:
    git:
      authToken: ${GIT_SYNC_TOKEN}
  social-media:
    linkedin:
      accessToken: ${LINKEDIN_ACCESS_TOKEN}
  newsletter:
    buttondown:
      apiKey: ${BUTTONDOWN_API_KEY}
  analytics:
    cloudflare:
      accountId: ${CLOUDFLARE_ACCOUNT_ID}
      apiToken: ${CLOUDFLARE_API_TOKEN}
      siteTag: ${CLOUDFLARE_ANALYTICS_SITE_TAG}
  a2a:
    trustedTokens:
      ${A2A_TOKEN_YEEHAA}: yeehaa
```

### Skip-when-missing

Currently env mappers return `null` to skip an interface when credentials are absent. With all secrets in brain.yaml, the interpolation removes undefined `${...}` entries. The resolver needs to gracefully handle this.

**Approach**: If an interface/plugin fails schema validation after config merge (missing required field), log a warning and skip it — don't crash.

```typescript
// In brain-resolver.ts, wrap construction in try/catch
try {
  interfaces.push(new ctor(merged));
} catch (error) {
  // Missing required config (e.g. no botToken) → skip gracefully
  logger.warn(`Skipping interface "${id}": ${error.message}`);
}
```

This replaces the explicit `null` return pattern. If `DISCORD_BOT_TOKEN` isn't in `.env`, the `botToken` field is removed by interpolation, schema validation fails, interface is skipped with a warning.

## Steps

### Step 1: Update brain-resolver to skip on validation failure

- `brain-resolver.ts`: wrap capability and interface construction in try/catch
- On validation error: log warning, skip (don't crash)
- Test: missing required field → skipped with warning

### Step 2: Simplify brain model env mappers

- `brains/rover/src/index.ts`: all env mappers become `() => ({})` or removed
- `brains/ranger/src/index.ts`: same
- `brains/relay/src/index.ts`: same
- Remove all `env["..."]` references from brain models

### Step 3: Move secrets to brain.yaml

- All `apps/*/brain.yaml` and `apps/*/deploy/brain.yaml`: add `${...}` references for every secret their plugins need
- Remove `${...}` interpolation removal — it stays, just used more broadly now

### Step 4: Update .env.example files

- Each app's `.env.example` should list ALL secrets the brain.yaml references

## Key files

| File                              | Change                                              |
| --------------------------------- | --------------------------------------------------- |
| `shell/app/src/brain-resolver.ts` | Try/catch on construction, skip on validation error |
| `brains/rover/src/index.ts`       | Remove all `env["..."]` from env mappers            |
| `brains/ranger/src/index.ts`      | Same                                                |
| `brains/relay/src/index.ts`       | Same                                                |
| `apps/*/brain.yaml`               | Add `${...}` for all secrets                        |
| `apps/*/deploy/brain.yaml`        | Same                                                |
| `apps/*/.env.example`             | List all secret env vars                            |

## What this means for brain.yaml

brain.yaml becomes the **complete** instance config. A new user looks at brain.yaml and sees everything their instance needs — both config and secret references. `.env` is just the values file.

## Verification

1. `bun run typecheck` / `bun test`
2. Start professional-brain locally — all plugins start (secrets in .env)
3. Remove `DISCORD_BOT_TOKEN` from .env → Discord skipped with warning, everything else works
4. All existing brain.yaml files produce identical runtime behavior
