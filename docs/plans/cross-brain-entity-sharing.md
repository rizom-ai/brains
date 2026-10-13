# Plan: Cross-brain entity sharing

## Status

**Proposed.** No code exists for the inbound half. This plan settles how one
brain obtains an entity from another brain and keeps it current, across the two
peer channels that already exist.

The outbound half is shipped and live: `ai.rizom.brain.note` is a canonical
lexicon, and `plugins/atproto/src/plugin.ts:568` refuses to publish any entity
whose `visibility !== "public"`. A public note on an ATProto-configured brain
already lands in its PDS repo with `brainDid`, `sourceEntityType`, and
`sourceEntityId` provenance. What is missing is the consuming side, and any
path at all for `shared` content.

Related: [identity-and-trust.md](./identity-and-trust.md) (domain identity,
peer-trust grants, the human/peer separation),
[atproto-integration.md](./atproto-integration.md) (record publication, deferred
Phase 3 ingestion, the Jetstream admission correction),
[trustflow-federation-integration.md](./trustflow-federation-integration.md)
(the provenance/refresh/revocation shape this reuses).

## The shape

**Visibility picks the transport. The provenance model is the same either way.**

```
public      → ATProto record + firehose    1:N, ambient, world-readable
shared      → A2A directed pull            1:1, scoped to the granted peer level
restricted  → neither, ever
```

This is not a new boundary. `shell/entity-service/src/visibility.ts` already
defines the three levels and maps a caller's permission level onto the scope
they may read. This plan adds a transport for the middle row and a consumer for
the top one; it invents no identifier, no authorization vocabulary, and no
second trust flow.

## What already lines up

Every row is shipped and verified in code.

| Need                                     | Ours                                                                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Peer identity                            | `did:web:<domain>` for ATProto, the bare domain for A2A — the same identity in two spellings (`identity-and-trust.md` decision 2)                                                                              |
| Proving a peer                           | RFC 9421 signature verified against the peer's JWKS, resolved to a pinned key fingerprint (`interfaces/a2a/src/a2a-interface.ts:199-218`)                                                                      |
| Peer authorization                       | `getA2APeerTrust(domain)`; fingerprint mismatch falls back to `public`, so key rotation fails closed                                                                                                           |
| Read scoping                             | `permissionToVisibilityScope()` and `getVisibleContentVisibilities()` (`shell/entity-service/src/visibility.ts:70`, `:48`)                                                                                     |
| Wire format                              | `adapter.toMarkdown()` / `fromMarkdown()` (`shell/entity-service/src/types.ts:473`) — the same markdown directory-sync already round-trips                                                                     |
| Change detection                         | `contentHash` on every entity row (`shell/entity-service/src/types.ts:260`); the CID on the ATProto side                                                                                                       |
| Provenance fields                        | `brainDid`, `sourceEntityType`, `sourceEntityId` in `shared/atproto-contracts/src/lexicons/ai.rizom.brain.note.json`                                                                                           |
| Approval gate before any network contact | `agent` entity `discovered → approved`, enforced at `interfaces/a2a/src/client.ts:692`                                                                                                                         |
| A sanctioned way to extend the protocol  | `AgentExtension` in `capabilities.extensions`, the `X-A2A-Extensions` activation header, and `DataPart` payloads — already in production via `ANCHOR_EXTENSION_URI` (`interfaces/a2a/src/agent-card.ts:82-88`) |
| Review-before-accept surface             | The `InboxSource` contract (`shell/plugins/src/inbox-registry.ts`), with the `agent-candidate` precedent for evidence that is not yet a committed relationship                                                 |

## What is missing

- **No entity transfer on any peer channel.** A2A dispatches exactly three
  methods — `message/send`, `tasks/get`, `tasks/cancel`
  (`interfaces/a2a/src/jsonrpc-handler.ts:118-126`) — and the spec's own request
  union is closed, so the gap is filled by a declared extension rather than a
  fourth method (decision 2). A peer can ask a question and receive prose; it
  cannot obtain the entity.
- **No consumer for `ai.rizom.brain.*` records.** Publication is one-way. The
  atproto plan's Phase 3 is deferred and sits behind the three-slice Jetstream
  admission correction.
