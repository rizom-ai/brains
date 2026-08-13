# Plan: TrustFlow federation integration

## Status

**Proposed.** No code exists. This plan settles the seam between the
Planetir/Kaphera "TrustFlow" dataspace and a brain, and phases the integration.
It has one external dependency that is not ours to schedule: a real catalogue
endpoint from Kaphera (their prototype's API is fictional). Every phase below is
testable against a recorded fixture without it.

TrustFlow's catalogue is asset-generic; their prototype demonstrates it with
events only. This plan integrates the general layer and treats `event` as the
first asset type through it (decisions 0 and 7).

Related: [identity-and-trust.md](./identity-and-trust.md) (domain-as-brain-identity,
peer-trust grants), [atproto-integration.md](./atproto-integration.md) (record
publication and discovery), [unified-inbox README](../../plugins/unified-inbox/README.md) (the
`InboxSource` contract this consumes).

Interaction design:
[dataspace-workspace-mockup.html](../design/dataspace-workspace-mockup.html) —
the two operator levels (inbox and dataspace workspace), the asset-type tab
strip that keeps decision 0 visible, held agreements with both hash copies, and
triage that shows its reasoning. Four scenarios: offers waiting, quiet, terms
changed, revoked.

## What TrustFlow is

Assessed from the prototype at `the-federation-prototype.vercel.app` (read from
the shipped bundle, not the marketing copy).

**Events are the demo vertical, not the model.** The prototype only shows
events, but the vocabulary underneath it is the generic IDSA/Eclipse Dataspace
Protocol one — participants, catalogue, offer, policy evaluation, contract
negotiation, agreement — and their own copy is asset-neutral where it matters:
the local trust level governs "how incoming catalogue entries **and negotiation
requests** are queued", and what is or isn't trusted is "the underlying
**dataspace connection**". Nothing in that layer is event-shaped. An event is
one asset type carried over it.

This plan is therefore written against the general layer, with events as the
first asset type because it is the only one both sides already have a shared
schema for.

Six surfaces:

- **Network directory** — peers are networks identified by `did:web:` (e.g.
  `did:web:leadingedge.example`), listed on a governance roster with a status of
  `active` / `pending` / `suspended` published by TrustFlow, plus a **locally
  stored** trust level of `Auto` / `Review` / `Ignore`. Their own framing: the
  trust level "is stored locally by Planetir's own application… not whether the
  underlying dataspace connection is trusted."
- **Catalogue** — peers publish offers. The demo populates it with events, where
  preview metadata (date, location, format, attendance, audience, tags,
  publisher) is open and full description, agenda, and speaker list are withheld
  behind a `LOCKED` state. The **preview / locked split is the general
  mechanism**; which fields fall on which side is per asset type.
- **Accept → contract negotiation** — `Verifying credentials → Evaluating policy
→ Finalising agreement`, producing an agreement ID, a canonical `sha256:` hash
  held on both sides, a promotional code, a registration link, and an affiliate
  rate "per Federation Affiliate Agreement v1.0". Labelled in-app as _"Simulated
  locally — this demonstrates what a Dataspace Protocol contract negotiation
  would look like end to end"_, i.e. IDSA/EDC DSP.
- **Attribution record** — bilateral and non-repudiable, matching agreement
  hashes on both sides, "held by both parties, amendable by neither", signed by
  the provider and explicitly "auditable, not independently verified".
- **Accepted offers** — consumed **live**, not copied:
  `GET /v1/trustflow/accepted` with a bearer token. Publisher updates and
  revocations propagate immediately. The conversion dashboard (conversions,
  gross value, refunds keyed on a promotional code) is event-commerce specific
  and does not generalize — see "What this plan does not do".
- **Reciprocity** — a visibility read, explicitly "not a ledger of obligations";
  no minimum promotion requirement.
- **Agent rules** — plain-language instructions that triage the incoming
  catalogue into auto-accept / review / ignore. Marked in-app: _"This is a design
  preview. Rule parsing is approximate."_

## The seam

**TrustFlow is the governance and contract layer over shared assets. A brain is
the node runtime a member actually operates.**

They own membership, policy evaluation, negotiation, and the agreement artifact
— for any asset type. We own identity at the node, triage, the asset store, and
publication — also for any asset type. Neither side has to absorb the other's
model, and each covers the other's largest gap: they have no runtime, agent,
content store, or publishing surface; we have no agreement primitive and no way
to share an entity under terms.

The seam holds precisely because both sides are already asset-generic. Their
catalogue carries offers; our entity model carries typed entities with
per-type projections (`AtprotoProjectionRegistry`, keyed by `entityType`). The
integration is a **mapping between those two generic layers**, not an event
importer. Events are what we send through it first.

## What already lines up

Every row on our side is shipped and verified in code.

| TrustFlow                                            | Ours                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `did:web:<network>` identity                         | A brain's canonical identity **is** its domain, spelled `did:web:<domain>`; ES256 + Ed25519 published at `/.well-known/jwks.json` (`identity-and-trust.md` decisions 2–3)                                                                       |
| Network directory / governance roster                | `agent` entities with `discovered` / `approved` / `archived` (`entities/agent-discovery/src/schemas/agent.ts`), gated at `a2a_call` (`interfaces/a2a/src/client.ts:692`)                                                                        |
| Governance status vs. local trust level (two layers) | The same content/runtime split: entity `status` drives directory UX, the `a2a_peer_trust` runtime record (domain + pinned key fingerprint + granted level) is what inbound verification consults (`shell/auth-service/src/peer-trust-store.ts`) |
| Catalogue of typed offers                            | Typed entities with per-type projections: `AtprotoProjectionRegistry` (`shared/atproto-contracts/src/projection-registry.ts`) registers a projection per `entityType`, with canonical lexicons in `shared/atproto-contracts/src/lexicons/`      |
| Agent rules (approximate, by their own note)         | `InboxSource` contract (`shell/plugins/src/inbox-registry.ts:99`) plus an agent that can execute plain-language instructions for real                                                                                                           |
| Accepted-offers API                                  | A2A (RFC 9421 signed, `shared/http-signatures`) and MCP                                                                                                                                                                                         |

Their identity layer and ours are the same primitive, and both sides already
model "typed asset published under a per-type projection". A brain can be a
TrustFlow node without inventing any new identifier or any new content model.

## What is missing

**On our side:**

- No catalogue projection. `AtprotoProjectionRegistry` maps an entity type to a
  PDS record; nothing maps an entity type to a catalogue offer with a
  preview/locked split.
- No agreement primitive. Our peer-trust grant is per-**peer** and coarse
  (`trusted` / `public`); theirs is per-**asset** with terms. This asymmetry is
  the real integration cost, and it is what "sharing an entity under negotiated
  terms" requires. Nothing in our stack expresses it today.
- No `event` entity and no `ai.rizom.brain.event` lexicon. Confirmed absent —
  but this is one asset type, not the integration's shape.
- `unified-inbox` has the contract and registry but no shared operator surface
  yet (its Phases 1 and 3 are proposed).

**On their side:** no execution runtime at all — the rules pane is a mockup, and
there is no asset store or publishing surface behind the catalogue. Their
catalogue is generic; they have exactly one asset type populating it.

## Decisions

### 0. The integration is asset-type-agnostic; `event` is never special-cased

The plugin knows about catalogue offers, agreements, and triage. It does not
know what an event is.

Asset types opt in by registering a **catalogue projection**, keyed by
`entityType`, mirroring the shape `AtprotoProjectionRegistry` already
establishes:

```ts
interface CatalogueProjection<TEntity extends BaseEntity = BaseEntity> {
  entityType: string;
  // Fields safe to publish before any agreement exists.
  buildPreview(entity: TEntity): CataloguePreview;
  // Fields released only to a peer holding an agreement.
  buildDetail(entity: TEntity): CatalogueDetail;
  // Inbound: a peer's offer becomes a local entity of this type.
  fromOffer(offer: CatalogueOffer): Partial<TEntity>;
}
```

The preview/locked split lives in the projection, per type, because only the
type owner knows which of its fields are safe before terms exist. A grep for
`"event"` in `plugins/trustflow` should return nothing outside tests and
fixtures; if it does, the abstraction has leaked and the plan has failed.

This is not speculative generality — the precedent registry already exists and
is keyed the same way, and phase 4 proves the contract with a second type
rather than asserting it.

### 1. We do not build a Dataspace Protocol connector

EDC is a heavyweight, Java-centric stack, and implementing DSP contract
negotiation ourselves buys nothing for a first integration. TrustFlow owns
negotiation. We treat the agreement as an **opaque, referenceable artifact**:
the agreement ID and canonical hash are stored as provenance on the accepted
entity and are never re-derived or re-validated by us. Our own claim about it is
exactly theirs — auditable, not independently verified.

If bilateral non-repudiation later needs to be ours too, the substrate already
exists (`shared/http-signatures`, RFC 9421); that is a separate decision, not a
prerequisite.

### 2. Peer protocol, not vassal registry

Brains federate to each other over A2A and ATProto. TrustFlow is **one
participant** whose catalogue we ingest and to which we publish — not the
registry our federation depends on. Concretely: a TrustFlow network appears in
our agent directory as an ordinary `agent` entity subject to
`discovered → approved`, and its governance roster is an input to that review,
never an override of it. We never grant inbound trust because TrustFlow says a
network is `active`.

This keeps `identity-and-trust.md` decision 4 intact — approval remains one
anchor-confirmed action writing one runtime peer-trust record — and means a
brain loses nothing if TrustFlow disappears.

### 3. Their trust level is inbox triage; ours is authorization. They stay separate axes

`Auto` / `Review` / `Ignore` is a **triage preference over incoming catalogue
entries**. `admin` / `trusted` / `public` is **authorization for callers**.
Mapping one onto the other would be a category error and would let a triage
setting silently mint access. The TrustFlow trust level is stored by the
integration plugin as plugin state; it never touches `permissionService` or the
peer-trust store.

### 4. The catalogue is an `InboxSource`, and the plugin ships its own tool

The catalogue is exactly the shape `unified-inbox` already defines: source-owned
state, live projection, actions that delegate back with the actor's permission
level. We register `sourceId: "trustflow-catalogue"`.

Because the shared operator surface has not shipped, the plugin **also** exposes
a `trustflow_catalogue` tool so the walking skeleton is usable end to end
without blocking on `unified-inbox` Phase 1. The tool reads the same
projection — it does not fork the model, and it is deleted when the shared
surface lands.

### 5. Accepted offers are entities; the live-fetch contract is honoured by refresh, not by copying

Their design is deliberate: accepted offers are fetched live so revocation
propagates. Naively copying them into `brain-data/` would break that.

Resolution: an accepted offer **is** a local entity of its projected type — that
is what makes it publishable, searchable, and site-renderable — but it carries
its TrustFlow agreement ID and a `sourceState` of `active` / `revoked` /
`stale`, and a recurring check re-reads the accepted endpoint and flips that
state. A revoked entity is retained as a record and excluded from every
published surface by the projection, not deleted. The operator sees why
something vanished from the site.

### 6. Agent rules execute against brain content, not just offer metadata

Their rule engine is metadata-matching and admits it is approximate. Ours reads
the same plain-language rules as agent instructions and evaluates them with the
brain's own content in context — does this offer match what our members actually
work on? That is the capability we add that they cannot, and it is the reason
this integration is worth doing rather than just consuming a feed.

Rule evaluation proposes; it never auto-accepts a **paid** or **terms-bearing**
offer without confirmation. Accepting incurs a binding agreement, so it goes
through the standard confirmation flow regardless of what the rules say.

### 7. Which asset types we share, and in what order

Decision 0 makes the mechanism generic; this decides what actually goes through
it. Ordered, with the reasoning stated so it can be argued with:

1. **`event`** — first, and only because it is the one type where both sides
   already agree on the schema. It is an interop proof, not a value proof.
   Cheapest possible demonstration that the two layers connect.
2. **`link` and `topic`** — curated knowledge with a natural preview/detail
   split (the link and its framing are public; the annotation and why-it-matters
   are the shared asset). Low risk, and the first type where sharing under terms
   is worth something to a member.
3. **`project` / `portfolio`** — member work. The highest-value type and the
   real reason to care about per-asset terms: "you may see that we did this
   work, under an agreement" is exactly the capability a network of independent
   experts needs and does not have.

**Explicitly out, permanently:** `note` and `conversation-memory`. These are
private working memory and team conversation. They have no safe preview
projection, and a catalogue entry for either would leak by construction.
Registering a catalogue projection for them is a rejected design, not a
not-yet.

The interesting claim is item 3, and it is worth being blunt about it with
Kaphera: their generic layer is more valuable to us than their demo vertical.
Events are a directory feature. **Member work shared under negotiated terms is
the collective's actual unmet need**, and it is what the two stacks together can
do that neither does alone.

## Flows

### Catalogue ingest

```
recurring check (hourly)
  → GET <trustflow>/v1/catalogue  (bearer, per-brain token)
      ✗ 401/403        → mark source degraded, notify operator, keep last projection
      ✗ network/5xx    → back off, keep last projection (InboxSource failure isolation
                          already prevents one bad source from breaking the inbox)
  → validate each entry against the catalogue schema
      ✗ invalid entry  → skip that entry, log, continue (never fail the whole batch)
  → resolve offer.assetType → CatalogueProjection
      ✗ no projection registered → drop from projection, log once per type
        (an unknown asset type is not an error; we simply don't handle it yet)
  → project to InboxItem[]  (preview fields only; LOCKED entries carry no body)
  → agent rule evaluation
      → auto-accept candidate + free + no terms  → accept flow
      → auto-accept candidate + paid/terms       → queue as review (decision 6)
      → review                                    → InboxItem, urgency normal
      → ignore                                    → dropped from projection
```

### Accept

```
operator (or rule) accepts item
  → confirmation flow  (always, for paid/terms-bearing offers)
      ✗ declined → no state change
  → POST <trustflow>/v1/offers/<id>/accept
      ✗ rejected → surface TrustFlow's reason verbatim; item stays in inbox
  → response carries agreement id, canonical hash, and any type-specific terms
    (for an event: promo code, registration link, affiliate rate)
  → projection.fromOffer(offer) → create local entity of offer.assetType
      frontmatter: trustflowAgreementId, trustflowHash, publisherDid,
                   sourceState: "active", plus type-specific terms
      body: full detail unlocked by the agreement
  → entity is now searchable and site-renderable through its own type's surfaces
```

### Revocation refresh

```
recurring check (daily)
  → GET <trustflow>/v1/accepted
      ✗ unreachable → leave sourceState untouched, do not assume revoked
  → for each local entity (any type) carrying a trustflowAgreementId:
      present & hash matches  → sourceState: "active"
      present & hash differs  → sourceState: "stale", notify operator (terms changed)
      absent                  → sourceState: "revoked", notify operator
  → published projections exclude non-active entities; entities are retained
```

### Outbound publication

```
local entity marked shareable
  → look up CatalogueProjection for its entityType
      ✗ none registered → reject the share with "type not shareable" (decision 7)
  → projection.buildPreview(entity) → catalogue offer
  → POST <trustflow>/v1/offers
      ✗ rejected → surface reason, entity keeps shareState: "rejected"
  → in parallel, publish the entity's ai.rizom.brain.* record to the PDS
      (the ATProto path is independent — decision 2: we are not dependent
       on TrustFlow to federate our own assets)
```

## Phases

Each phase is end-to-end and independently useful. Tests land with the phase.

### Phase 1 — Walking skeleton: catalogue visible

`plugins/trustflow` registers an `InboxSource` and a `trustflow_catalogue` tool.
Read-only. One real TrustFlow catalogue entry appears in the operator's inbox
with preview fields, LOCKED state respected.

Tests first: catalogue schema contract test against a recorded fixture; source
registration and finalization; failure isolation (a 500 degrades this source
only); LOCKED entries never carry a body.

Ships without Kaphera's endpoint by pointing at the fixture.

### Phase 2 — Accept, with the agreement as provenance

`act()` implements `accept` / `ignore`, dispatching to TrustFlow with the actor's
permission level. Accepting stores the agreement ID and canonical hash. No local
entity yet — the accepted item simply leaves the inbox and is listed by the tool.

Tests: accept dispatch carries the actor; confirmation is required for
paid/terms-bearing offers; a rejected accept leaves the item in the inbox;
agreement fields round-trip.

### Phase 3 — The catalogue projection contract, with `event` as its first implementation

Two things, deliberately in one phase so the abstraction is born with a user:
the `CatalogueProjection` registry (decision 0) in the plugin, and
`entities/event` as the first type to register one — a new entity package
following the `entities/link` layout (schemas, adapters, datasources, templates,
tools).

Accepted offers become entities of their projected type with TrustFlow
provenance; they render and appear in search. Adds the daily revocation refresh
and the `sourceState` filter, both written against the registry rather than
against `event`.

Tests: projection registration and lookup; unknown asset type is dropped, not
fatal; entity round-trip through the adapter; revoked entities excluded from
published projections but retained; hash-mismatch flips to `stale` and notifies.

### Phase 4 — A second asset type proves the contract

Register a catalogue projection for `link` (and `topic` if the split is
identical). This is the phase that tests decision 0 for real: if adding the
second type requires touching plugin internals, the abstraction was wrong and
gets fixed here, while the cost of fixing it is still two implementations rather
than five.

Outbound sharing lands with it — local entities of any registered type can be
offered to TrustFlow, and `ai.rizom.brain.event` joins the lexicons in
`shared/atproto-contracts`. Both paths independent (decision 2).

Tests: the `link` projection is added with no diff inside `plugins/trustflow`
outside registration; a grep for `"event"` in plugin source returns only tests
and fixtures; lexicon validation; a TrustFlow rejection does not block ATProto
publication.

### Phase 5 — Agent rules that actually run

Plain-language rules stored as plugin state, evaluated by the agent against
brain content, feeding the triage branch of the ingest flow. This is the phase
that replaces their "rule parsing is approximate".

Tests: eval coverage for rule classes (publisher match, tag match, asset-type
constraint, cost constraint, governance-status constraint); paid offers never
auto-accept; ambiguous rules fall through to `review` rather than guessing.

### Later — `project` / `portfolio`

Not phased here because it needs a product decision this plan cannot make: what
terms a member wants attached to their own work. Deferred deliberately, and
named so it is not forgotten — decision 7 argues it is the highest-value type.

## What this plan does not do

- No DSP/EDC connector (decision 1).
- No reciprocity accounting, and no conversion dashboard. Theirs is explicitly
  "not a ledger of obligations"; mirroring it would invent an obligation model
  neither side has. The conversion dashboard is additionally event-commerce
  specific — promo codes and ticket-price affiliate rates do not generalize to a
  shared `link` or `project`, and building it would push an event-shaped
  assumption into the generic layer, against decision 0.
- No catalogue projection for `note` or `conversation-memory` — rejected, not
  deferred (decision 7).
- No change to `permissionService`, the peer-trust store, or the
  `discovered → approved` lifecycle (decisions 2–3).
- No new identifier scheme. `did:web:<domain>` is already the shared primitive.
