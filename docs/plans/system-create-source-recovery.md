# System Create Source Recovery Plan

## Status

Baseline full Rover eval:

- Result: `brains/rover/eval-results/2026-06-26T05-58-39-658Z.json`
- Passed: 155 / 176 (88.1%)
- Failed: 21 / 176

Latest full Rover eval after Phase 0 / initial Phase 1 / Phase 4a work:

- Result: `brains/rover/eval-results/2026-06-26T08-02-17-374Z.json`
- Passed: 163 / 176 (92.6%)
- Failed: 13 / 176
- Net improvement: +8 passed / -8 failed

This plan recovers regressions after the `system_create.source` migration removed
the natural-language gates. The gates carried implicit state and implicit routing;
removing them was correct, but it dropped real capability. This plan rebuilds that
capability the deterministic way — and is honest about the small residue that cannot
be made deterministic at all.

## Principles (non-negotiable)

- Language is data, not control flow. The model interprets user phrasing once into
  typed tool args. Host/service code never branches on message text. The one sanctioned
  exception is confirmation/approval parsing, which only activates against a structured
  set of pending approval ids (see `confirmation-routing.ts`: it returns
  `not-confirmation` whenever no approval is pending).
- Prefer, in order: (1) runtime enforcement in the tool, (2) deterministic structure —
  host-rendered responses from typed tool output, staged proposals that ride existing
  confirmation routing, and atomic tool calls that collapse multi-step chains,
  (3) typed context for the model. Only reach for a lower tier when the one above cannot
  apply.
- Do not solve failures with eval-example prompt hacks.
- Count only full-suite improvement as recovered progress. Measure after each phase,
  not at the end. Targeted passes are diagnostic only.
- A "fix" that leaves the final outcome to model judgment is a nudge. Label it, and prove
  its full-suite delta independently.

## What the 21 failures actually are

Derived from the baseline transcripts, not symptoms. Classified by mechanism, because the
mechanism decides whether a fix can be deterministic. Thinking one level deeper than the
raw transcript collapses most of the apparent "model behavior" failures onto two
structural levers.

### Bucket A — Runtime-enforceable today (deterministic) — 2

The model called a tool that code can forbid, or a tool can block on typed state. A code
change makes the failing outcome impossible.

- `tool-invocation-agent-call-archived` — model called `a2a_call` on a non-approved agent.
  The product requirement is no remote contact. The current eval also asserts no
  `a2a_call` tool call, so the fix must either expose only approved/not-archived agent
  call targets to the model or update the eval to assert the product invariant against a
  structured pre-network rejection. Runtime `a2a_call` validation is still required as a
  fail-closed backstop, but it is not sufficient for the current assertion by itself.
- `multi-turn-playbook-blocks-partial-identity-name-only` — model reached `system_update`
  when the playbook should have blocked for missing required identity fields. The playbook
  tool returns a structured blocking requirement before any mutation tool is reachable.

### Bucket B — Deterministic via structure — 12

None are enforceable as written, but each reduces to a **single model decision whose
outcome is then structurally determined**. Three structural mechanisms cover all twelve.

**B1 — Host-renders the response from typed tool output (not model prose).**

- `cover-generation-failure-follow-up` — not-found target becomes structured state the
  host renders ("not found" / "failed"), instead of model prose that says "hasn't been
  started".
- `tool-invocation-extract-topics-broad-request@anchor` — action completions are
  host-rendered from the tool result, without model-appended "If you want…" offers.

**B2 — Typed cover operation + read-model cover/OG distinction.**

- `tool-invocation-set-cover-remove` — typed cover operation normalizes the write to
  `coverImageId`, preserving the `ogImageId` distinction.
- `tool-invocation-set-cover` — model skipped the update because it read `ogImageId` and
  declared the cover "already set". Distinguishing `coverImageId` / `ogImageId` in the
  model-visible read-model removes the false-positive; the model sees cover is unset.

**B3 — `system_create` rejects raw-file promotion (upload source = transform/extract only).**

- `multi-turn-web-chat-pdf-upload-save-follow-up` — the tool refuses raw promotion, so the
  model cannot double-call `system_create` + `system_upload_save`.