- **No provenance on the consuming side.** Nothing records that a local entity
  originated elsewhere, and therefore nothing can refresh it, mark it withdrawn,
  or stop it being republished.
- **No envelope slot for provenance.** Exactly one system key is injected into
  exported files — `visibility`, written by `applyVisibilityToMarkdown` and
  removed again by `stripSystemVisibility`
  (`shell/entity-service/src/frontmatter.ts:192`, `:233`). Domain frontmatter
  cannot substitute: adapter schemas strip
  unknown keys and `toMarkdown` rebuilds files from the parsed result, so
  provenance stored there is silently destroyed on export (decision 3).
- **No posture for undeclared visibility.** `visibility.ts:28` resolves undefined
  to `public`, while the file layer treats an absent key as carrying no opinion.
  The least deliberate content reads as the most exposed the moment a peer
  channel exists (decision 9).

## Decisions

### 0. Visibility picks the transport; the operator never chooses a channel

An entity's visibility determines how it can travel, and nothing else does.
`public` may go over ATProto (and over A2A). `shared` may go over A2A only.
`restricted` never leaves.

The reason is structural, not preferential: a PDS repo is world-readable and
carries no per-caller scoping, so the `visibility !== "public"` refusal at
`plugins/atproto/src/plugin.ts:568` is the only honest behaviour that transport
admits. Exposing a channel picker would let an operator contradict a visibility
they already set.

### 1. Sharing is one-directional. There is no bidirectional sync

An entity has exactly one owner brain. Every other brain holds a tracked copy
that it does not edit.

Bidirectional prose merge has no sound automatic resolution. The existing
evidence is directory-sync's own policy: `--no-rebase -Xtheirs`, falling back to
`git checkout --theirs`, documented in
[directory-sync-git.md](../directory-sync-git.md). That does not merge; it picks
a winner and discards the other side silently. Reproducing it across a trust
boundary would lose a peer's work without either operator seeing it happen.

Editing a tracked copy is a **fork**: it becomes an ordinary local entity
carrying `derivedFrom` instead of `sourceBrain`, and the subscription ends.
Explicit, visible, and non-destructive.

### 2. The `shared` pull is a declared A2A protocol extension, not a new method

Four candidates, one choice.

**New JSON-RPC methods** `entity/get` / `entity/list` on `/a2a` are rejected as
non-conformant. `A2ARequest` in `@a2a-js/sdk` (pinned at `^0.3.13`) is a **closed**
discriminated union of the ten spec methods, and `MethodNotFoundError` is the
standard response to anything outside it. A private method would be invisible to
every conformant client, would fail against the A2A Inspector, and would break the
first time the SDK validates inbound requests against that union.

**MCP client enrollment** — brain A registering as an OAuth client of brain B —
works today with no new protocol, and is rejected. It makes a brain a _user_ of
another brain, collapsing the separation `identity-and-trust.md` decision 5 exists
to preserve, and it requires a credential exchange, against decision 4's "no secret
is ever exchanged in any trust flow."

**A free-text skill over `message/send`** is rejected because it puts a language
model in a byte-transfer path: non-deterministic, billed per fetch, and capable of
returning content that was never in the entity.

**A declared protocol extension** is chosen. A2A specifies exactly this mechanism
and the SDK implements it: `AgentExtension` (`uri`, `description`, `params`,
`required`) declared in `capabilities.extensions`, activated per request through
the `X-A2A-Extensions` header (`HTTP_EXTENSION_HEADER` in `@a2a-js/sdk`), with the
payload carried as a `DataPart` inside an ordinary `message/send`.

This brain already ships one. `ANCHOR_EXTENSION_URI` —
`https://rizom.ai/ext/anchor-profile/v1` (`shell/plugins/src/a2a/agent-card-schema.ts:10`)
— is declared in `capabilities.extensions` at `interfaces/a2a/src/agent-card.ts:82-88`.
Entity sharing follows the same convention as
`https://rizom.ai/ext/entity-sharing/v1`.

Crucially this keeps the determinism that argued against a skill. An
extension-aware handler matches the activation header and the `DataPart`
discriminator **before** dispatch reaches `AgentService`, so the fetch never enters
the agent. No model in the path, no new method, and the capability is discoverable
in the agent card rather than by prior arrangement.

