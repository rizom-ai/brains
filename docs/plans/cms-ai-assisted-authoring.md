# Plan: CMS AI-Assisted Authoring

## Status

Phases 1–2 shipped (2026-07-09): the CodeMirror 6 source pane (byte-identical
round-trip covered by tests) and the selection rewrite — operator-gated read-only
`POST /cms/api/assist`, assist bar UI, pure accept/discard logic — landed together in
`feat(cms): add AI-assisted body editing`. Remaining: Phase 0 (the operator authoring
pass, human input that feeds the polish backlog) and Phase 3 (summarise/tag-suggest
prompt variants, friction backlog, optional streaming). Successor to the shipped
`first-party-cms-editor.md` plan (its optional Phase 6, plus the D1 body-editor
upgrade that plan deferred).

## Context

The first-party CMS editor (shipped) is a React 19 app at `/cms` that writes through
the entity service; git persistence follows via directory-sync, and the save-pipeline
instrument strip makes that chain visible. Building on it:

- **Editor floor** — the body editor is a plain `<textarea>` (`.body-source`) beside a
  `streamdown` preview, behind a `Source | Split | Preview` segment control. The
  predecessor plan's D1 decision deferred the CodeMirror 6 upgrade; it lands here.
- **AI surface for plugins** — `ServicePluginContext` exposes request/response AI:
  `context.ai.generateObject(prompt, schema)` (see
  `shell/plugins/src/entity/context.ts`), with `generateContent` / `query` on the
  shell. There is **no streaming surface for plugins** — web-chat's token streaming is
  its own SSE plumbing (`interfaces/web-chat/src/chat-stream.ts`), not reusable as-is.
- **Generation already has a home** — chat, `system_generate`, and content-pipeline
  create entities today. The editor's comparative advantage is inline work on
  _existing_ text, not draft-from-scratch.

## Goal

Selection-scoped AI assistance inside the `/cms` editor: select text, give an
instruction ("tighten this", "less formal"), review the suggestion, accept or discard.
Accepted suggestions become ordinary draft edits — the entity-service single-writer
model and save pipeline are untouched.

## Decisions

- **CodeMirror 6 first (D1 resolved).** Selection-scoped assist UI needs real editor
  APIs — ranges, decorations, inline suggestion highlighting — that a textarea only
  crudely fakes; building assist UI on the textarea means rebuilding it after the
  editor swap. CM6 still edits the literal bytes (perfect round-trip, no
  directory-sync canonical-hash churn) and slots into the existing layout. Note CM6 is
  the 2022 ground-up rewrite, not legacy CM5.
- **One assist first: selection rewrite.** It is the highest-frequency mid-edit want
  and exercises the entire plumbing (route → AI service → suggestion UI → accept into
  draft). Summarise and tag-suggest are later prompt variants on the same route.
- **No draft-from-scratch in the CMS.** Generation surfaces already exist (chat,
  `system_generate`, content-pipeline); duplicating them inline adds a second
  generation UX for no new capability.
- **Assists never write.** The assist route is read-only compute; the suggestion is
  client state until the author accepts it into the draft, and the draft saves through
  the normal PUT — validation, `baseContentHash` stale-write guard, export, commit,
  instrument strip, all unchanged.
- **v1 is non-streaming.** The plugin AI surface is request/response; rewrite-length
  outputs make a single round-trip acceptable. Streaming is a later upgrade (either a
  `streamText` surface on `ai-service` or reuse of web-chat's stream plumbing) and is
  not allowed to block the walking skeleton.

## Phases

Thin vertical slices, tests first in every phase.

### Phase 0 — Authoring pass (input, not code)

The operator authors real content at `/cms` on the floor editor. Output: a friction
list (field widgets, list view, save flow, body editing) that becomes the Phase 3
backlog. Cheap, can run parallel to Phase 1.

### Phase 1 — CodeMirror 6 source pane

- Tests first: body round-trips byte-identically through the CM6 pane (typing,
  paste, unicode, trailing whitespace); `Source | Split | Preview` control behavior
  unchanged; `BodyEditor` contract (`value` / `onChange` / mode props) preserved so
  `App` and existing tests stay intact.
- Replace the `.body-source` textarea with CM6 (markdown language package, no
  formatting/normalization extensions) in source and split modes; preview pane stays
  `streamdown`.
- Gate: `bun run --filter @brains/cms typecheck | lint | test`, bundle builds
  (`build:ui`), manual smoke in a test app.

### Phase 2 — Assist route + selection rewrite

- Tests first (server): `POST /cms/api/assist` requires an operator session (401);
  contract `{ entityType, instruction, selection, body, frontmatter }` →
  `{ suggestion }`; the handler calls the AI service and performs **no entity
  writes**; oversized/empty selection rejected with 400.
- Tests first (client): pure accept logic — applying a suggestion to a selection range
  produces the expected next body; discard restores nothing; suggestion state never
  touches the API client's write functions.
- Client: CM6 selection → instruction input → suggestion rendered beside the
  selection (decoration + panel, `streamdown` for markdown) → accept replaces the
  range in the draft, discard drops it. Save path untouched.
- Server: route handler prompts the AI service (system prompt: edit the given text per
  instruction, return only the replacement markdown).

### Phase 3 — Prompt variants + authoring polish

- Prompt variants on the same route: summarise (body → suggestion targeted at a
  frontmatter field) and tag-suggest (proposes values; accepting patches the colophon
  draft, schema validation on save as usual).
- Work through the Phase 0 friction backlog.
- Optional, only if v1 latency annoys in practice: streaming upgrade per the decision
  above.

## Verification

1. Body content round-trips byte-identically through the CM6 editor (no
   directory-sync echo writes after a save with no textual change).
2. `/cms/api/assist` is unreachable without an operator session and never writes
   entities.
3. An accepted rewrite saves through the normal pipeline: validation, stale-write
   guard, export, commit — instrument strip settles as for any hand-typed edit.
4. Suggestion accept/discard is covered by pure-function tests; route contract by
   handler tests.
5. Per-package gates: `bun run --filter @brains/cms typecheck | lint | test`; turbo
   sweep over dependents.

## Related

- `plugins/cms/ui-react/src/App.tsx` — `BodyEditor` (floor tier) this plan upgrades;
  draft state the assist writes into.
- `plugins/cms/src/editor-routes.ts` — route table the assist route joins; session
  guard pattern.
- `shell/plugins/src/entity/context.ts`, `shell/ai-service` — plugin-facing AI surface
  (request/response; `generateText` exists internally, unexposed).
- `interfaces/web-chat/src/chat-stream.ts` — existing streaming plumbing, candidate
  for the optional Phase 3 streaming upgrade.
- Predecessor: `first-party-cms-editor.md` (deleted when shipped; see git history).
