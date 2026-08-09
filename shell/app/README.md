# @brains/app

Application runtime that resolves a `BrainDefinition` plus instance overrides into `AppConfig`, initializes the shell, and owns application lifecycle.

## Public responsibilities

- `defineBrain()` — typed definition authoring
- `defineBundle()` / `resolveBundleSelection()` — deterministic bundle composition
- `parseInstanceOverrides()` — strict `brain.yaml` validation
- `resolve()` — fresh plugin/interface instantiation and config composition
- `App` / `handleCLI()` — initialization and execution
- package and local site/theme/content registration
- static generated entrypoints for standalone builds

## Resolution

For the canonical definition, instances select explicit bundles. Definition order controls membership, config, instructions, eval exclusions, and permission contributions. Resolution applies eval exclusions, `add`, and `remove`, then merges instance overrides. Removed members contribute no attached policy.

Capability callbacks receive:

```ts
interface CapabilityContext {
  bundles: readonly string[];
}
```

Arrays are replaced unless a typed composition rule explicitly defines another behavior.

## Instance parsing

`parseInstanceOverrides()` validates known fields strictly and throws `InstanceOverridesParseError` with field paths. Unknown or retired fields are rejected rather than silently ignored.

```yaml
brain: brain
bundles:
  - core
  - site
plugins:
  directory-sync:
    seedContentPath: ./seed-content
```

## Definition authoring

```ts
import { defineBrain, defineBundle } from "@brains/app";

const core = defineBundle({ id: "core", members: ["note", "mcp"] });

export default defineBrain({
  name: "example",
  version: "1.0.0",
  capabilities: [["note", notePlugin, {}]],
  interfaces: [["mcp", MCPInterface, mapMcpEnv]],
  bundles: [core],
});
```

External authors should use the published `@rizom/brain` contracts rather than importing shell internals.

## Turso-to-libSQL rollback

Rollback is an explicit break-glass operation. Stop the app, run:

```bash
brain-rollback-entities-to-libsql
```

Then set `BRAINS_DB_ENGINE=libsql` and restart. The command removes Turso's
native entity FTS index, checkpoints the compatible SQLite file, and rebuilds
the libSQL FTS5 keyword index from the durable `entities` table.