The cost is that request and response are framed as A2A messages rather than a
bespoke RPC envelope. That is the correct trade: conformance buys discovery,
tooling, and an SDK upgrade path, and the framing is mechanical.

### 3. Provenance is a system envelope field, not domain frontmatter

Both transports record the same provenance, and its field names come from the
shipped `ai.rizom.brain.note` lexicon rather than a parallel invention:

```yaml
sourceBrain: did:web:peer.example # brainDid in the record
sourceEntityType: note
sourceEntityId: some-note
sourceRef: <contentHash over A2A | record CID over ATProto>
sourceState: active | stale | revoked
```

These must live in the **system envelope**, alongside `visibility`, and not in an
entity type's own frontmatter. Domain frontmatter cannot carry them: an
adapter's `frontmatterSchema` is a plain `z.object`, so it strips unknown keys,
and `toMarkdown` rebuilds the file from the parsed result. `NoteAdapter`
(`entities/note/src/adapters/note-adapter.ts`) reconstructs frontmatter from
`{title, status, error}` alone, so provenance written as note frontmatter is
destroyed by the first directory-sync export — silently, and taking the
subscription with it.

The envelope seam already exists for exactly this reason.
`applyVisibilityToMarkdown` (`shell/entity-service/src/frontmatter.ts:233`)
injects `visibility` on export and `stripSystemVisibility` (`:192`) removes it
before a domain schema validates — documented there as "a strict adapter schema
must accept its own exported file on re-import." `DEFAULT_SYSTEM_FIELDS` (`:36`)
separately keeps entity columns out of domain frontmatter. Provenance
belongs to that layer on the merits: it describes where an entity came from, as
visibility describes who may see it. Neither is a fact about notes.

The cost is honest and must be owned: this widens a shared entity-service seam
that currently has exactly one member, so the envelope becomes a list rather than
a special case. The benefit is that provenance then works for every entity type
without touching a single adapter.

The frontmatter _is_ the subscription — no separate subscription store exists,
and the refresh loop scans entities carrying `sourceBrain`, exactly as the
TrustFlow plan's refresh scans entities carrying `trustflowAgreementId`.

Because the envelope rides the content plane, a forged `sourceBrain` is an
expected input rather than an exotic one. It is harmless: the fetch is gated on
the named peer being `approved` in the agent directory, and approval is a runtime
record that content cannot write (`identity-and-trust.md` decision 4). A forged
source naming an unapproved peer fails closed before any network contact.

### 4. The read boundary: peers never reach `restricted`, and denial is indistinguishable from absence

`admin` is not grantable to a peer and cannot even be represented: the stored
grant type is `"public" | "trusted"` and `grant()` throws on `admin`
(`shell/auth-service/src/peer-trust-store.ts:9`, `:57`). The best a peer holds is `trusted`,
which `permissionToVisibilityScope()` maps to the `shared` scope — public and
shared content only. `restricted` entities are unreachable over A2A by
construction rather than by a check that could be forgotten.

Every miss returns **404**, never 403: not found, not approved, out of scope, and
wrong type are one response. A 403 would confirm that a named entity exists,
which is a disclosure in its own right.

### 5. Withdrawal, not recall. Retain and exclude; never delete

When an owner stops sharing, the consuming brain flips `sourceState` to
`revoked`, retains the entity as a record, and excludes it from every published
projection and site surface. The operator can see why something disappeared.

Over ATProto this is the only claim available: `deleteRecord` removes the record
but does not recall what already crossed the firehose. The consuming brain says
what is true — the owner withdrew it — and does not imply the copy was
destroyed everywhere. This matches the posture the TrustFlow plan takes on
agreements: auditable, not independently verified.

An unreachable peer is never treated as a withdrawal. `sourceState` is left
untouched.

### 6. ATProto is the change signal; the pull is authoritative

Jetstream tells a consuming brain that a peer's record changed. It does not
define the content. Cursor gaps are explicitly modelled in the atproto plan, and
a missed event must not mean a permanently stale copy, so the periodic pull
remains as reconciliation even for brains consuming the firehose.

This makes ATProto an accelerator on the refresh loop rather than a second
ingestion path with its own semantics, and it means the feature is complete and
useful before any Jetstream work ships.