**B4 — Structured pending proposals without first-turn mutation.**
The follow-up turn is _already_ deterministic when there is a structured pending approval
or proposal: `routeConfirmationResponse` resolves "yes" / "approve" against pending ids.
However, the agent follow-up evals currently require turn 0 to **not** call
`system_create`. Therefore staging must be non-mutating and must not be counted as
`system_create`: e.g. a host-rendered structured refusal/proposal card or conversation
memory record containing `{ kind: "agent-contact-proposal", domain, action: "save" }`.
The follow-up can then convert that proposal into `system_create source.kind:"url"`.
For direct approval requests, the model should still call `system_update` first and let
confirmation middleware render "Confirmation required".

- `multi-turn-agent-add-after-save-first-follow-up`
- `multi-turn-agent-add-after-refusal-no-approval-gate`
- `multi-turn-agent-add-after-save-it-follow-up`
- `tool-invocation-agent-approve@anchor` (host then renders "Confirmation required")

**B5 — Collapse the chain: source-derived create resolves the source server-side in one
atomic call.** These fail in the gap between `search`/`get` and `create`. With one atomic
call there is no intermediate step to abandon.

- `tool-invocation-set-cover-generate-by-reference`
- `tool-invocation-document-create-post-printable`
- `tool-invocation-newsletter-generate-from-post`

> Coupling note: B5 and `set-cover` still require the model to make **one** mutating
> tool call. B4's first turn must instead create only a non-mutating structured proposal;
> the follow-up then makes the mutating `system_create` call. These all depend on the
> model accepting a typed action affordance, but the downstream outcome becomes
> deterministic once that affordance is used.

### Bucket C — Eval-harness / brittle assertion (fix the eval, NOT the product) — 4

The product is correct. Changing product behavior here is the exact eval-chasing failure
mode to avoid.

- `shell-proactive-search-variations` — `system_search` was called 6× in turns 0 and 1;
  the assertion turn legitimately needed no search. Turn-association bug in the collector.
- `rover-publishing-followup-uses-updated-post` — transcript shows `system_get` _was_
  called in the publish turn; the assertion is matched against the wrong turn. Same
  turn-association bug.
- `tool-invocation-agent-call-unknown-url` — model refused correctly with no tool call;
  fails only on a literal grep for "directory". With no tool call there is nothing to
  host-render; the assertion is brittle.
- `tool-invocation-agent-call-url-phrasing` — same as above.

### Bucket D — Irreducible residue (nudges, measured one at a time) — 3

No structure forces these; the final outcome is model judgment.

- `tool-invocation-blog-finalized-direct-create` — model confirms in prose instead of
  calling `system_create`. The canonical case for the **tool-first** lever, which also
  unlocks B4/B5.
- `tool-invocation-git-sync` — model read "backup" as a status check. Tool-selection.
  Structural mitigation available: remove the confusable `directory-sync_status` from the
  action surface.
- `multi-turn-web-chat-multiple-upload-ambiguous-follow-up` — model picked the older
  upload. Referent-selection. Structural mitigation available: expose an explicit
  `primaryUploadRef` and newest-first ordered candidates; keep `upload.id` required unless
  a narrowly-scoped missing-id default is separately proven safe.

### Honest scoreboard

- 2 deterministic now (A).
- 12 deterministic via structure (B) — though B4/B5 + `set-cover` are gated by D's one
  tool-first lever.
- 4 are eval bugs; do not touch product (C).
- 3 irreducible model behavior (D), and even these have structural mitigations.

The dominant insight: this is not 21 scattered fixes. It is a handful of structural
mechanisms (tool enforcement, host rendering, stage-and-route, chain-collapse) plus **one**
high-leverage behavioral lever — get the model to make the first mutating tool call instead
of confirming or drafting in prose. Once that call lands, the downstream is deterministic.

## Implementation order

By determinism and dependency, not feature area. Run the **full** Rover suite after each
phase and record the delta against 155/176.

### Phase 0 — Baseline, diagnostics, correctness gate

1. Keep `2026-06-26T05-58-39-658Z.json` as baseline; add a script printing full-suite
   deltas per run.
2. Merge no further schema-wording changes until root-cause fixes land.
3. Correctness gate (independent of evals): verify and, if confirmed, fix the
   confirmation-to-execution source binding in `entity-create-tool.ts` — the confirmation
   token must be bound to the resolved source so a confirmed call cannot swap sources.
   Ships first regardless of eval movement.

### Phase 1 — Bucket A (runtime enforcement)

