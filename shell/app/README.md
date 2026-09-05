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

For the canonical definition, instances select explicit bundles. Definition order controls membership, config, instructions, eval exclusions, and permission contributions. Policy-only bundles may target any member of the definition catalog, but contributions attach only while that member is active. Resolution applies eval exclusions, `add`, and `remove`, then merges instance overrides. Removed members contribute no attached policy.

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
  - web
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

## Database storage (0.3)

Every runtime database uses local Turso, including authentication. Only `file:`
URLs are supported. There is no engine selector, remote libSQL path, or runtime
fallback; `BRAINS_DB_ENGINE` no longer changes the engine.

The 0.2 release line remains on libSQL. Its data must be imported offline into a
new directory before starting 0.3; the runtime rejects legacy FTS5 entity files
rather than opening libSQL to rewrite them. Migration tooling and verified Turso
backup/restore remain release gates. Never use SQLite/libSQL tooling to capture
an active Turso database.
