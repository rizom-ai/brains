# Agent instruction surface control

## Status

Planning doc. This is the broader cleanup plan for the agent/system-prompt surface after the focused [`save-note-source-resolution.md`](./save-note-source-resolution.md) work.

Recommended ordering:

1. Do `save-note-source-resolution.md` Phase 0 immediately: fix the current `from` / `sourceAttachment` contradiction.
2. Do `save-note-source-resolution.md` Phase 1 next: reject mixed `system_create` source fields so bad model calls fail safely.
3. Then start this plan. Some phases can run in parallel with save-note Phases 2–3, but the `system_create` source cleanup should remain the first structural dependency because it removes one of the largest prompt-pressure clusters.

## Problem

The current base agent instructions have grown by accretion. The shell prompt now contains detailed rules for identity, permissions, entity CRUD, uploads, source-derived artifacts, image/OG/cover operations, publish flows, playbooks, proactive search, multi-turn references, confirmation behavior, and many regression-specific prohibitions.

A recent review of `shell/ai-service/src/brain-instructions.ts` found the base `buildInstructions(...)` output at roughly:

- 35k+ characters before tool schemas, plugin instructions, retrieved memory, active playbook context, or model messages;
- 170+ lines;
- about 9k rough tokens;
- dozens of `do not` / `never` style guards.

The result is hard to reason about:

- prompt patches duplicate runtime/tool constraints;
- unrelated plugin/domain behavior leaks into shell-level instructions;
- retrieved conversation memory is appended into the system instruction string;
- NL regex guards affect tool availability and model-visible schemas;
- tests mostly assert prompt substrings, which makes deletion/refactoring risky and encourages more prompt growth.

## Goals

- Keep the shell system prompt small, stable, and architecture-level.
- Move domain/tool-specific guidance to the closest owning layer: tool schema, tool handler, entity/plugin instruction, policy, or eval.
- Replace broad natural-language guards with runtime invariants where possible.
- Treat retrieved memory and active workflow state as bounded context, not as permanent system-prompt material.
- Preserve existing user-visible behavior and confirmation semantics while shrinking the instruction surface.
- Make future prompt growth measurable and intentional.

## Non-goals

- Replacing `system_create` with a new tool. Source cleanup remains in [`save-note-source-resolution.md`](./save-note-source-resolution.md).
- Removing confirmations or weakening permission checks.
- Rewriting every plugin instruction in one pass.
- Making behavior depend on one chat interface; fixes must apply through the shared agent path.

## Design principles

1. **Runtime before prompt.** If a rule can be enforced by a tool handler, policy layer, schema, or state machine, enforce it there and remove model-only policing.
2. **Closest owner wins.** Shell owns general agent conduct and cross-cutting contracts; plugins/entities own their domain vocabulary and special cases.
3. **Model-visible schemas should make good calls easy.** Avoid showing the model multiple sibling fields for the same conceptual choice when a discriminated source/action shape can encode the choice.
4. **Context is not authority.** Retrieved memory, upload refs, playbook state, and entity refs are contextual inputs with provenance, not global instructions.
5. **Behavior tests beat substring tests.** Keep only high-value prompt smoke tests; move regressions into evals or unit tests around routing/tool contracts.

## Current hotspots

### Base shell prompt

File: `shell/ai-service/src/brain-instructions.ts`

Largest pressure areas:

- `### Core Tools`
- `### Image, OG & Cover Operations`
- `### Multi-Turn Context`
- `### Entity-Specific Update Rules`
- `### CRITICAL: Always Invoke Tools for Actions`

These sections mix durable cross-cutting rules with narrow regression patches. They should be split by ownership and enforcement layer.

### Dynamic context injected into system instructions

File: `shell/ai-service/src/brain-instructions.ts`

`agentContextInstructions` is appended under `### Retrieved Conversation Memory (CONTEXT)`. Even though it is labeled context, it is passed through the `instructions` field, so it has system-level placement. Move it to a bounded, delimited model message/context channel instead.

### Upload/source routing prose

Files:

