# Plan: Shell core stops naming entity types

## Status

Implemented in `work/entity-type-flags-implementation`, pending agent approval evals (no AI API key available). All five slices have changesets. Regression tests cover each slice; initial tests were run before the corresponding implementation changes. The implementation is kept together in this worktree rather than opening five PRs.

Review corrections:

- Replaying the stored proposal must also preserve its content hash and edits, and consume the token once.
- Search excerpts can contain binary bytes too; sanitizing only the entity body is insufficient.
- `role` is no longer declared by the base `AnchorProfileAdapter`. The real-adapter regression uses `name`, a current declared field. Undeclared metadata behavior is unchanged.
- The existing document plugin registers its config through `context.entities.register`; no plugin architecture migration is needed here.

Two defects are fixed by the slices below:

- **A mangled confirmation grants agent trust.** Proposing `fields: { status: "archived" }` for a discovered agent and then confirming with the fields dropped approves the agent (`success: true`, status `approved`). The replay branch in `entity-update-tool.ts` ignores the stored proposal and hardcodes `{ status: "approved" }`.
- **Documents leak their PDF to the model.** `sanitizeEntity` strips `data:` content only for `image`; a `document` (whose schema requires a `data:application/pdf;base64,…` body) reaches `system_get` and `system_search` results whole.

## Goal

The system tools in `shell/core/src/system` treat every entity type through declarations its plugin makes. Today they branch on six type names in eight places:

| Site                                 | Special case                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| `tool-helpers.ts` `sanitizeEntity`   | `image` content replaced by a placeholder                                       |
| `insights.ts`                        | `image` excluded from stale entries                                             |
| `entity-generate-tool.ts`            | `image` refused for prompt generation                                           |
| `entity-read-tools.ts` `system_list` | `post` re-sorted by `publishedAt` in memory                                     |
| `entity-create-tool.ts`              | `extract-markdown` allowed only for `note`                                      |
| `entity-update-tool.ts`              | `anchor-profile` refuses fields-only updates                                    |
| `entity-update-tool.ts` (2 sites)    | `agent` mangled-confirmation replay (`pendingApprovalForEntitySchema` + branch) |

The `system_update` description in `instructions.ts` also teaches agent approval, which only matters when agent-discovery is installed.

## Decisions

- **Declarations live on `EntityTypeConfig`**, beside `actionPolicy`, `fullTextSearchable` and `binaryStorage`, returned by each plugin's `getEntityTypeConfig()`. Core reads them through `entityRegistry.getEntityTypeConfig(type)`. The public `defineEntity` surface is unchanged.
- **Binary content is the existing `binaryStorage` setting**, widened to `"data-url" | "asset"`. Image and document declare `"data-url"` now; [durable-binary-assets.md](./durable-binary-assets.md) later flips them to `"asset"`. Current `=== "asset"` / `!== "asset"` readers keep their meaning. Core treats any declared value as binary.
- **A mangled confirmation replays the stored proposal, for every type.** The confirmation gate already stores the full proposed arguments per token. When a confirmed call carries a token but no operation (or blank content without fields), the tool takes the stored arguments, requires the same `entityType` and `id`, and executes exactly what was proposed. Without a token the ordinary validation errors stand.
- **The anchor-profile guard is deleted, not declared.** It predates the generic persistence probe (2026-06-20 vs 2026-08-26). Run against the real `AnchorProfileAdapter`, a fields-only `name` update extracts the old name from unchanged content, which is exactly what the probe rejects. After deletion anchor-profile accepts the fields-only updates every other type accepts (`visibility`, `coverImageId`), still behind `canWriteVisibility` and the action policy.
- **Instruction text follows the plugin.** The agent approval sentence moves from core's `instructions.ts` into agent-discovery's `getInstructions()`. Generic guidance that merely uses a type as an example (for instance "import text into a note") stays.

## Phases

Each phase is one PR with its changeset; tests are written first and must fail before the change.

### Phase 1 — Confirmations replay what was proposed

- Tests first (`shell/core/test/system/update-tool.test.ts`): a mangled replay of a pending archive for a discovered agent archives it; a mangled replay of a pending `note` field update applies that update; a replay whose token belongs to another entity is rejected (existing); a confirmed call without a token keeps its current errors (existing). The three existing agent auto-approval tests stay green unchanged.
- Replace `pendingApprovalForEntitySchema` and the `entityType === "agent"` branch with the generic replay. Move the agent sentence into agent-discovery's instructions.
- Run the agent approval eval cases before and after (`packages/brain-cli/test-cases/{personal,team}/tool-invocation/agent-approve.yaml`, `personal/multi-turn/agent-approve-then-call-now.yaml`); the instruction move must not change their outcome.

### Phase 2 — Binary content is declared

- Tests first: `system_get` and `system_search` on a `document` return the placeholder; a `document` is excluded from stale insights; prompt generation for any `binaryStorage` type is refused with a message naming the operation kinds that do target it; the image cases keep passing.
- Add `"data-url"` to `binaryStorage`; image and document plugins declare it; the three image sites read the declaration.

### Phase 3 — Default list order is declared

- Tests first: with more posts than the limit, `system_list` asks the entity service for `publishedAt desc` rather than re-sorting a page already cut by `updated desc` (assert the `sortFields` passed; the entity-service suite already owns metadata sorting). A type without a declaration keeps the default order.
- Add `defaultSort?: SortField[]` to `EntityTypeConfig`; the blog plugin declares `publishedAt desc` for `post`; remove the in-memory sort.

### Phase 4 — Markdown import is declared

- Tests first: `extract-markdown` into `note` still succeeds; into a type that does not declare it, the error names the types that do; a test-only type that declares it passes the guard.
- Add `markdownImport?: boolean` to `EntityTypeConfig`; the note plugin declares it; the create-tool guard reads it.

### Phase 5 — The anchor-profile guard goes

- Test first: with the real `AnchorProfileAdapter` registered in the update-tool harness, a fields-only `name` update is rejected by the persistence probe and nothing is written.
- Delete `validateAnchorProfileUpdate`.

After phase 5, `rg -n 'entityType (===|!==) "' shell/core/src/system` returns nothing.

## Validation results

- 1,516 tests passed across core, entity-service, agent-discovery, image, document, blog, and note suites.
- Full `bun run typecheck`: 104 workspaces passed.
- Forced lint: all seven touched workspaces passed.
- `bun run docs:check` and `git diff --check` passed.
- No literal `entityType ===` / `entityType !==` branches remain in `shell/core/src/system`.
- Personal agent approval eval startup was attempted before implementation; the personal and team cases were attempted afterward. All attempts stopped before execution because no AI API key was configured. Eval equivalence remains unverified.

## Constraints

- Per-phase gates: `@brains/core`, `@brains/entity-service` and the touched plugin suites; `bun run typecheck`; `bun scripts/lint.mjs --force --filter` for each touched workspace. Phase 1 adds the agent approval evals; phase 2 adds the image/document plugin suites.
- No migration: the new settings are code declarations, not stored data.
