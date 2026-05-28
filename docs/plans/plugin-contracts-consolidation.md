# Plan: Plugin contracts consolidation

## Status

Proposed. Trigger: the structured-chat-confirmations work added one
conceptual field (`cards`) and required touching three files —
`shell/ai-service/src/agent-types.ts` (runtime interface),
`shell/plugins/src/contracts/agent.ts` (public zod schema),
`shell/plugins/src/base/public-agent-service.ts` (bridge mapper) — even
though the runtime and public shapes are structurally identical. This
plan scopes the cleanup.

## Context

The plugin boundary today has three layers per service-exposed DTO:

1. **Runtime type** — defined in the owning service
   (`shell/ai-service/src/agent-types.ts`, `shell/identity-service/...`,
   etc.). Used inside the service and by other services.

2. **Public zod schema** — defined in `shell/plugins/src/contracts/*.ts`.
   This is what plugins see, validated at the boundary. The
   `npm-package-boundaries.md` plan establishes this layer as the public
   `@rizom/brain/*` surface plugins are allowed to depend on.

3. **Bridge mapper** — `shell/plugins/src/base/public-*.ts`. Converts a
   runtime DTO into the public DTO at the seam.

The contracts package owns the public _shape_; the mapper enforces it
at the seam. That part of the architecture is sound — it's the
mechanism that lets `npm-package-boundaries.md` promise generated
declarations with no `@brains/*` imports.

## Problem

Some mappers translate shapes (do real work). Others restate identical
shapes (do no real work but cost a per-field maintenance tax).

### Inventory (verified 2026-05-26)

| Bridge file               | What it actually does                                                                                                        | Verdict        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `public-conversations.ts` | Renames `started`/`lastActive`/`created`/`updated` to `*At`; `JSON.parse`s `metadata: string` into `Record<string, unknown>` | **Earns keep** |
| `public-app-info.ts`      | `lastCheck: Date` → `lastCheck: string` (ISO). Public schema explicitly comments the divergence.                             | **Earns keep** |
| `public-identity.ts`      | `Schema.parse(x)` — pure validation, no field translation                                                                    | **Redundant**  |
| `public-agent-service.ts` | Field-by-field copy with `...spread` to drop `undefined`s. Structurally identical to runtime.                                | **Redundant**  |

The redundant cases (identity, agent-service) have grown the most. Every
new field on `AgentResponse` (the `cards` slice this branch added,
`toolResults` before it) requires editing the runtime interface, the
zod schema, and the mapper. The mapper produces a value with the same
shape it received.

## Non-goals

- Removing the public/runtime boundary. The boundary is the mechanism
  `npm-package-boundaries.md` relies on; the contracts package stays as
  the source of the public shape.
- Touching `public-conversations.ts` or `public-app-info.ts`. Those
  mappers translate shapes and stay as-is.
- Restructuring `@brains/contracts` (the `shared/contracts` package).
  See "Why not move schemas down" below.

## Options for the redundant cases

### Option A — Replace the mapper body with `Schema.parse(x)`

`toPublicAgentResponse(runtime)` becomes
`AgentResponseSchema.parse(runtime)`. Same for identity. Both
declarations stay; the duplication-on-add cost stays; the
field-by-field copy goes away. Catches runtime drift at the seam
because zod will reject unexpected shape.

Cost: low. Mechanical edit.
Wins: removes ~120 lines of hand-written mapping; turns shape drift
into a runtime error instead of a silent passthrough.
Leaves intact: the three-declaration cost per new field.

### Option B — Make the public schema the single source of truth

`shell/ai-service/src/agent-types.ts` deletes its `AgentResponse` /
`PendingConfirmation` / `StructuredChatCard` declarations and re-exports
`z.infer`-d types from `@brains/plugins/contracts/agent`. Same for
identity. The mapper goes away because there's nothing to map.

Cost: medium. Inverts who-owns-the-type: today plugins depends on
ai-service (devDep, types-only); under B, ai-service would type-import
from plugins. There's no runtime cycle (ai-service doesn't import
plugins at runtime today and wouldn't need to), but the conceptual
direction flips — the extension-surface package becomes upstream of the
service for these shapes.

Wins: one declaration per DTO. Adding `cards` would be a one-file edit.
The boundary still exists (schemas live in contracts/, plugins still
validate at runtime if they want) but there's no second declaration to
keep in sync.

