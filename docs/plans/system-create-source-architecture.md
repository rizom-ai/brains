# Deterministic source routing for `system_create` — target architecture

## Status

Target architecture. This is the end-state, not an increment list. It replaces
the earlier `save-note-source-resolution.md` and `agent-instruction-surface.md`
phase plans, which have been folded into this design and deleted.

## The commitment

Intent interpretation and source resolution for `system_create` are
**deterministic, typed, and tested**. The model is a fallback for the long tail,
never the primary router for known intents. We do **not** fix routing
regressions by editing prompt prose.

Why this doc exists: this path has been shaky for months because it straddled two
architectures at once — "the model routes intent via prompt prose" and "we patch
deterministically when the model gets it wrong." Every quick eval fix added a
sentence to the prompt or a regex to `call-options.ts`, which re-entrenched the
prose layer it was meant to relieve. The seam between the two is the unstable
part. This doc picks one side: deterministic, with the model as fallback.

## Two layers

The governing principle is already named in the source plan: **separate
interpretation from resolution.** Make that split structural.

### Layer 1 — Resolution (source kind → bytes). Solid; mostly landed.

- **One input shape**: the `source` discriminated union. The model-visible schema
  exposes `source` only — never the sibling flat fields.

  ```ts
  source:
    | { kind: "text"; content: string }
    | { kind: "generate"; prompt: string }
    | { kind: "url"; url: string }
    | { kind: "upload"; upload: { kind: "upload"; id: string }; transform: "extract-markdown" }
    | { kind: "attachment"; sourceEntityType: string; sourceEntityId: string; attachmentType: string }
    | { kind: "prior-response"; messageId?: string }
  ```

- **Illegal states are unrepresentable**, not validated after the fact. Cross-branch
  combinations cannot be expressed; mixed `source` + legacy flat fields are
  rejected at the handler before any side effect.
- **Resolution is deterministic and server-side**, and **fails closed**: unknown
  concrete `messageId`s error; only known placeholders normalize to latest; a
  missing prior message never silently substitutes an upload, entity, or
  generated text.
- **Confirmation freezes resolved bytes** into canonical
  `source: { kind: "text", content: resolvedStoredContent }` so confirmation can
  never drift from what was shown.
- **Flat fields are a transitional inbound bridge only**, with a scheduled
  removal (below). They are not a compatibility promise.

### Layer 2 — Interpretation (natural language → which source). Make this first-class.

A single **intent-router** component, at the shared `AgentService` chat
chokepoint — not web-chat, not any per-interface preprocessor. Direct MCP/CLI
calls bypass it entirely (they invoke tools explicitly).

- The router is a **registry of named, unit-tested patterns**. Each pattern is a
  deterministic match predicate plus the canonical `source` it produces. No
  pattern depends on prompt prose to fire.
- **Patterns at launch** (these are today's Phase 3.5 and Phase 4, unified):
  - `save-prior-response`: user says "save it / that / the summary / your
    answer", a savable assistant turn exists (`isSavableAssistantMessage`), and
    the user is not targeting the raw file → `source: { kind: "prior-response" }`.
  - `upload-to-note`: user says "turn it into a note / import as markdown /
    extract this", exactly one live extractable upload is in play
    (`application/pdf`, `text/*`, `.md`, `.markdown`, `.txt`, `.json`), and the
    latest assistant turn is **not** a savable summary →
    `source: { kind: "upload", transform: "extract-markdown" }`.
- **Disambiguation between patterns is part of the tested contract**, not
  emergent from prose. The load-bearing case — a bare "save it" after a summary
  routes to `prior-response`, never to upload extraction — has explicit tests in
  both directions.
- **Model fallback**: anything the router does not match deterministically goes to
  normal model generation. The model still sees the `source` union and can pick a
  branch; it simply no longer carries the routing burden for the known intents.

This collapses the former Phase 3.5 (upload-to-note) and Phase 4 (prior-response)
into one component. They are the same idea — a deterministic shortcut — split
only by the order we discovered them. Building the router is the architecture,
not a last-resort patch gated on an eval staying flaky.

## What gets deleted (this is the point)

The router only makes the path solid if the prose/regex layer comes **out** once
code owns the intent. Deletion, not tuning, is the success metric:

- Upload-ref routing-prose recipes (the current Phase 2 hints) → deleted once the
  router owns upload/prior-response intent. Keep only passive upload metadata.
- `call-options.ts` NL regex gating of source fields
  (`shouldDisableSystemCreateForUploadRead` and siblings) → deleted; the union
  plus the router replace it.
- Substring-locked routing assertions in `build-instructions.test.ts` → replaced
  by router unit tests and a few behavior evals.
- The `do not` / `never` source guards in `brain-instructions.ts` that exist to
  police routing → deleted.

If a cleanup leaves the prose in place, it did not land.

## The guardrail (the rule that stops the straying)

When a routing eval fails, the fix is **a router pattern plus its unit test**, or
a resolution-layer validation. It is **not** a new sentence in the prompt, a new
regex in `call-options.ts`, or a normalization-precedence tweak. If a fix can
only be expressed as prose, that is the signal the intent is not yet
deterministic: either add it to the router with tests, or accept it as model
fallback. Do not re-grow the prose layer to make an eval pass.

## Mapping from the existing phases

- **Phase 0** (`from`/`sourceAttachment` guidance fix): done; absorbed. Becomes
  moot once guidance describes `source` only.
- **Phase 1** (reject mixed sources, fail-closed): **keep as-is.** Layer 1 safety.
- **Phase 2** (upload-ref hint cleanup): **interim only.** Its prose is deleted
  when the router lands; do not invest further in tuning these hints.
- **Phase 3** (canonical `source` union, model-visible source-only): **keep.**
  This is Layer 1. Finish the first-party flat-field migration and schedule the
  bridge removal below.
- **Phase 3.5 + Phase 4** (deterministic shortcuts): **merge into the Layer 2
  router.** Build by design, not gated on eval flakiness.

## Invariants (the tests that lock it)

- Model-visible schema exposes `source` only; never flat source fields.
- Cross-branch combinations and `source` + legacy-flat are rejected at the
  handler, before side effects.
- Unknown concrete `messageId` fails; only the known placeholder set normalizes.
- Each router pattern fires on its positive cases, falls back on its negatives,
  and emits canonical `source`.
- The summary-save vs upload-extract boundary has explicit both-direction tests.
- Confirmation args are canonical, frozen `source: { kind: "text", content }`.

## Removal schedule for the flat bridge

Define when the bridge dies, or it never does. Once the ~17 first-party flat
call sites are migrated to `source`, flip the handler to **reject** flat source
fields. That flip is the step that makes `source` actually the sole contract —
without it, "canonical" stays aspirational and the straddle quietly returns.

## Out of scope

- A new save-last-response tool.
- Pushing the `source` union into entity-service / plugin interceptor contracts;
  they keep receiving flat `CreateInput` until that migration is explicitly
  scoped.
- Interface-specific routing of any kind.
