# Relay Eval Failure Recovery Plan

## Context

Relay eval run from `brains/relay` on 2026-05-30 produced:

- Result: 46 passed, 7 failed, 53 total
- Pass rate: 86.8%
- Results file: `brains/relay/eval-results/2026-05-30T14-17-10-152Z.json`
- AI SDK system-message warning: not observed

The worktree was dirty during the eval, so the first step is to stabilize the tree before trusting further eval results.

## Failed evals

- `relay-agent-context-excludes-other-space`
- `relay-agent-context-empty-other-space`
- `relay-tool-create-image`
- `relay-tool-a2a-approved-peer-call`
- `relay-permission-anchor-singleton-delete-refused`
- `relay-permission-public-peer-call-denied`
- `relay-permission-trusted-derived-summary-denied`

## Root-cause buckets

### 1. Conversation-memory eval criteria are too brittle

The memory isolation behavior looked correct:

- no cross-space leak was observed
- no tools were called
- same-space memory was used where expected
- no-memory case was correctly reported

Failures were caused by exact response expectations such as requiring the literal phrases `docs` or `No conversation memory`.

### 2. Prompt policy conflicts cause forbidden tool attempts

The assistant sometimes gives the correct refusal text after still calling a forbidden tool:

- singleton delete: called `system_delete` for `brain-character`
- trusted summary rewrite: called `system_update` for `summary`

Likely cause: generic instructions such as “always attempt tool calls” and “always attempt delete” are stronger/earlier than entity action policy warnings.

### 3. Relay-specific A2A/public permission gaps

Failures show unclear behavior around peer-brain operations:

- Public caller correctly did not call tools, but response suggested adding/saving the peer later.
- Approved peer call used `partner-brain.io`, but judge treated this as not clearly using the saved local agent id.

Relay needs sharper instructions that public users cannot trigger or save peer agents, and that domain-like saved IDs are valid local agent IDs when already saved.

### 4. Direct image data URL creation is a real product bug

`system_create` for `entityType: "image"` with direct data URL content failed because required image metadata (`format`, `width`, `height`) was not populated in the direct-create path.

## Plan

### Step 1 — Stabilize worktree

- Inspect dirty and staged files.
- Restore accidental eval/source dirt unless intentionally part of the current fix.
- Keep the committed AI-service warning fix intact.
- Ensure the staged deletion of `docs/plans/post-series-metadata-projection-bug.md` is either intentional or unstaged/restored before continuing.

### Step 2 — Add regression tests first

Add focused tests before production changes:

- `shell/ai-service/test/build-instructions.test.ts`
  - Instructions must clearly say hard-denied actions should not be attempted.
  - Generic “always attempt” language must not override singleton/derived-record policy.

- `shell/core/test/system/entity-create.test.ts`
  - `system_create({ entityType: "image", content: dataUrl })` succeeds.
  - Stored image metadata includes format, width, height, title/alt.

- `brains/relay/test/entity-action-policy.test.ts`
  - Relay permissions keep derived/system-maintained records anchor-only.
  - Relay instructions deny public peer-brain calls/saves.
  - Relay instructions clarify saved local agent IDs for A2A.

### Step 3 — Fix prompt/tool-policy contradictions

Update `shell/ai-service/src/brain-instructions.ts`:

- Qualify “always attempt” rules with entity action policy exceptions.
- Move or strengthen hard-denied / level-gated policy guidance.
- Explicitly state:
  - never call delete on singleton identity/profile records (`brain-character`, `anchor-profile`)
  - trusted users must not mutate derived/system-maintained records like `summary`
  - if an action is hard-denied or level-gated, refuse without trying the tool

### Step 4 — Fix Relay-specific instructions

Update `brains/relay/src/index.ts` agent instructions:

- Public callers cannot trigger A2A peer-brain calls.
- Public callers cannot save/add peer agents.
- For approved saved peer brains, use `a2a_call` with the saved local agent id.
- Domain-like IDs such as `partner-brain.io` are valid saved local IDs when present in the local agent directory.
- Relay full preset remains scoped to docs/decks, not publishing workflows.

### Step 5 — Fix direct image data URL creation

Update the image direct-create path so:

- `system_create` with `entityType: "image"` and data URL `content` routes through image metadata extraction.
- Metadata is populated from the data URL:
  - `format`
  - `width`
  - `height`
  - `title`
  - `alt`
- AI-generated image flow remains unchanged.

### Step 6 — Adjust brittle eval expectations only where behavior is already correct

For the memory isolation evals, prefer semantic criteria over exact phrases if the behavior is objectively correct.

Do not use eval fixture changes to hide real product or policy failures.

### Step 7 — Validate

Run targeted checks first:

```bash
bun test shell/ai-service/test/build-instructions.test.ts
bun test shell/core/test/system/entity-create.test.ts
bun test brains/relay/test/entity-action-policy.test.ts
```

Run targeted Relay evals:

```bash
cd brains/relay
bun run eval --test relay-agent-context-excludes-other-space,relay-agent-context-empty-other-space,relay-tool-create-image,relay-tool-a2a-approved-peer-call,relay-permission-anchor-singleton-delete-refused,relay-permission-public-peer-call-denied,relay-permission-trusted-derived-summary-denied
```

Then run full Relay eval:

```bash
cd brains/relay
bun run eval
```

Because prompt and system-create behavior are shared, rerun Rover eval after Relay is clean:

```bash
cd brains/rover
bun run eval
```

### Step 8 — Commit

- Commit only the intended fixes and tests.
- Keep unrelated worktree cleanup out of the fix commit unless explicitly intended.