- `shell/ai-service/src/conversation-messages.ts`
- `shell/ai-service/src/call-options.ts`
- `shell/ai-service/src/sdk-tools.ts`
- `shell/core/src/system/schemas.ts`
- `entities/document/src/plugin.ts`
- `entities/image/src/image-plugin.ts`
- `entities/note/src/plugin.ts`

This is the most duplicated cluster. The focused save-note/source plan should reduce it first.

### NL heuristics that hide tools or fields

File: `shell/ai-service/src/call-options.ts`

Current regexes influence whether `system_create`, `document_generate`, and create-source fields are model-visible. This should be minimized once schemas/tool handlers can reject invalid source combinations clearly.

### Prompt substring tests

File: `shell/ai-service/test/build-instructions.test.ts`

Many assertions require exact guidance to remain present. These are useful as short-term regression locks, but they make prompt deletion hard. Replace most with behavior-focused evals or contract tests before removing guidance.

## Proposed phases

### Phase 1 — baseline, budgets, and contradiction checks

Goal: make prompt growth visible before pruning.

Implementation:

- Add a small instruction-budget test or diagnostic around `buildInstructions(...)`:
  - total chars / rough tokens;
  - section sizes;
  - count of plugin and context instruction chars when supplied by tests.
- Start with a generous warning-style threshold or snapshot helper; do not make the first budget so tight that it blocks cleanup sequencing.
- Add targeted contradiction tests for known source guidance after `save-note-source-resolution.md`'s contradiction fix (its Phase 0). That phase owns correcting the guidance; this phase owns the regression lock that keeps it corrected:
  - `from` is only described for prior assistant/conversation-message saves;
  - source-derived artifacts are described with `sourceAttachment` until the future `source` union lands.

Exit criterion: there is a visible budget/section report and at least one test preventing the known `from` / `sourceAttachment` contradiction from returning.

### Phase 2 — move retrieved memory out of system instructions

Goal: keep retrieval context useful without granting it system-prompt placement.

Implementation:

- Stop passing `agentContextInstructions` into `buildInstructions(...)`.
- Add retrieved memory as a separate bounded model message or structured context block in `buildModelMessages(...)` / the agent call path.
- Preserve existing provenance wording and the “no memory retrieved” behavior, but label it as contextual data.
- Add a test that `buildInstructions(...)` never contains retrieved memory text.
- Add a test that retrieved memory is still included in the model input when the context provider returns items.

Exit criterion: dynamic retrieved memory is no longer inside the system instruction string, and existing memory-answer behavior remains covered.

### Phase 3 — slim the shell prompt to stable contracts

Goal: remove shell-owned duplication while preserving core behavior.

Keep in the base prompt:

- identity/profile distinction and permission summary;
- concise tool-use contract: use tools for tool-backed actions, do not fabricate action completion, ask when ambiguous;
- confirmation contract: initial durable writes call the tool without `confirmed`; confirmation flow executes later;
- concise read/search/list/get guidance;
- response style.

Move or delete from the base prompt:

- entity/plugin-specific image, OG, cover, document, newsletter, and agent-directory details;
- detailed upload routing prose once save-note/source phases cover it structurally;
- repeated “do not self-confirm” wording duplicated in tool descriptions and schemas;
- regression-specific examples that have behavior evals;
- duplicate multi-turn references already supported by entity-memory refs.

Implementation approach:

- Trim one cluster at a time, each with a before/after eval or unit-test replacement.
- Prefer deleting global lines after the owning tool/schema/plugin has enforceable validation or local concise instructions.
- Keep compatibility with public/trusted/anchor behavior.

Exit criterion: base `buildInstructions(...)` is materially smaller and no longer owns detailed plugin/domain operation recipes.

### Phase 4 — reduce model-visible NL routing guards

Goal: stop relying on broad regexes to hide or expose capability fields.

Dependencies:

- `save-note-source-resolution.md`'s mixed-source rejection (its Phase 1) should be done.
- `save-note-source-resolution.md`'s preferred `source` discriminated union (its Phase 3) should be done before removing most `system_create` source-field gating.

Implementation:

