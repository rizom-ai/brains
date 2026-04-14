# Plan: move per-entity-type create logic into plugins

## Status

Proposed.

## Context

`shell/core/src/system/tools.ts` (the `system_create` tool) has accumulated entity-type-specific dispatch logic:

- `if (input.entityType === "link")` (lines 396-491, ~96 lines): inline content parsing — extracts URL/title/status from frontmatter, generates id from URL slug, creates entity directly. Falls through to the `link-capture` generation job if parsing fails.
- `if (input.entityType === "image")` (lines 443-463, ~20 lines): pre-enqueue target validation — resolves `targetEntityType/targetEntityId` to a canonical id, returns sync error if not found.

Both branches exist for legitimate UX reasons (skip AI roundtrip for already-structured link content; sync error feedback for image target lookups). But both put per-entity-type knowledge into a generic core tool. Adding a new entity type with similar needs means another inline branch.

## Why now

By itself the image branch is small and matches the established link pattern — not worth refactoring just to clean it up. With both branches considered together (~116 lines of inline per-type logic), an extension point becomes load-bearing instead of speculative. Two callers justify the abstraction.

## Target

`tools.ts` becomes truly generic: dispatch to a plugin-registered create handler if one exists, otherwise run the generic enqueue or direct-create path.

```ts
// In tools.ts, system_create:
const handler = entityRegistry.getCreateHandler(input.entityType);
if (handler) {
  const result = await handler(input);
  if (result !== "fallthrough") return result;
}
// generic path: enqueue if prompt provided, otherwise direct create
```

Each entity plugin owns its create specialization via an optional override on `EntityPlugin`:

```ts
protected async prepareCreate(
  input: CreateInput,
  context: EntityPluginContext,
): Promise<CreateResult | "fallthrough"> {
  return "fallthrough";  // default: use generic path
}
```

## What changes

### Add types

`shell/entity-service/src/types.ts`:

```ts
export interface CreateInput {
  entityType: string;
  prompt?: string;
  title?: string;
  content?: string;
  targetEntityType?: string;
  targetEntityId?: string;
}

export type CreateResult =
  | {
      success: true;
      data: { entityId?: string; jobId?: string; status: string };
    }
  | { success: false; error: string };

export type CreateHandler = (
  input: CreateInput,
) => Promise<CreateResult | "fallthrough">;
```

### Add registry methods

`shell/entity-service/src/types.ts` (interface) and `entityRegistry.ts` (impl):

```ts
registerCreateHandler(type: string, handler: CreateHandler): void;
getCreateHandler(type: string): CreateHandler | undefined;
```

### Add namespace method

`shell/plugins/src/entity/context.ts` — `IEntitiesNamespace` gains:

```ts
registerCreateHandler(handler: CreateHandler): void;
```

(Entity type implicit since plugin owns one type.)

### Add virtual to EntityPlugin

`shell/plugins/src/entity/entity-plugin.ts`:

```ts
protected async prepareCreate(
  _input: CreateInput,
  _context: EntityPluginContext,
): Promise<CreateResult | "fallthrough"> {
  return "fallthrough";
}

// In register(), if subclass overrides prepareCreate, register it:
if (this.prepareCreate !== EntityPlugin.prototype.prepareCreate) {
  context.entities.registerCreateHandler((input) =>
    this.prepareCreate(input, context),
  );
}
```

### Override in LinkPlugin

`entities/link/src/plugin.ts` — implement `prepareCreate`:

- If `content` is present, attempt the existing inline parse logic
- If parse succeeds with title/status/URL, create directly via `entityService.createEntity`, return `{ success: true, ... }`
- Otherwise return `"fallthrough"` (lets generic path enqueue the `link-capture` job)

Move helpers: `extractFirstUrl`, the slug derivation logic, currently in `tools.ts` for the link branch — move to `entities/link/src/lib/`.

### Override in ImagePlugin

`entities/image/src/image-plugin.ts` — implement `prepareCreate`:

- If `targetEntityType` and `targetEntityId` are present, call `findEntityByIdentifier`
- If not found, return `{ success: false, error: "Target entity not found: ..." }`
- If found, return `"fallthrough"` (the generic path will enqueue the job; the validated id needs to flow through)

