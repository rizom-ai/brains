# Plan: ATProto discovery bootstrap

## Status

Proposed. Follow-up to the discovery slice in
[atproto-integration.md](./atproto-integration.md) §5: `discoverBrainCards`
is implemented (read → convert cross-version kinds → validate → broadcast
`atproto:brain-card:discovered`, consumed by agent-discovery's upsert
handler) but has no production caller — only
`plugins/atproto/scripts/smoke-discovery.ts` invokes it. The daily
`refreshKnownAgentCards` recurring check only re-fetches agents that
already carry `repoDid`/`cardUri` metadata, so no brain can currently
_first_ discover another.

Immediate motivation: yeehaa.io now publishes `ai.rizom.brain.card/self`
(`did:plc:dtxrise7xa4kat6mh4zd4lqe`, "Paper Tiger") and rizom.ai should
discover it — and vice versa.

## Decisions

1. **Config is the consent gate**, matching the projection-registration
   pattern: a new `discoveryRepos: string[]` (DIDs or handles, default
   `[]`) on the atproto plugin config. No MCP tool — the plan's invariant
   keeps the atproto tool surface absent.
2. **Runs at ready, full boots only.** Discovery broadcasts messages and
   the agent-discovery subscriber writes entities, so it sits behind the
   same `fullBootObserved` gate as card publishing, scheduled (not
   awaited) via the existing task tracking so shutdown drains it.
3. **No credentials required.** Discovery reads public records via the
   public PDS client; a brain with no app password can still discover.
4. **Idempotent by construction.** `discoverBrainCards` dedupes within a
   batch and the agent upsert preserves local relationship metadata, so
   running the same list every boot converges; the daily refresh keeps
   cards current between boots.

## Phase 1 — config + boot trigger (monorepo)

Tests first, in `plugins/atproto/test/publishing-triggers.test.ts` (or a
sibling discovery-triggers file):

- ready with `discoveryRepos` configured on an armed full boot →
  `getRecord` called per repo and `atproto:brain-card:discovered`
  broadcast per card
- startup-check boot (no broadcast) → no discovery reads
- empty `discoveryRepos` → no reads
- no credentials configured → discovery still runs
- one repo failing → other repos still processed (existing per-repo
  error isolation, asserted through the trigger)

Implementation: add `discoveryRepos` to `atprotoConfigSchema`; in
`onReady`, schedule `discoverBrainCards(context, { repos })` when the
list is non-empty. Changeset: patch `@brains/atproto`.

## Phase 2 — fleet config + release

- Release train ships the feature (alpha.N).
- rover-pilot `users/rizom-ai/brain.yaml`: `discoveryRepos:
[did:plc:dtxrise7xa4kat6mh4zd4lqe]`; bump `cohorts/sites.yaml`.
- yeehaa-io `brain.yaml`: `discoveryRepos:
[did:plc:oehciuqunzskplljt3qnnncw]` + runtime bump — mutual discovery.

## Phase 3 — live verification

- rizom.ai `/health` agent count rises by one; the new agent entity
  carries Paper Tiger's card metadata (name, skills, repo DID) with
  `kind` converted to the local vocabulary if versions diverge.
- yeehaa.io gains a Rizom agent entity the same way.
- Next day's refresh check reports the cards as `unchanged` (daily
  refresh has adopted them).
