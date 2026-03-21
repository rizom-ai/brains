# Plan: Enable-Based Presets for brain.yaml

## Context

Brain models define all their capabilities (Rover has 23 plugins). brain.yaml uses `disable: [list]` to opt out. This is backwards — when mylittlephoney only wants 16 of Rover's 23 plugins, it lists 7 things to disable. Eval configs disable 8. You reason about what you DON'T want instead of what you DO.

**Goal**: Brain models define named presets (curated enable lists). brain.yaml picks a preset and optionally fine-tunes with `add`/`remove`.

## Design

### brain.yaml (instance)

```yaml
brain: "@brains/rover"
preset: minimal # Pick a curated subset
add: [obsidian-vault, discord] # Add on top
remove: [analytics] # Remove from preset
```

- `preset` selects a named enable list from the brain model
- `add` adds IDs on top of the preset (must exist in brain definition)
- `remove` removes IDs from the preset
- `disable` kept for backward compat (works when no `preset` specified)
- No `preset` + no `disable` = all enabled (current behavior)

### Brain model (definition)

```typescript
export default defineBrain({
  name: "rover",
  version: "1.0.0",
  defaultPreset: "minimal",  // new users get a working baseline
  presets: {
    minimal: [
      "system", "note", "link", "wishlist",
      "directory-sync", "git-sync",
      "mcp", "discord", "a2a",
    ],
    default: [
      // minimal +
      "system", "note", "link", "wishlist",
      "directory-sync", "git-sync",
      "mcp", "discord", "a2a",
      // content & site
      "image", "dashboard", "blog", "analytics",
      "obsidian-vault", "site-builder", "webserver",
    ],
    pro: [
      // default +
      "system", "image", "dashboard", "blog", "note", "link",
      "portfolio", "decks", "topics",
      "content-pipeline", "social-media", "newsletter",
      "obsidian-vault", "wishlist", "analytics",
      "directory-sync", "git-sync", "site-builder",
      "mcp", "matrix", "discord", "webserver", "a2a",
    ],
    eval: [
      "system", "image", "blog", "decks", "note", "link", "portfolio",
      "topics", "directory-sync", "site-builder",
      "mcp",
    ],
  },
  capabilities: [...],
  interfaces: [...],
});
```

- Every preset is explicitly defined — no magic "all capabilities" virtual preset.
- Brain models must define at least `minimal` and `default`. `minimal` is headless/conversational (notes + chat). `default` is the local workflow stack (content creation + website). Other names are freeform (`pro`, `eval`, etc.).
- `defaultPreset` defaults to `"minimal"` if omitted. New users get a working baseline and explicitly opt into more.
- Adding a new capability to the brain model doesn't auto-include it anywhere — you must add its ID to the relevant presets.

### Resolver logic

```
1. Collect all known IDs from definition.capabilities + definition.interfaces
2. Determine preset name:
     → overrides.preset > definition.defaultPreset > "minimal"
3. If preset found in definition.presets:
     → activeIds = Set(preset IDs)
     → apply add (union, only IDs that exist in brain definition)
     → apply remove (difference)
4. Else if overrides.disable exists (legacy, no presets defined):
     → activeIds = all IDs minus disable set
5. Else:
     → error: brain must define at least a "minimal" preset
6. Filter capabilities/interfaces to activeIds set
```

## Steps

### Step 1: Types + schema

- `brain-definition.ts`: add `presets?: Record<string, string[]>` and `defaultPreset?: string` to `BrainDefinition`
- `instance-overrides.ts`: add `preset`, `add`, `remove` to Zod schema (keep `disable`)
- `index.ts`: export new types

### Step 2: Resolver refactor

- `brain-resolver.ts`: extract `resolveActiveIds(definition, overrides) → Set<string>`
- Replace `disableSet` with `activeIds`, flip filter from `has → skip` to `!has → skip`
- Site plugin check also uses `activeIds`

### Step 3: Tests

- `instance-overrides.test.ts`: parse preset/add/remove from YAML
- `brain-definition.test.ts`: resolve with presets, add/remove, backward compat, unknown preset warning

### Step 4: Add presets to brain models

- `brains/rover/src/index.ts`: default, minimal, eval
- `brains/ranger/src/index.ts`: default, minimal, eval
- `brains/relay/src/index.ts`: default, minimal, eval

### Step 5: Migrate brain.yaml files

Since `defaultPreset: "minimal"`, existing production/dev configs that want the full setup now need `preset: default`:

- `apps/professional-brain/brain.yaml`: add `preset: pro`
- `apps/professional-brain/deploy/brain.yaml`: add `preset: pro`
- `apps/professional-brain/brain.eval.yaml`: `disable: [...]` → `preset: eval`
- `apps/collective-brain/brain.yaml`: add `preset: default`
- `apps/collective-brain/deploy/brain.yaml`: add `preset: default`
- `apps/collective-brain/brain.eval.yaml`: `disable: [...]` → `preset: eval`
- `apps/team-brain/brain.yaml`: add `preset: default`
- `apps/team-brain/deploy/brain.yaml`: add `preset: default`
- `apps/mylittlephoney/brain.yaml`: `disable: [...]` → `preset: default` + `add: [decks]`

## Key files

| File                                        | Change                                         |
| ------------------------------------------- | ---------------------------------------------- |
| `shell/app/src/brain-definition.ts`         | Add presets + defaultPreset to BrainDefinition |
| `shell/app/src/instance-overrides.ts`       | Add preset, add, remove to schema              |
| `shell/app/src/brain-resolver.ts`           | resolveActiveIds() replacing disableSet        |
| `shell/app/src/index.ts`                    | Export new types                               |
| `shell/app/test/instance-overrides.test.ts` | Preset parsing tests                           |
| `shell/app/test/brain-definition.test.ts`   | Resolver preset tests                          |
| `brains/rover/src/index.ts`                 | Define presets                                 |
| `brains/ranger/src/index.ts`                | Define presets                                 |
| `brains/relay/src/index.ts`                 | Define presets                                 |
| `apps/*/brain.eval.yaml`                    | Migrate to preset syntax                       |
| `apps/mylittlephoney/brain.yaml`            | Migrate to preset syntax                       |

## Verification

1. `bun run typecheck`
2. `bun test` — all existing + new preset tests pass
3. Existing brain.yaml files without `preset` still work unchanged
4. `brain.eval.yaml` with `preset: eval` produces the same plugin set as the old `disable` list
5. Start professional-brain locally, verify all plugins load