**Subtle**: image needs to _modify_ the input (replace title/slug `targetEntityId` with canonical id) AND fall through. The "fallthrough" string return doesn't carry the modified input. Two options:

- Make the return shape `{ kind: "fallthrough"; input: CreateInput }` so plugins can mutate the payload that flows through
- OR: have ImagePlugin do the full enqueue itself in `prepareCreate` and not fall through

The first option (mutable fallthrough) is cleaner — keeps the generic path uniform.

### Replace inline branches in tools.ts

- Remove the `if (input.entityType === "link")` block (lines 396-491)
- Remove the `if (input.entityType === "image" && targetEntityType && targetEntityId)` block (lines 443-463)
- Add the generic dispatch:
  ```ts
  const handler = services.entityRegistry.getCreateHandler(input.entityType);
  if (handler) {
    const result = await handler(input);
    if (result.kind !== "fallthrough") return result;
    input = result.input; // pick up plugin-modified payload
  }
  ```

### Update tests

- `shell/core/test/system/entity-create.test.ts` — most existing assertions should still pass (the dispatch produces the same observable behavior). May need to adjust mocks to register the create handlers.
- `entities/link/test/` — add tests for `LinkPlugin.prepareCreate` covering the inline parse paths previously tested via `system_create`.
- `entities/image/test/handlers/image-generation-handler.test.ts` — already covers handler-side resolution; add tests for `ImagePlugin.prepareCreate` covering the pre-enqueue validation.

## What we solve

| Before                                                            | After                                                                      |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 96 lines of link logic in `tools.ts`                              | LinkPlugin owns it                                                         |
| 20 lines of image logic in `tools.ts`                             | ImagePlugin owns it                                                        |
| `tools.ts` branches on specific entity types                      | `tools.ts` is generic                                                      |
| New per-type create needs touching core                           | Override on the plugin                                                     |
| Two duplicate `findEntityByIdentifier` calls (tools.ts + handler) | One in plugin's `prepareCreate`; handler still defends with its own lookup |

## What we don't change

- Agent-facing tool surface — `system_create` remains the single tool
- The `${entityType}:generation` job convention
- The generic create path for entity types that don't override `prepareCreate`
- The handler's defensive re-lookup (TOCTOU resilience)

## Cost

~5 files of plumbing (types, registry interface + impl, namespace, virtual, dispatch). Two real callers at landing time. Touches:

- `shell/entity-service/src/types.ts`
- `shell/entity-service/src/entityRegistry.ts`
- `shell/entity-service/src/index.ts`
- `shell/plugins/src/entity/context.ts`
- `shell/plugins/src/entity/entity-plugin.ts`
- `entities/link/src/plugin.ts` (+ `entities/link/src/lib/` helpers)
- `entities/image/src/image-plugin.ts`
- `shell/core/src/system/tools.ts`
- Tests in entity-create.test.ts, link package, image package

## Implementation order

1. Add types and registry methods (entity-service)
2. Add namespace method and virtual on EntityPlugin (plugins)
3. Override in ImagePlugin (smaller case first, validates the abstraction)
4. Update tools.ts to dispatch to handler
5. Verify image tests pass
6. Override in LinkPlugin (move helpers from tools.ts)
7. Remove link branch from tools.ts
8. Verify all tests pass

## Verification

- All existing `system_create` tests in `shell/core/test/system/entity-create.test.ts` pass unchanged
- Image cover generation works end-to-end (target resolution, sync error feedback for missing targets)
- Link capture works for both inline content parse and AI generation paths
- `tools.ts` no longer contains `entityType === "link"` or `entityType === "image"` checks

## Open questions

- **Mutable fallthrough shape**: confirm `{ kind: "fallthrough"; input: CreateInput }` is the right return type for plugins that need to modify the payload before the generic path runs. Alternative: separate `validate` and `create` hooks, but that's more surface for marginal gain.
- **Handler-side resolution**: keep the defensive `findEntityByIdentifier` in `image-generation-handler.ts:212` even after this refactor? Yes — the handler may be invoked from other paths (direct job enqueue, retries) and shouldn't trust upstream resolution.