### 7. First subscribe is confirmed; refreshes are not

Taking a peer's entity into the local brain writes into search results and
potentially a published site, so the first acquisition is a confirmation-gated
operator action, surfaced through the `InboxSource` contract alongside the
`agent-candidate` precedent.

Subsequent refreshes of an already-subscribed entity apply automatically. A
subscription that asked permission on every edit would not be a subscription.
State transitions to `stale` or `revoked` notify the operator without asking.

### 8. Mirrored content is never republished

An entity carrying `sourceBrain` is excluded from outbound ATProto projection
and from any outbound catalogue offer.

Without this, brain A republishes B's note under A's `brainDid`, and the second
hop destroys the provenance the first hop recorded. Forwarding someone else's
content is a distinct capability with its own consent question; it is not a side
effect of consuming it.

### 9. Content with no declared visibility is never shareable

A markdown file that declares no `visibility` key is the normal shape of exported
content, and `extractVisibilityFromMarkdown` is explicit that this absence "carries
no opinion about visibility" — `applyVisibilityToMarkdown` omits the key for public
entities precisely so that absence stays distinguishable from an explicit choice
(`shell/entity-service/src/frontmatter.ts:210-224`).

At the entity layer, `visibility.ts:28` nonetheless resolves undefined to
`public`. The least deliberate content in a brain therefore reads as the most
exposed, which is tolerable while only the operator can read it and is not once a
peer channel exists.

The peer read path resolves this without touching either rule: the extension's
`get` and `list` operations serve only entities whose visibility was
**explicitly declared**. No
opinion means not shareable, and the response is the same 404 as decision 4.

The rejected alternative is changing the default to `restricted`. It is a worse
trade even though its instinct is right. The entity-layer resolver and the
file-layer omission rule are a matched pair: flipping the resolver while the
exporter still omits the key for public content would demote every existing
unmarked file on its next import — the same silent demotion the frontmatter
module already warns against, in the opposite direction. Fixing that properly
means also inverting the export omission rule, which rewrites every file in every
brain-data repo. That is a fleet-wide content migration in service of a boundary
this plan can enforce locally, at its own edge, in one condition.

## Flows

### Directed pull (`shared` and `public`)

```
operator or refresh loop requests <peer, entityType, id>
  → resolve peer in agent directory
      ✗ discovered / archived / unknown → fail closed, no network contact
  → signed A2A message/send, X-A2A-Extensions: https://rizom.ai/ext/entity-sharing/v1
    DataPart { op: "get", entityType, id }
      ✗ extension not activated         → handled as ordinary prose by the agent
  → peer verifies RFC 9421 signature
      ✗ invalid / unresolvable JWKS     → 401
  → peer resolves grant: getA2APeerTrust(domain)
      fingerprint mismatch              → level falls back to "public"
  → peer scopes read: permissionToVisibilityScope(level)
      ✗ entity above scope              → 404
      ✗ visibility never declared       → 404 (decision 9)
      ✗ no such entity                  → 404
      ✗ type has no adapter             → 404
  → peer returns adapter.toMarkdown(entity) + contentHash
  → consumer validates against the local schema for that entityType
      ✗ invalid                         → reject, surface to operator, no write
  → first acquisition  → InboxItem, confirmation required (decision 7)
    refresh            → apply directly
  → store as a local entity of that type + provenance frontmatter (decision 3)
```

### Refresh and withdrawal

```
recurring check, plus any ATProto change signal for the same source
  → for each local entity carrying sourceBrain:
      peer unreachable        → leave sourceState untouched, do not assume withdrawal
      sourceRef matches       → active, no write
      sourceRef differs       → fetch, replace body, stay active
      404                     → sourceState: revoked, notify operator
      out of scope now        → 404, therefore revoked — a downgraded grant
                                reads as withdrawal, which is the correct outcome
  → published projections exclude every non-active entity; records are retained
```

### Ambient signal (public only, after the Jetstream slices)

```
Jetstream event for a known, approved repo DID
      ✗ unknown repo          → terminal no-fetch skip (atproto plan admission rule)
  → match record URI against local entities carrying sourceBrain
      ✗ no match              → ignore; this plan never creates entities from the stream
  → enqueue a directed pull for that entity (decision 6)
```

