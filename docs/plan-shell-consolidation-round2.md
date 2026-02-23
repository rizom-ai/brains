# Shell Package Consolidation: Round 2

## Context

Continuing the shell consolidation effort. Previous round merged agent-service → ai-service (17 → 16 packages). This round merges 3 more small packages into natural hosts, reducing 16 → 13.

**Merges:**

1. **identity-service + profile-service** → `identity-service` with type renames
2. **embedding-service → entity-service** (embeddings exist solely for entity search)

3. **daemon-registry → split**: types into plugins (contract), implementation into core (wiring). PluginManager refactored to receive DaemonRegistry via DI instead of creating it.

**Not merging:** mcp-service (ai-service depends on it; can't move without cycles).

---

## Merge 1: identity-service + profile-service → identity-service

Both are singleton entity wrappers with identical patterns. Merging under `@brains/identity-service` as the umbrella. To avoid naming collisions, rename internal types:

### Type renames

| Old                         | New                               |
| --------------------------- | --------------------------------- |
| `IdentityBody`              | `BrainCharacter`                  |
| `IdentityEntity`            | `BrainCharacterEntity`            |
| `IdentityService`           | `BrainCharacterService`           |
| `IdentityAdapter`           | `BrainCharacterAdapter`           |
| `identitySchema`            | `brainCharacterSchema`            |
| `identityBodySchema`        | `brainCharacterSchema`            |
| `identityFrontmatterSchema` | `brainCharacterFrontmatterSchema` |
| `ProfileBody`               | `AnchorProfile`                   |
| `ProfileEntity`             | `AnchorProfileEntity`             |
| `ProfileService`            | `AnchorProfileService`            |
| `ProfileAdapter`            | `AnchorProfileAdapter`            |
| `profileSchema`             | `anchorProfileSchema`             |
| `profileBodySchema`         | `anchorProfileSchema`             |
| `profileFrontmatterSchema`  | `anchorProfileFrontmatterSchema`  |

### File renames + moves

| From                                             | To                                                      |
| ------------------------------------------------ | ------------------------------------------------------- |
| `identity-service/src/schema.ts`                 | `identity-service/src/brain-character-schema.ts`        |
| `identity-service/src/identity-service.ts`       | `identity-service/src/brain-character-service.ts`       |
| `identity-service/src/adapter.ts`                | `identity-service/src/brain-character-adapter.ts`       |
| `identity-service/test/identity-service.test.ts` | `identity-service/test/brain-character-service.test.ts` |
| `identity-service/test/adapter.test.ts`          | `identity-service/test/brain-character-adapter.test.ts` |
| `profile-service/src/schema.ts`                  | `identity-service/src/anchor-profile-schema.ts`         |
| `profile-service/src/profile-service.ts`         | `identity-service/src/anchor-profile-service.ts`        |
| `profile-service/src/adapter.ts`                 | `identity-service/src/anchor-profile-adapter.ts`        |
| `profile-service/test/profile-service.test.ts`   | `identity-service/test/anchor-profile-service.test.ts`  |
| `profile-service/test/adapter.test.ts`           | `identity-service/test/anchor-profile-adapter.test.ts`  |

### Internal import updates

All `from "./schema"` / `from "./adapter"` within renamed files → new filenames.
All type names updated to new names within the files themselves.

### Update identity-service/src/index.ts

Export all new names. Keep backward-compatible type aliases for the transition:

```typescript
// Brain character (was: identity)
export { BrainCharacterService } from "./brain-character-service";
export { BrainCharacterAdapter } from "./brain-character-adapter";
export { brainCharacterSchema } from "./brain-character-schema";
export type {
  BrainCharacter,
  BrainCharacterEntity,
} from "./brain-character-schema";

// Anchor profile (was: profile)
export { AnchorProfileService } from "./anchor-profile-service";
export { AnchorProfileAdapter } from "./anchor-profile-adapter";
export { anchorProfileSchema } from "./anchor-profile-schema";
export type {
  AnchorProfile,
  AnchorProfileEntity,
} from "./anchor-profile-schema";
```

### External consumer updates

**`@brains/identity-service` consumers** (type renames):

- `shell/ai-service/src/agent-service.ts`: `IdentityService as IIdentityService` → `BrainCharacterService`
- `shell/ai-service/src/brain-agent.ts`: `IdentityBody` → `BrainCharacter`
- `shell/ai-service/test/agent-service.test.ts`: same
- `shell/core/src/config/shellConfig.ts`: `IdentityBody` → `BrainCharacter`
- `shell/core/src/initialization/shellInitializer.ts`: `IdentityAdapter, IdentityService` → `BrainCharacterAdapter, BrainCharacterService`
- `shell/core/test/startup-initialization-order.test.ts`: `IdentityService` → `BrainCharacterService`
- `shell/app/src/types.ts`: `identityBodySchema` → `brainCharacterSchema`
- `shell/plugins/src/core/context.ts`: `IdentityBody` → `BrainCharacter`
- `shell/plugins/src/interfaces.ts`: `IdentityBody` → `BrainCharacter`
- `shell/plugins/src/test/mock-shell.ts`: `IdentityBody` → `BrainCharacter`
- `shell/plugins/src/index.ts`: update re-exports

**`@brains/profile-service` consumers** (package + type renames):

- `shell/core/src/config/shellConfig.ts`: `ProfileBody` → `AnchorProfile` from `@brains/identity-service`
- `shell/core/src/initialization/shellInitializer.ts`: `ProfileAdapter, ProfileService` → `AnchorProfileAdapter, AnchorProfileService` from `@brains/identity-service`
- `shell/plugins/src/core/context.ts`: `ProfileBody` → `AnchorProfile` from `@brains/identity-service`
- `shell/plugins/src/interfaces.ts`: `ProfileBody` → `AnchorProfile` from `@brains/identity-service`
- `shell/plugins/src/test/mock-shell.ts`: `ProfileBody` → `AnchorProfile` from `@brains/identity-service`
- `shell/plugins/src/index.ts`: update re-exports
- `plugins/site-builder`, `plugins/blog`, `plugins/professional-site`: update imports + package.json

**package.json updates:**

- `shell/plugins`: remove `@brains/profile-service` from deps, promote `@brains/identity-service` from devDep to dep
- `shell/core`: remove `@brains/profile-service` from devDeps
- `plugins/site-builder`, `plugins/blog`, `plugins/professional-site`: `@brains/profile-service` → `@brains/identity-service`

### Delete `shell/profile-service/`

### Verify: typecheck, test, lint, commit

---

## Merge 2: embedding-service → entity-service

Embedding-service (3 files) provides embeddings solely for entity search. entity-service is its only runtime consumer.

### File moves

| From                                              | To                                              |
| ------------------------------------------------- | ----------------------------------------------- |
| `embedding-service/src/types.ts`                  | `entity-service/src/embedding-types.ts`         |
| `embedding-service/src/embeddingService.ts`       | `entity-service/src/embedding-service.ts`       |
| `embedding-service/test/embeddingService.test.ts` | `entity-service/test/embedding-service.test.ts` |

### Internal import updates

- `embedding-service.ts`: `from "./types"` → `from "./embedding-types"`
- entity-service files `from "@brains/embedding-service"` → `from "./embedding-types"`:
  - `src/entityService.ts`, `src/entity-search.ts`, `src/handlers/embeddingJobHandler.ts`
- entity-service test files:
  - `test/helpers/mock-services.ts` → `from "../../src/embedding-types"`
  - `test/entity-search-weight.test.ts` → `from "../src/embedding-types"`
- `embedding-service.test.ts`: update imports to `../src/embedding-service` and `../src/embedding-types`

### Update entity-service exports + deps

- `src/index.ts`: add `export { EmbeddingService }` and `export type { IEmbeddingService }`
- `package.json`: add `"fastembed": "^1.14.4"`, remove `@brains/embedding-service`

### External consumer updates

- `shell/core/src/initialization/shellInitializer.ts`: `from "@brains/embedding-service"` → `from "@brains/entity-service"`
- `shell/core/src/types/shell-types.ts`: same
- `shell/core/src/index.ts`: update re-export source
- `shell/core/package.json`: remove `@brains/embedding-service` from devDeps
- `shell/plugins/src/index.ts`: ensure `EmbeddingService` + `IEmbeddingService` re-exported from `@brains/entity-service`

### Delete `shell/embedding-service/`

### Verify: typecheck, test, lint, commit

---

## Merge 3: daemon-registry → split (types → plugins, impl → core)

daemon-registry has 1 implementation file + 1 test. Currently PluginManager calls `DaemonRegistry.getInstance()` directly. Refactor to DI: core creates the instance, passes it to PluginManager.

### Types stay in plugins

The `Daemon`, `DaemonHealth`, `DaemonStatusInfo` types and `DaemonHealthSchema`, `DaemonStatusInfoSchema` schemas move into plugins. Create `plugins/src/manager/daemon-types.ts` with the type definitions extracted from `daemonRegistry.ts`.

### Implementation moves to core

Move `DaemonRegistry` class to `core/src/daemon-registry.ts`. It imports its types from `@brains/plugins`.

### DI refactor in PluginManager

- `pluginManager.ts` line 71: `DaemonRegistry.getInstance(logger)` → receive via constructor parameter
- `getInstance(logger)` → `getInstance(logger, daemonRegistry)`
- `createFresh(logger)` → `createFresh(logger, daemonRegistry)`
- `PluginLifecycle` already receives DaemonRegistry via DI (no change needed)

### ShellInitializer wiring

`shellInitializer.ts` already creates DaemonRegistry — just pass it to PluginManager:

```typescript
const daemonRegistry = DaemonRegistry.getInstance(logger);
const pluginManager = PluginManager.getInstance(logger, daemonRegistry);
```

### Update plugins exports

`plugins/src/index.ts`: add `Daemon`, `DaemonHealth`, `DaemonStatusInfo`, `DaemonHealthSchema`, `DaemonStatusInfoSchema` exports (from `./manager/daemon-types`). Remove `DaemonRegistry` re-export (it now lives in core).

### External consumer updates (`@brains/daemon-registry` → `@brains/plugins` or `@brains/core`)

**Types** (Daemon, DaemonHealth) → from `@brains/plugins`:

- `interfaces/cli/src/cli-interface.ts`
- `interfaces/matrix/src/lib/matrix-interface.ts`
- `interfaces/mcp/src/mcp-interface.ts`
- `plugins/examples/src/interface-plugin-example.ts`

**Implementation** (DaemonRegistry) → from local `./daemon-registry` in core:

- `shell/core/src/initialization/shellInitializer.ts`
- `shell/core/src/types/shell-types.ts`
- `shell/core/src/shell.ts`

### package.json updates

- `shell/core`: remove `@brains/daemon-registry` from devDeps
- `shell/plugins`: remove `@brains/daemon-registry` from deps (if listed)

### Delete `shell/daemon-registry/`

### Verify: typecheck, test, lint, commit

---

## Update codebase-map.html

- Remove `embedding` node (absorbed into entity-service)
- Remove `daemons` node (split into core + plugins)
- Merge `identity` + `profile` nodes → single "Identity" node
- Update prompt text

---

## Execution order

1. Merge 1: identity + profile with renames (largest, most files to touch)
2. Merge 2: embedding → entity-service
3. Merge 3: daemon-registry split (types → plugins, impl → core)
4. Update codebase-map.html
5. Final full verification

Each merge: typecheck → test → lint → commit independently.

Shell packages: 16 → 13.