- Keep hiding internal confirmation fields (`confirmed`, `confirmationToken`, `contentHash`).
- After the preferred `source` union is model-visible, hide legacy flat source fields from the model and remove special-case per-source field toggles where possible.
- Revisit `shouldDisableSystemCreateForUploadRead` and similar regex guards:
  - keep only cases with clear safety value;
  - prefer allowing the tool to validate and return a clear error over making the correct field unavailable.
- Add unit tests around model-visible schemas instead of prose routing.

Exit criterion: correct tool arguments are less dependent on message wording regexes, and source-selection errors fail in the handler rather than by schema invisibility.

### Phase 5 — plugin instruction governance

Goal: prevent plugin instructions from becoming the next unbounded prompt bucket.

Implementation:

- Establish guidance for plugin `getInstructions()` output:
  - short capability summary;
  - only domain-specific routing that cannot live in schema/tool descriptions;
  - no duplicate generic confirmation or permission boilerplate;
  - avoid “CRITICAL/NEVER” unless enforcing a real safety boundary.
- Add an optional instruction-size diagnostic grouped by plugin id.
- Start with the largest/highest-pressure plugins/entities:
  - agent discovery;
  - playbooks active-context guidance;
  - image/document/note upload guidance;
  - site-builder/action-repeat guidance.
- Consider a future structured plugin guidance contract if raw strings keep growing, but do not block cleanup on it.

Exit criterion: plugin instructions have owner-facing constraints and size visibility; repeated shell boilerplate is removed from plugin text where safe.

### Phase 6 — replace prompt substring locks with behavior coverage

Goal: make future prompt deletion safe.

Implementation:

- Audit `shell/ai-service/test/build-instructions.test.ts` assertions into categories:
  - keep: identity/profile and high-level shell contracts;
  - move to schema/tool unit tests: source fields, confirmation args, policy denials;
  - move to evals: model routing behavior across turns;
  - delete: duplicate string checks after behavior coverage exists.
- Add/ensure eval coverage for key behaviors before removing their prompt lines:
  - no fabricated action completion;
  - no self-confirming durable writes;
  - public/trusted permission boundaries;
  - source-derived artifact saves;
  - cover vs OG operations;
  - “save it” after summaries/discussions;
  - exact/finalized content uses `content`, not `prompt`.

Exit criterion: prompt tests verify shape and budget, not every workaround sentence.

### Phase 7 — active playbook/context compaction

Goal: keep workflow guidance strong without injecting large repeated operating manuals every turn.

Implementation:

- Review `plugins/playbooks/src/plugin.ts` active context output size and repeated instructions.
- Separate state data from operating rules:
  - stable playbook operating rules belong in concise plugin instructions/tool descriptions;
  - per-turn context should contain current state, valid events, done-when status, and provenance.
- Add size tests or diagnostics for active playbook context.

Exit criterion: active playbook turns include enough state to act correctly without adding a second system prompt’s worth of prose.

## Validation strategy

Use the lightest checks at each phase:

- Targeted unit tests for prompt building, schema visibility, and source validation.
- Relevant ai-service tests:
  - `test/build-instructions.test.ts`
  - `test/call-options.test.ts`
  - `test/conversation-messages.test.ts`
  - `test/sdk-tools.test.ts`
  - `test/agent-service.test.ts` where call-path changes apply.
- Relevant Rover/full evals before removing high-risk prompt lines.
- `bun run docs:check` when this plan or roadmap links change.

## Risks

- Removing prompt lines before equivalent runtime/eval coverage exists can reopen old model-routing regressions.
- Moving memory out of system instructions may subtly change model behavior; keep provenance and “no memory retrieved” semantics covered.
- Plugin instructions may grow if shell text is simply moved instead of simplified.
- Regex gating removal may expose more invalid tool calls initially; tool errors must be clear and safe.

## Success criteria

- Base `buildInstructions(...)` is substantially smaller and mostly stable across feature work.
- Dynamic retrieved memory is not appended to the system prompt.
- `system_create` source selection is structurally clear and validated by the handler.
- Plugin/domain rules live with owning plugins or schemas, not in the shell prompt.
- Prompt tests stop requiring dozens of exact workaround sentences.
- Evals remain green for core tool invocation, confirmation, permission, upload/save-it, cover/OG, and source-derived artifact flows.