Risks:

- The inversion is conceptually awkward — plugins is the _outer_ layer
  of the architecture, not the place where shared shapes live.
- If anything ever needs to import the type from a package that itself
  needs to be upstream of plugins (e.g., a hypothetical `core-types`
  package that pre-dates plugins), this lands you in a cycle.

### Option C — Move the canonical schemas to `@brains/contracts`

`shared/contracts/` is positioned as the bottom-layer types package
(zod-only runtime dep). Move `AgentResponseSchema`, `BrainCharacterSchema`,
`AnchorProfileSchema` etc. there. Both ai-service and plugins import
from `@brains/contracts`.

Cost: high. The agent contract transitively depends on
`UserPermissionLevelSchema` (from `@brains/templates`) and
`conversationMessageActorSchema`/`conversationMessageSourceSchema`
(from `@brains/conversation-service`). To honor `@brains/contracts`'s
"no brains deps" position, those referenced schemas have to move down
too — cascading the refactor across templates and conversation-service.
Either that, or `@brains/contracts` accepts deps on
`@brains/conversation-service` and `@brains/templates`, which breaks its
current role as the bottom layer.

Wins: the _correct_ topology. The canonical zod schema lives in the
bottom-layer types package, everyone above it imports from there, the
runtime/public split disappears for these DTOs.

Risks:

- Cascading move touches every service that owns a schema referenced by
  a public contract — and we haven't audited that surface fully.
- The bottom-layer position of `@brains/contracts` is load-bearing for
  other code paths (it's depended on by `conversation-service` itself,
  among others). Adding brains deps to it could create cycles.

## Recommendation

Land **Option A** now. Defer Option B and Option C until a separate
audit decides whether either is worth the topology cost.

Rationale:

- Option A removes the actual maintenance waste (the hand-written
  field-by-field mappers) without touching package topology.
- It's reversible — if we later choose B or C, A doesn't constrain it.
- It catches one real risk Option (current state) doesn't:
  field-by-field mappers silently passthrough drift. `Schema.parse`
  raises if the runtime shape diverges from the contract.

The duplication-on-add cost remains. We accept that cost in exchange
for keeping the topology stable. Revisit if the next two or three
DTO additions feel painful.

## Migration steps

### 1. `public-agent-service.ts`

Replace `toPublicAgentResponse` body with `AgentResponseSchema.parse`.
Keep the function exported under the same name so call sites don't
change. Same for `toRuntimeChatContext` if `ChatContextSchema` covers
the runtime shape.

Acceptance:

- `bun run typecheck` clean repo-wide.
- `bun test` clean in `shell/plugins/` and `shell/ai-service/`.
- The web-chat round-trip still renders confirmation cards
  (manual check — start dev server, trigger a delete-confirm flow).

### 2. `public-identity.ts`

Already just `Schema.parse`. Verify nothing else needs change; this is
the smoke-test before doing the agent one.

### 3. Add a comment guard against re-introducing field-by-field copies

In `shell/plugins/src/base/`, leave a short header comment that says:
"public-\* mappers either translate shapes (rename/convert types) or
call `Schema.parse`. Don't reintroduce field-by-field passthrough — if
the shapes match, parse is enough."

Acceptance: the comment exists. (Not a hook — this is a vibe-check for
future contributors.)

## What this plan does NOT decide

- Whether `@brains/contracts` should grow to hold the canonical agent
  schema (Option C). That's worth deciding separately because it
  cascades.
- Whether plugins should own the canonical type for service-exposed
  DTOs (Option B). That's a real architectural call.
- Whether the runtime interface should be `z.infer`'d from the public
  schema even when both files stay where they are. Cheap; consider as
  a follow-up if Option A doesn't reduce churn enough.

## Risks

- **Low**: `Schema.parse` is stricter than the current passthrough.
  If any runtime caller is producing a shape the schema would reject
  (extra fields, undefineds where the schema requires absence), the
  parse will throw. Mitigated by running tests + by the fact that the
  contract zod schemas are already defined to accept the runtime shapes
  — we shipped that pattern with the cards work.
- **Low**: ts-strict `exactOptionalPropertyTypes` cares whether `id?: undefined`
  is in the parsed output. zod by default drops undefined keys, which
  matches the conditional-spread behavior the current mappers use, so
  this should be a non-issue. Confirm during step 1.