## Phases

Each phase is end-to-end and independently useful. Tests land with the phase,
written before the implementation.

### Phase 1 — Walking skeleton: fetch one entity from a peer

Declares `https://rizom.ai/ext/entity-sharing/v1` in `capabilities.extensions`
beside the existing anchor extension, and handles an activated `get` `DataPart`
ahead of `AgentService` dispatch. Adds a tool that pulls a named entity from a
named approved peer and prints it. No local storage yet.

Tests first: an unapproved peer fails before network contact; an unsigned or
badly signed request is 401; a `restricted` entity is 404 for a `trusted` caller;
a `shared` entity is 404 for a `public` caller and 200 for a `trusted` one; a
fingerprint mismatch downgrades the caller to `public`; an entity declaring no
visibility is 404 even for a `trusted` caller; a missing entity, an out-of-scope
entity and an undeclared one are byte-identical responses.

Conformance is its own test group, because it is what decision 2 turns on: the
agent card validates against the SDK's `AgentCard` type with both extensions
present; a request without the `X-A2A-Extensions` header reaches the agent as
ordinary prose instead of being served; the response echoes the activated
extension; and an unrelated A2A client that ignores the extension still completes
`message/send`, `tasks/get` and `tasks/cancel` unchanged.

### Phase 2 — Provenance: the pulled entity becomes a local entity

Widens the system envelope from the single `visibility` key to a list, adds the
decision 3 provenance fields to it, and stores the pulled entity through the
registered adapter so it appears in search and renders through its own type's
surfaces. Adds the decision 8 republication guard.

Tests first: provenance survives a full export and re-import through an adapter
whose domain schema does not know those keys — the regression decision 3 exists
to prevent; every existing adapter still accepts its own exported file;
round-trip preserves content and metadata; a forged `sourceBrain` naming an unapproved peer never triggers a fetch; an entity
carrying `sourceBrain` is excluded from ATProto projection; content failing the
local schema is rejected without a write.

### Phase 3 — Subscription: refresh, staleness, withdrawal

The recurring check, `sourceState`, and the published-projection filter. This is
the phase where "share" becomes "sync".

Tests first: a matching `sourceRef` performs no write; a differing one replaces
the body; a 404 flips to `revoked` and notifies; an unreachable peer leaves state
untouched; a revoked entity is retained but absent from every published surface;
a downgraded peer grant reads as withdrawal.

### Phase 4 — Discovery and the review gate

The extension's `list` operation, scoped by the same `permissionToVisibilityScope`
call, so a consumer can see what a peer offers without guessing identifiers. First
acquisition moves behind the `InboxSource` with a confirmation-gated action.

Tests first: listings never include out-of-scope entities or leak their count;
first subscribe requires confirmation and refresh does not; a declined item
writes nothing; the source degrades in isolation when one peer is unreachable.

### Phase 5 — ATProto as change signal

Gated on the atproto plan's known-only admission correction. Jetstream events
for approved repos enqueue a directed pull for entities already subscribed.

Tests first: an event for an unknown repo performs no fetch and no write; an
event with no matching local subscription creates nothing; a missed event is
still reconciled by the periodic pull; the stream never originates an entity.

## What this plan does not do

- No bidirectional sync, and no automatic merge of concurrent edits (decision 1).
- No shared git remote between brains operated by different people. Two brains
  run by one operator may share a content repo today with no code; across a trust
  boundary it grants content-plane write access into another brain's database,
  against `identity-and-trust.md` decision 4.
- No MCP-to-MCP brain federation (decision 2).
- No entity creation from the ATProto firehose (decision 6, and the atproto
  plan's admission rules).
- No republication or forwarding of mirrored content (decision 8).
- No change to the visibility default at `visibility.ts:28`, and no change to the
  export omission rule for public entities. Decision 9 enforces the boundary at
  the peer read path instead, so no brain-data file is rewritten.
- No change to `permissionService`, the peer-trust store, the
  `discovered → approved` lifecycle, or the visibility levels themselves. This
  plan consumes all four unchanged, and touches the entity-service envelope only
  to add provenance keys beside `visibility` (decision 3).
