# AI Package Merge + tsconfig Test Coverage Fix

## Context

Two issues to address:

1. **AI merge**: The previous attempt to merge `agent-service` + `embedding-service` → `ai-service` failed due to cyclic dependencies. The root cause was identified: `entity-service` depends on `embedding-service` for `IEmbeddingService`, creating a cycle when embedding-service moves into ai-service (which transitively depends back on entity-service via identity-service). The fix is **dependency inversion**: move the `IEmbeddingService` interface into `entity-service` so it no longer depends on embedding-service/ai-service.
2. **tsconfig**: 7 packages have test directories but exclude them from typechecking, meaning type errors in tests go undetected.

Shell packages: 17 → 15 after merge (removing `agent-service` and `embedding-service`).

---

## Part 1: Fix tsconfig test coverage (7 packages)

These packages have `test/` dirs but their `tsconfig.json` only includes `src/`:

| Package                       | rootDir fix       | include fix                             |
| ----------------------------- | ----------------- | --------------------------------------- |
| `shell/agent-service`         | `"src"` → `"."`   | add `"test/**/*"`                       |
| `shell/ai-evaluation`         | `"src"` → `"."`   | add `"test/**/*"`                       |
| `shell/daemon-registry`       | `"./src"` → `"."` | add `"test/**/*"`                       |
| `plugins/examples`            | add `"."`         | add `"test/**/*"`                       |
| `plugins/professional-site`   | add `"."`         | add `"test/**/*"`                       |
| `plugins/system`              | `"src"` → `"."`   | `["src"]` → `["src/**/*", "test/**/*"]` |
| `shared/default-site-content` | already `"."`     | add `"test/**/*"`                       |

**Not broken**: `embedding-service` (already includes `test/**/*`), `product-site-content` (already includes `test/**/*`), `ui-library` (no test dir).

### Steps

1. Update all 7 tsconfig.json files
2. Run `bun run typecheck` — fix any type errors surfaced in test files
3. Run `bun test` — verify tests still pass
4. Run `bun run lint` — fix any lint issues
5. Commit

---

## Part 2: Merge agent-service + embedding-service → ai-service

### Why the previous attempt cycled

```
ai-service → identity-service → entity-service → embedding-service (= ai-service) CYCLE!
ai-service → test-utils → plugins → ai-service CYCLE!
```

### How dependency inversion breaks the cycle

Move `IEmbeddingService` (5-line interface) from `embedding-service` into `entity-service`. Then:

```
entity-service → (job-queue, utils)           ← no dep on ai-service!
ai-service → identity-service → entity-service ← one-directional, no cycle
plugins (devDep) → ai-service                  ← one-directional, no cycle
```

`entity-service` only ever imported `IEmbeddingService` as `import type` (3 source files, 2 test files) — it never needed the implementation. This is textbook dependency inversion.

### Step 2.1: Move IEmbeddingService into entity-service

**Create** `shell/entity-service/src/embedding-types.ts`:

```typescript
export interface IEmbeddingService {
  generateEmbedding(text: string): Promise<Float32Array>;
  generateEmbeddings(texts: string[]): Promise<Float32Array[]>;
}
```

**Update entity-service imports** (all `import type`):

- `src/entity-search.ts:3` — `from "@brains/embedding-service"` → `from "./embedding-types"`
- `src/entityService.ts:19` — same
- `src/handlers/embeddingJobHandler.ts:6` — `from "@brains/embedding-service"` → `from "../embedding-types"`
- `test/entity-search-weight.test.ts` — `from "@brains/embedding-service"` → `from "../src/embedding-types"`
- `test/helpers/mock-services.ts` — `from "@brains/embedding-service"` → `from "../../src/embedding-types"`

**Update** `shell/entity-service/src/index.ts` — add `export type { IEmbeddingService } from "./embedding-types"`

**Update** `shell/entity-service/package.json` — remove `@brains/embedding-service` from dependencies

**Verify**: `cd shell/entity-service && bun run typecheck && bun test`

### Step 2.2: Move embedding-service code into ai-service

**Copy** `embedding-service/src/embeddingService.ts` → `ai-service/src/embeddingService.ts`

- Change `import type { IEmbeddingService } from "./types"` → keep a local copy of the interface in `ai-service/src/embedding-types.ts` (so EmbeddingService can still `implements IEmbeddingService` without depending on entity-service)

**Copy** `embedding-service/src/types.ts` → `ai-service/src/embedding-types.ts`

**Copy** `embedding-service/test/embeddingService.test.ts` → `ai-service/test/embeddingService.test.ts`

- Change `import { EmbeddingService } from "@/embeddingService"` → `from "../src/embeddingService"` (ai-service has no `@/` path alias)