1. `a2a_call` enforces saved + approved + not-archived; returns `agent_not_saved` /
   `agent_not_approved` / `agent_archived` before network contact.
2. Decide the eval/product boundary for archived calls: either expose only valid approved
   agent call targets so the model cannot emit `a2a_call`, or update the eval to accept a
   structured pre-network rejection as satisfying the no-remote-contact invariant.
3. Playbook tool returns structured blocking requirements before any mutation tool.
4. Tests first, then implementation. Full suite; record whether the A2A assertion was
   solved by target-surface gating or by an eval correction.

### Phase 2 — Bucket C (eval/harness corrections, no product change)

1. Fix the multi-turn expected-tool association in the metric collector; re-check
   `proactive-search-variations` and `publishing-followup-uses-updated-post` against the
   recorded tool calls.
2. Re-evaluate `agent-call-unknown-url` / `agent-call-url-phrasing`: assert structured
   refusal semantics or relax the brittle "directory" grep, with transcript evidence.
3. Save evidence artifacts for every eval change: transcript snippet, raw tool calls, and
   the product invariant the assertion now checks.
4. No product code changes in this phase.

### Phase 3 — Bucket B, structural infra independent of the tool-first lever

1. Host-render failures/refusals/completions from structured tool output: structured
   failed-artifact-target state (B1 `cover-failure`); completions without offer prose
   (B1 `extract-topics`).
2. Typed cover operation normalizing to `coverImageId`, plus `coverImageId`/`ogImageId`
   distinction in the read-model (B2 `set-cover-remove`, `set-cover`).
3. `system_create` rejects raw-file promotion (B3 `pdf-upload-save-follow-up`).
4. Tests first per item. Full suite; record delta.

### Phase 4a — Tool-first lever only

1. Generic tool-first action lifecycle instruction (system prompt, not routing examples):
   create/update/delete/extract/publish call the relevant tool first; confirmation is
   returned by the tool and host-rendered.
2. Target only the irreducible first-call behavior such as
   `tool-invocation-blog-finalized-direct-create` and direct approval/update requests.
3. Tests first; full suite immediately after. Attribute any delta only to this lever.

### Phase 4b — Structure unlocked by the tool-first lever

1. Structured pending proposals (B4): first-turn agent contact/add/save refusals store a
   non-mutating structured proposal, not a `system_create` call, so follow-ups resolve via
   existing confirmation/proposal routing and then call `system_create source.kind:"url"`.
   Direct approval requests use `system_update` and existing confirmation middleware.
2. Collapse-the-chain (B5): source-derived `system_create` resolves the source reference
   server-side in one atomic call (cover-by-reference, document-from-post,
   newsletter-from-post). Keep preview tools explicitly preview-only.
3. Tests first; unit tests prove no message-text branching is introduced. Full suite;
   record delta separately from Phase 4a.

### Phase 5 — Bucket D residue (measured nudges)

Each is a separate experiment; keep only on a measured full-suite gain, no batching.

1. `git-sync`: tighten sync-vs-status tool contracts; optionally remove the confusable
   status tool from the action surface.
2. `multiple-upload`: expose `primaryUploadRef` plus newest-first ordered upload
   candidates in typed context. Keep `upload.id` required by default; only consider a
   missing-id default when there is exactly one structurally selected primary and a full
   suite run proves a net gain.

### Phase 6 — Full validation

1. Full Rover eval, no timeout.
2. Report each bucket's contribution to the delta separately. Success only if failed count
   drops below 21 with no new architectural regressions.
3. Re-run Relay eval after Rover stabilizes.

## Done criteria

- Full Rover eval improves from 155/176 with no new architectural regressions, attributed
  per bucket.
- A passes deterministically; B passes via host-rendered output / stage-and-route /
  chain-collapse; C is resolved as assertion fixes with evidence; D items are kept only
  where they produced a measured full-suite gain.
- No host-code NL guards or regex routing added. Enforced by compiler/API shape for the
  specific routing-sensitive surfaces (source selection, tool availability,
  upload-selection, referent-gating signatures must not accept raw message text) plus
  behavior tests. General message rendering/parsing code may still handle message text.
  The sanctioned confirmation-parsing exception remains gated on pending approval ids.
- The confirmation source-binding correctness gate (Phase 0) is fixed.
- Targeted typecheck / lint / tests pass for touched packages.
