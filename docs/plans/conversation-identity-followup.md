# Conversation Identity Follow-up

## Status

In progress. Slice 1 (assistant actor resolver) is implemented in this branch.

Follow-up plan for the work intentionally deferred from `conversation-speaker-attribution` before merging that branch.

The current branch preserves per-interface actor/source metadata, projects speaker-aware conversation memory, stores summary participants, and stores explicit decision/action attribution when it can be recovered safely. This plan covers the next identity layer after that merge.

## Goals

- Replace the temporary assistant actor fallback with a stable brain-instance actor id.
- Add explicit cross-interface identity linking without inference.
- Make memory retrieval able to reason over linked identities when requested.
- Improve delegated-work attribution where requester and assignee are different speakers.
- Keep existing per-interface actor ids durable and backward-compatible.

## Non-goals

- Inferring that two actors are the same person from names, handles, or prose.
- Retroactively rewriting old messages without actor metadata.
- Building a broad contacts/CRM system.
- Exposing raw platform ids in normal user-facing prose.

## Principles

- Actor identity remains the source of provenance: `discord:123`, `mcp:daniel`, `cli:local`, `brain:relay`.
- Canonical identity is explicit and optional: `person:daniel` only appears after a configured link exists.
- Do not let identity linking change the original persisted actor/source metadata.
- Conversation-memory projections may add canonical references in derived metadata, but source messages remain immutable evidence.
- Evals must cover identity behavior before enabling retrieval changes broadly.

## Proposed model

### Brain actor id

Add a first-class assistant actor resolver near the agent/identity boundary:

```ts
interface BrainActorIdentity {
  actorId: string; // e.g. `brain:relay` or `brain:<brain-id>`
  interfaceType: "agent";
  role: "assistant";
  displayName: string;
  isBot: true;
}
```

Target behavior:

- `AgentService` should not hardcode `brain:assistant` long term.
- The actor id should come from the resolved brain identity/character/app context.
- If no formal brain id exists, keep the current fallback but isolate it behind a resolver so it is easy to replace.

### Canonical identity links

Introduce an explicit link layer, likely as a small entity or identity-service extension:

```ts
interface CanonicalIdentityLink {
  canonicalId: string; // e.g. `person:daniel`
  displayName?: string;
  actors: Array<{
    actorId: string; // e.g. `discord:123456789`
    interfaceType: string;
    displayName?: string;
  }>;
}
```

Implementation choice:

Use an **identity-service extension backed by durable entities/adapters**.

Rationale:

- canonical identity resolution is shell-wide infrastructure, not a content plugin concern
- `AgentService`, interfaces, and memory retrieval need a central resolver API without depending on an entity plugin
- durable markdown-backed records still preserve reviewability and repo-friendly editing
- identity-service can enforce uniqueness across records, e.g. one `actorId` maps to one active `canonicalId`

Do not create a separate entity plugin for the first cut. If UI/tooling is needed later, expose it through a narrow service/plugin surface after the resolver contract is stable.

## Implementation slices

### Slice 1: Assistant actor resolver

Implemented:

- Added a helper that resolves assistant actor metadata for `AgentService`.
- Assistant message display names now come from brain character identity.
- Shell initialization passes a stable brain actor id derived from the configured brain name.
- Direct `AgentService` construction keeps the stable `brain:assistant` fallback.
- Tests cover configured actor id, fallback actor id, and display name behavior.

### Slice 2: Explicit canonical identity links

- Define canonical link schema and adapter/service boundary.
- Validate `canonicalId` format with a namespaced id such as `person:<slug>`.
- Enforce no duplicate `actorId` across active canonical links.
- Add read API: resolve `actorId -> canonical identity`.
- Tests:
  - valid/invalid link records
  - duplicate actor rejection
  - unknown actors resolve to no canonical id

### Slice 3: Apply canonical ids to new messages

- When chat context already has `actor.canonicalId`, preserve it.
- Optionally enrich incoming actor metadata by looking up the actor id in the explicit link resolver.
- Do not modify old persisted messages automatically.
- Tests:
  - linked actor gets `canonicalId`
  - unlinked actor remains actor-only
  - invalid/missing link does not break message persistence

### Slice 4: Conversation-memory canonical projection

- Carry canonical ids from message actors into:
  - summary `participants`
  - decision `decidedBy` / `mentionedBy`
  - action-item `assignedTo` / `requestedBy` where actor ids are known
- Preserve display names for readable rendering.
- Tests:
  - two linked actors in one conversation collapse to one canonical participant only where appropriate, while retaining source actor ids if needed for provenance
  - unlinked actors remain separate

### Slice 5: Retrieval behavior

- Add an explicit retrieval option for identity expansion, e.g. `canonicalId` or `actorId` filter.
- Same-space retrieval remains default.
- Identity expansion should never silently cross spaces unless configured/requested.
- Evals:
  - asking for Daniel's decisions can find Discord and MCP records only after explicit link exists
  - similarly named but unlinked people do not merge

### Slice 6: Delegated-work attribution

Improve action attribution beyond first-person commitments:

- `assignedTo`: explicit owner/assignee, including delegated statements like "Daniel owns X" or "Mira, please handle Y".
- `requestedBy`: speaker who explicitly requested or assigned the work.
- Do not populate `assignedTo` from proximity alone.

Tests/evals:

- requester and assignee differ in a multi-speaker transcript
- assistant suggestions are not requesters unless a user accepts/assigns them
- ambiguous ownership remains unassigned

## Eval gates

Before merging each future slice that changes memory behavior:

- targeted unit tests for schemas/resolvers/projection
- conversation-memory evals for any prompt/projection behavior change
- Relay eval only when retrieval behavior or agent response behavior changes

Suggested eval cases:

1. `conversation-memory-canonical-linked-actors`
   - Discord Daniel and MCP Daniel are explicitly linked.
   - Retrieval can connect both when identity expansion is requested.
2. `conversation-memory-no-name-based-merge`
   - Two actors share display name "Alex" but have no canonical link.
   - Memory keeps them separate.
3. `conversation-memory-delegated-action-attribution`
   - Mira asks Daniel to update a checklist; Daniel accepts.
   - `requestedBy` is Mira, `assignedTo` is Daniel.

## Merge dependency

This follow-up plan should not block merging `feat/conversation-speaker-attribution`. The current branch is merge-ready after validation. These items should be implemented in separate branches because they introduce new identity semantics beyond speaker preservation.