**Update** `ai-service/src/index.ts` — add:

```typescript
export { EmbeddingService } from "./embeddingService";
export type { IEmbeddingService } from "./embedding-types";
```

**Update** `ai-service/package.json` — add `"fastembed": "^1.14.4"` to dependencies

**Verify**: `cd shell/ai-service && bun run typecheck && bun test`

### Step 2.3: Move agent-service code into ai-service

**Copy files** (4 source + 2 test):

- `agent-service/src/types.ts` → `ai-service/src/agent-types.ts`
- `agent-service/src/brain-agent.ts` → `ai-service/src/brain-agent.ts`
- `agent-service/src/agent-service.ts` → `ai-service/src/agent-service.ts`
- `agent-service/src/tool-events.ts` → `ai-service/src/tool-events.ts`
- `agent-service/test/agent-service.test.ts` → `ai-service/test/agent-service.test.ts`
- `agent-service/test/tool-invocation-events.test.ts` → `ai-service/test/tool-invocation-events.test.ts`

**Internal import updates** (within moved files):

- `from "@brains/ai-service"` → `from "ai"` or relative imports (now local)
- `from "./types"` → `from "./agent-types"` (in agent-service.ts)

**Update** `ai-service/src/index.ts` — add agent exports:

```typescript
export { AgentService } from "./agent-service";
export { createBrainAgentFactory } from "./brain-agent";
export {
  createToolExecuteWrapper,
  createMessageBusEmitter,
} from "./tool-events";
export type {
  AgentConfig,
  AgentResponse,
  BrainAgent,
  BrainAgentFactory,
  ChatContext,
  IAgentService,
  PendingConfirmation,
  ToolResultData,
  ToolContextInfo,
  ToolInvocationEvent,
  ToolCompletionEvent,
  ToolEventEmitter,
} from "./agent-types";
export type {
  BrainAgentConfig,
  BrainAgentFactoryOptions,
  BrainCallOptions,
} from "./brain-agent";
```

**Update** `ai-service/package.json` — add deps from agent-service:

- `@brains/conversation-service`, `@brains/identity-service`, `@brains/mcp-service`, `@brains/messaging-service`, `@brains/templates`

**Verify**: `cd shell/ai-service && bun run typecheck && bun test`

### Step 2.4: Update all external consumers

**`@brains/agent-service` → `@brains/ai-service`** (~15 files):

- `shell/plugins/src/interfaces.ts`, `interface/context.ts`, `message-interface/confirmation-handler.ts`, `test/mock-shell.ts`
- `shell/core/src/initialization/shellInitializer.ts`
- `shell/ai-evaluation/src/test-runner.ts`, `remote-agent-service.ts`, `evaluation-service.ts`, `run-evaluations.ts`
- `shell/ai-evaluation/test/test-runner.test.ts`
- `interfaces/matrix/src/lib/matrix-interface.ts`, `test/matrix-interface.test.ts`
- `interfaces/mcp/src/transports/http-server.ts`
- `interfaces/cli/src/cli-interface.ts`, `test/cli-channel-name.test.ts`

**`@brains/embedding-service` → split**:

- `shell/core/src/initialization/shellInitializer.ts` — `EmbeddingService` from `@brains/ai-service`, `IEmbeddingService` from `@brains/entity-service`
- `shell/core/src/types/shell-types.ts` — `IEmbeddingService` from `@brains/entity-service`
- `shell/core/src/index.ts` — re-export from `@brains/entity-service`

**package.json updates**:

- `shell/plugins` devDeps: `@brains/agent-service` → `@brains/ai-service`
- `shell/core` devDeps: remove `@brains/agent-service`, `@brains/embedding-service`
- `shell/ai-evaluation` deps: `@brains/agent-service` → `@brains/ai-service`
- `interfaces/matrix` deps: check and update
- `interfaces/cli`, `interfaces/mcp`: add `@brains/ai-service` as devDep if importing types

### Step 2.5: Delete old packages + clean up

- Delete `shell/agent-service/` directory
- Delete `shell/embedding-service/` directory
- Run `bun install` to update lockfile
- Update `docs/codebase-map.html`

### Step 2.6: Full verification

```bash
bun run typecheck   # 56 packages pass
bun test            # Full suite green
bun run lint        # Zero errors
```

---

## Execution order

1. Part 1: Fix 7 tsconfigs + surface/fix type errors (independent, provides safety net)
2. Part 2 Step 2.1: Dependency inversion (IEmbeddingService → entity-service)
3. Part 2 Steps 2.2-2.3: Move code into ai-service
4. Part 2 Step 2.4: Update all consumers
5. Part 2 Step 2.5: Delete old packages
6. Part 2 Step 2.6: Full verification

Each step verified independently before proceeding.
