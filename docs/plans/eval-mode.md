# Plan: Eval Mode (replaces eval preset)

## Context

Eval is currently a preset — a fixed list of plugins. But eval isn't a capability choice, it's a safety constraint: "run this preset without chat interfaces, auto-push, or external services." Maintaining a separate eval plugin list drifts out of sync with other presets.

## Design

Replace `preset: eval` with `mode: eval` that can layer on top of any preset.

```yaml
preset: default
mode: eval
```

The brain model defines which plugins are **unsafe for eval** (instead of which are included):

```typescript
export default defineBrain({
  name: "rover",
  presets: { minimal, default: standard, pro },
  evalDisable: [
    "matrix",
    "discord",
    "analytics",
    "dashboard",
    "content-pipeline",
    "newsletter",
    "webserver",
  ],
  // ...
});
```

`mode: eval` applies `evalDisable` as a remove list on top of whatever preset is selected. Any preset works in eval mode.

### brain.yaml

```yaml
# Before
preset: eval

# After
preset: default
mode: eval
```

### Resolution

```
1. Resolve preset → activeIds
2. If mode === "eval": remove all IDs in definition.evalDisable
3. Apply add/remove as usual
```

### What gets disabled in eval

Plugins that have side effects outside the brain:

- Chat interfaces (matrix, discord) — sends messages to real users
- Analytics — sends data to Cloudflare
- Content pipeline — auto-generates and publishes
- Newsletter — sends emails
- Webserver — serves public site
- Dashboard — not needed without webserver

### What stays enabled

Everything else — the eval tests tool execution, entity CRUD, AI generation, site building (to disk, not served). The full capability set minus external side effects.

## Steps

1. Add `evalDisable: string[]` to `BrainDefinition`
2. Add `mode: z.enum(["eval"]).optional()` to instance overrides schema
3. Update `resolveActiveIds()` in brain-resolver to apply evalDisable when mode is eval
4. Remove `eval` from rover/ranger/relay preset definitions
5. Update `brain.eval.yaml` files: `preset: eval` → `preset: default` + `mode: eval`
6. Tests

## Key files

| File                                  | Change                                |
| ------------------------------------- | ------------------------------------- |
| `shell/app/src/brain-definition.ts`   | Add `evalDisable` to BrainDefinition  |
| `shell/app/src/instance-overrides.ts` | Add `mode` field                      |
| `shell/app/src/brain-resolver.ts`     | Apply evalDisable in resolveActiveIds |
| `brains/rover/src/index.ts`           | Remove eval preset, add evalDisable   |
| `brains/ranger/src/index.ts`          | Same                                  |
| `brains/relay/src/index.ts`           | Same                                  |
| `apps/*/brain.eval.yaml`              | `preset: default` + `mode: eval`      |

## Verification

1. `bun run typecheck` / `bun test`
2. `brain.eval.yaml` with `preset: pro` + `mode: eval` produces pro plugins minus chat/analytics/etc.
3. `brain.eval.yaml` with `preset: minimal` + `mode: eval` produces minimal minus discord
4. Eval suite passes with same behavior as before
