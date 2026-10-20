# Plan: AT Protocol Integration

## Status

Shipped and live on `rizom.ai`: the plugin foundation (app-password PDS auth, `did:web` routes), projection-backed outbound publishing (`post`, `note`, `link`, `deck`, `social-post`, `series`, `project`, `topic`) with local lexicon validation, blob upload and idempotent upserts, canonical `ai.rizom.brain.*` contracts in `@brains/atproto-contracts`, lexicon authority through `_lexicon.brain.rizom.ai` and `com.atproto.lexicon.schema` records, the member-handle endpoint, and bounded repo-hosted card discovery. The brain card publishes on boot and republishes on identity and skill changes (`0.2.0-alpha.500`); the org repo `did:plc:oehciuqunzskplljt3qnnncw` holds mirrored `ai.rizom.brain.note` and `ai.rizom.brain.topic` records.

Jetstream transport is on `main` and disabled in every fleet configuration. It still couples `jetstream.enabled` to unknown-agent creation (`newAgentsPerHour` and `pendingCandidateCeiling` in `plugins/atproto/src/config.ts`), so no canary may enable it before the known-peer correction ships.

Open: the known-peer correction, Candidate Inbox and optional ambient intake; outbound OAuth; per-member handle adoption; the Zod-to-lexicon emitter; inbound ingestion; feed generators; and ambient federation.

## Reference invariants (needed by the open work)

- **Ownership boundary**: the ATProto plugin owns identity, PDS auth, transport, blobs, generic publishing, and the brain card publisher. Entity packages own projection definitions and mappers, importing canonical lexicons and Zod schemas from `@brains/atproto-contracts` — no duplicated lexicon JSON. Protocol authority for `ai.rizom.brain.*` is the `_lexicon` DNS delegation plus `com.atproto.lexicon.schema` records in the org repo (shipped 2026-07-21); the registry plugin's HTTP lexicon routes on `rizom.ai` are a human-facing mirror, not the resolution path third-party tools consult.
- **Projection selection rule**: durable, user-meaningful public entities get quiet semantic projections. Public visibility is required but not sufficient — an entity package must register an explicit safe projection. Ephemeral/support/directory entities (`skill`, `agent`) are not projected.
- **Validation stance**: records are validated locally against canonical contracts before PDS writes; PDS writes use `validate: false` because public PDS instances do not know Rizom lexicons.
- **Identity model**: `repoDid` (PDS account that signs records) ≠ `brain.did` (`did:web:<site-host>`) ≠ `anchor.did` (owner, groups brains across domains) ≠ `accountDid` (member's personal atproto account, served at `/.well-known/atproto-did` for handle verification). See [Identity & trust architecture](./identity-and-trust.md).
- **Feed posts are out of scope for semantic publishing**: `app.bsky.feed.post` distribution belongs to a later `social-post` workflow/provider, never a side effect of entity records.

## Open work

Ordered; each slice ships independently unless it declares an explicit dependency gate.

### 1. Publishing trigger (make brains publish themselves) — shipped and verified live

The removed tool surface has been replaced with event wiring inside the atproto plugin:

- **Brain card on ready**: with credentials configured, the plugin `ready()` lifecycle hook publishes/refreshes `ai.rizom.brain.card/self`. `putRecord` under `literal:self` is an idempotent upsert, so every boot converges the card; no dedupe state is needed.
- **Entity records on publish events**: the plugin subscribes to `publish:completed`, the publish pipeline's broadcast fan-out event, rather than request-style `publish:report:success`. It also subscribes to entity updates. For any entity type with a registered projection, it builds, validates, and upserts the projected record. Entity deletion (or a projected entity turning non-public) calls `com.atproto.repo.deleteRecord`, making the PDS repo a quiet mirror of public projected state.
- **Safety boundary, sharpened**: projection registration is the consent gate. Once an entity package registers a projection and the operator configures credentials, publishing for that type is automatic. No entity type is published without a registered projection; individual records do not require a manual act.
- **Failure handling**: PDS failures log and broadcast `atproto:publish:failed`. They do not emit `publish:report:failure`, because that request belongs to the source publish provider and would incorrectly fail an already-successful local publish. Trigger handlers always isolate failures from the source operation.
- **Tests**: card upsert on ready (and skipped without credentials), publish completion → record upsert, delete → record delete, public → non-public → record delete, no publish for types without projections, PDS client deletion, and failure isolation.

Verified live: `ai.rizom.brain.card/self` on `did:plc:oehciuqunzskplljt3qnnncw` carries the full identity payload and republishes on identity and skill changes (#566, `0.2.0-alpha.500`); `com.atproto.repo.listRecords` on that repo returns mirrored `ai.rizom.brain.note` and `ai.rizom.brain.topic` records. yeehaa.io publishes its own card (`did:plc:dtxrise7xa4kat6mh4zd4lqe`).

### 2. Jetstream known-peer monitoring (Phase 4 tail) — correction required before canary

The bounded discovery pipeline is implemented end to end: `discoverBrainCards` resolves a repo, reads and validates the current `{ kind, category }` anchor shape, and broadcasts `atproto:brain-card:discovered`. Both controlled cards were republished in that shape on 2026-08-11, the public agent-directory projections were rebuilt and verified from those records, and cross-shape normalization is absent.

`0.2.0-alpha.224` shipped the Jetstream transport and hardening work but coupled `jetstream.enabled` to automatic unknown-agent enrollment. That is the wrong product boundary. Publishing a public brain card grants protocol-level discoverability; it does **not** grant membership in every receiving brain's agent directory. Enabling transport must not silently enable admission.

The corrected first use of Jetstream is a change feed for **already-known repo DIDs**:

- A matching event for a known agent may trigger authoritative card refresh.
- A matching delete for a known agent may update card availability.
- An unknown repo DID is checkpointed and discarded before candidate-controlled DNS, PLC, DID-document, or PDS access.
- An unknown event creates no `agent`, emits no new-agent notification, and enters no review queue.

This correction keeps the useful liveness and refresh properties without turning the global ATProto stream into an implicit social graph.

#### Admission boundary — release-blocking

- Jetstream transport and agent admission are separate capabilities. `jetstream.enabled` controls only the websocket monitor.
- Explicit, confirmation-gated `agent_connect` remains the direct path into the agent directory. Passive sources—including directory introductions and optional ambient ATProto observations—feed the Candidate Inbox described below, not the `agent` collection.
- `discoverBrainCards` may retain an explicit trusted/manual creation path, but the Jetstream caller must never request agent creation for an unknown repo.
- Before any candidate-controlled network request, classify the event repo DID against existing `agent` entities and the explicit ambient-candidate policy. Treat discovered, approved, and archived agents as known and preserve their current local status on refresh; an unknown repo is a no-fetch skip unless ambient intake is explicitly enabled.
- Existing `enabled: true` configurations must resolve to known-only behavior after the correction. There is no backward-compatibility case where omission of a new field preserves alpha.224's open admission.
- Quarantine or remove Jetstream creation-oriented settings (`newAgentsPerHour`, `pendingCandidateCeiling`, and skill keywords as admission criteria) from the known-peer path. Resource budgets for websocket processing and known-card fetches remain.

Approval remains downstream of admission, not a substitute for it. `status: discovered` is still non-callable, but that fact does not justify filling the directory from a global stream.

#### Trust and collision boundary

For a known repo refresh, Jetstream remains an untrusted signal and never the record source:

- Accept only `create`/`update`/`delete` commits for `ai.rizom.brain.card/self`; reject every other collection, rkey, operation, and non-`did:plc` repo before network access.
- Ignore embedded Jetstream records. Resolve the known repo's authoritative PDS, refetch `getRecord`, and require the returned canonical AT URI repo to equal the event DID.
- Require HTTPS `siteUrl`; bind its hostname to `brain.did`; require the `did:web` document to identify itself and bind back to the repo through `alsoKnownAs`.
- A known repo cannot move onto another agent's domain, and another repo cannot inherit an existing agent's approval. Repo or domain migration remains an explicit reapproval operation.
- Refresh only remote-owned card fields. Preserve local status, approval, trust, endpoint choices, provenance, and relationship notes.

#### Consumer and resource boundary

- Keep Jetstream disabled by default and configurable per brain through `@rizom/ops`. No canary may enable it before the admission correction ships.
- Run one websocket daemon only on an opted-in full boot; never during startup-check or eval.
- Preserve bounded queue depth, concurrency, per-DID coalescing/cooldown, fetch budgets, retries, redirect/body/time limits, credential stripping, and public-address checks.
- With ambient intake disabled, an unknown repo is a terminal no-fetch skip. Count it for operational visibility without retaining identifying candidate data or producing notifications.
- Record queue depth, dropped/coalesced events, known refresh outcomes, unknown no-fetch skips, cursor gaps, and reconnects. Revisit a shared fleet relay if per-brain stream cost becomes material.

#### Cursor, replay, and liveness

- Keep the Zod-validated durable contiguous cursor and bounded replay dedupe state. Advance only after a matching event reaches a terminal outcome; an unknown no-fetch skip is terminal.
- Inclusive replay must not repeat known-card fetches or availability mutations after the event has been checkpointed.
- With no cursor, start at `now - replayWindow`; clamp cursors older than retained history and emit an observable gap.
- Retain bounded reconnect backoff, jitter, and shutdown behavior. Queued work left behind the durable checkpoint replays after restart.
- Brain-card identity/profile/skill changes republish immediately, and the low-frequency heartbeat remains useful for eventual refresh by brains that already know the repo. It is no longer described as a mechanism for automatic stranger discovery.

#### Deletion and staleness

- A delete updates availability only when the repo DID already belongs to a local agent. Unknown deletes are terminal no-ops.
- Card deletion or repeated refresh failure retains the last verified snapshot and never deletes the agent, revokes approval, or changes runtime trust automatically.
- The same bound card clears unavailable state when it reappears. Explicitly discovered but never-approved known agents may still follow the configured stale archival policy; approved agents never auto-archive.

#### Unified Candidate Inbox — approved UX direction

Sightings and optional ambient ATProto observations belong in the shared operator inbox through an `agent-candidates` `InboxSource`. A candidate is evidence about a possible relationship, not an agent and not part of the public directory.

- Add a durable `agent-candidate` entity owned by the agent-discovery compound package. It is operator-visible, never projected or published, bounded by retention policy, and separate from `agent` approval/runtime trust.
- Merge evidence by stable identity (`repoDid` first, normalized domain fallback) so one candidate can carry multiple sources instead of producing duplicate cards.
- Record source-specific provenance:
  - **Trusted introduction**: introducer agent, hop count, first/last observed timestamps.
  - **ATProto observation**: repo DID, domain, card URI/CID, verification time.
  - Additional independent sources append evidence and raise review priority.
- The source owns candidate ranking and emits content-safe inbox items with badges such as “Introduced by Alice” and “Found on ATProto”; the shared inbox owns aggregation and rendering.
- **Add to directory** authoritatively revalidates the current source, then creates an `agent` through a confirmation-gated operator action. Local approval and runtime trust remain explicit downstream decisions.
- **Ignore** dismisses the candidate without creating an agent. Keep a bounded identity tombstone so replay does not immediately recreate it; a materially changed identity/card or a new trusted introducer may resurface it for review.
- Explicit `agent_connect` may bypass the inbox because the operator already expressed intent, but it retains its existing confirmation and verification gates.
- The shared inbox digest summarizes pending candidates and links to the unified Inbox surface, never `/agents?status=discovered`.

Ambient ATProto intake remains a separate opt-in capability such as `jetstream.ambientCandidates.enabled`; it is never inferred from `jetstream.enabled`. With ambient intake disabled, unknown repo events remain terminal no-fetch skips. With it enabled, unknown cards may be safely fetched and validated only to upsert bounded candidate evidence—never an `agent`.

There is no `auto-discover` mode. Adding one requires a separate product decision, plan review, abuse model, and release approval.

#### Corrective implementation sequence

Ship this as three independently reviewed slices:

1. **Known-only safety correction**
   - Add a failing behavior test proving that `jetstream.enabled: true` plus an unknown valid event performs zero candidate-controlled fetches, entity writes, discovery events, and notification writes.
   - Add the known-repo preflight before `discoverBrainCards`; route known create/update events through authoritative refresh with creation disabled.
   - Restrict delete/unavailability handling to known repo DIDs and remove alpha.224's automatic unknown-agent digest path.
   - Update config, `@rizom/ops`, baseline fixtures, README, and this plan so transport enablement cannot imply admission.
2. **Unified Candidate Inbox source**
   - Add the `agent-candidate` schema/adapter, source-provenance merge rules, retention/dismissal semantics, `InboxSource` registration, and confirmation-gated Add/Ignore actions. Reuse the shared inbox UI rather than adding a candidate-specific inbox.
   - Change approved-peer directory scans to upsert trusted-introduction candidates instead of `agent` entities.
   - Migrate legacy unapproved `agent.status: discovered` records into candidates without touching approved agents; test idempotence and rollback behavior.
3. **Optional ambient intake**
   - Add the separate disabled-by-default `ambientCandidates` configuration.
   - Route safely validated unknown ATProto cards into candidate evidence under independent queue/fetch/retention budgets.
   - Reuse the inbox digest and dedupe path; never create agents from the stream.

Preserve hostile-input, collision, cursor, retry, reconnect, heartbeat, staleness, and shutdown coverage throughout all slices.

#### Acceptance tests

- Unknown valid or hostile repo event with ambient intake disabled → no DNS/PLC/PDS request, no candidate or agent mutation, no notification, cursor advances.
- Known discovered/approved/archived repo event → authoritative refetch and idempotent refresh; status and local relationship fields remain unchanged.
- Known delete → unavailable metadata only; unknown delete → no-op; approval is never revoked.
- A known repo claiming another known domain fails closed; explicit repo migration still requires reapproval.
- Trusted directory introductions create or enrich one provenance-bearing candidate, never an agent.
- With ambient intake enabled, a valid unknown card creates or enriches one candidate; repeated/multi-source observations merge, and no path creates an agent automatically.
- Add revalidates and requires confirmation before creating an agent; Ignore survives replay; new trusted evidence may resurface a dismissed candidate.
- Migration moves only legacy unapproved discovered agents; approved agents remain byte-for-byte untouched.
- Existing Jetstream configs without ambient-candidate configuration behave known-only.
- Queue/concurrency bounds, dedupe, cursor persistence, stale-cursor gaps, retry exhaustion, reconnect, heartbeat, and shutdown remain covered.
- Startup-check/eval boots open no socket.

#### Release remediation and gates

- First verify read-only that no deployed brain enables Jetstream; alpha.224's behavior is dormant only while that remains true.
- Build the correction forward from the release commit in an isolated worktree; do not attempt to undo npm publication with a Git revert.
- After explicit approval, publish a corrective alpha release so the fixed package replaces alpha.224 on the active dist-tag. Deprecating alpha.224 is a separate operator decision.
- Implementation, merge to `main`, and release are three independent approvals. Approval of one does not imply either of the others.

### 3. Outbound ATProto OAuth (fleet-user publishing) — auth boundary available

App password is the sanctioned headless credential for operator-configured brains; OAuth is the fleet-user story.

**Storage boundary:** the private [`auth-service` runtime](../../shell/auth-service/README.md) and Admin APIs have shipped. The ATProto plugin must not create a second token database or plugin-local JSON store. The existing OAuth grant tables hold credentials the brain **issues** to MCP clients; outbound ATProto OAuth needs a distinct external-provider connection store for credentials the brain **receives** from Bluesky. That store belongs on the same private auth runtime plane, with provider tokens and DPoP key material encrypted or otherwise isolated and never written to entities, Git, or `brain.yaml`.

Implementation requirements:

- Add an Admin-only Console "connect Bluesky" flow using `@atproto/oauth-client-node` (confidential client via existing JWKS); browser user-delegation with PAR/PKCE, DPoP, callback-state binding, and rotating refresh tokens.
- Persist the connection against the authenticated runtime user, with reconnect, disconnect/revocation, audit, expiry, and suspended-user behavior following auth-service policy.
- Capture the account DID, repo DID, and PDS endpoint in the same gesture for publishing and member-handle plumbing (see 4).
- Extend `AtprotoPdsClient` to consume and refresh the stored OAuth session while preserving app-password support for operator-configured headless brains; ambient publishing remains unchanged above the authentication layer.
- Test authorization discovery/callback, state rejection, refresh-token rotation, DPoP persistence, account binding, publishing, revocation, failure isolation, and secret redaction.

### 4. Member handle rollout

Mechanism shipped and dogfooded by the org account. Remaining:

- Per-member adoption is pilot config only: set `atproto.accountDid` in `users/<handle>.yaml`, member flips their handle via Bluesky's "I have my own domain" (HTTP method). Handle is org-tenured: it verifies only while the member's subdomain serves their DID; offboarding retires the name while the member keeps their DID, repo, and followers.
- Later, the OAuth connect flow (3) captures the DID automatically instead of operator config.

### 5. Complete the Zod-source-of-truth migration (Phase 2.7 tail)

Lexicon JSON is still hand-authored with conformance tests keeping Zod schemas aligned. Finish the planned inversion:

- Define each record via `defineAtprotoRecord({ id, key, description, schema })`; generate lexicon JSON from Zod with an emitter covering the used subset (`max → maxLength`, `.datetime()`/`.url() → format`, literals/enums → `knownValues`, optional → not-required, nested objects).
- Commit generated JSON with a regenerate-and-assert-no-diff test. Prove the emitter on `ai.rizom.brain.card` first.
- Reuse the same schemas for inbound ingestion (6).

### 6. Inbound ingestion (Phase 3)

Deferred until discovery establishes trusted/followed peers:

- Subscribe to the user's repo or Jetstream; filter `app.bsky.feed.post` and `ai.rizom.brain.*` from other brains, validated against canonical contracts.
- Convert records to entities (markdown + frontmatter), ingest via entity service, run the entity pipeline (topics, series).
- Configurable record types, DID filters, auto vs. review.
- Tests: mock firehose events → entities created.

### 7. Feed generators (Phase 5)

- `app.bsky.feed.getFeedSkeleton` endpoint + `app.bsky.feed.generator` record in the configured repo.
- Feeds: all-posts-by-brain, topic, series, cross-brain from approved/followed brains only.
- Tests: generator record payload, skeleton URIs, topic filtering.

### 8. Ambient federation (Phase 6)

- Jetstream subscription filtered to `ai.rizom.brain.*` from approved/followed peers; new peer records create local reference entities and can trigger derive() reactions.
- `ai.rizom.brain.reaction` records for acknowledge/curate.
- Tests: peer publishes → local brain processes.

### 9. Cleanups

- `topics` registers its plugin from `src/index.ts` instead of a dedicated `src/plugin.ts`; align when next touching the package.
- `did:web` documents intentionally omit `verificationMethod` (the repo `did:plc` signs records); revisit only if a brain gets its own signing key.

## Verification (open items only)

1. Jetstream refreshes only already-known repo DIDs by default; trusted sightings and explicitly enabled ambient observations merge in an operator-only Candidate Inbox, and only a confirmed Add action creates an agent.
2. A fleet user can connect Bluesky via OAuth and their brain publishes under their account (OAuth slice).
3. Bluesky/atproto content can be ingested as brain entities with topic extraction.
4. Custom feeds are subscribable in Bluesky.
5. Peer activity triggers local reactions only for approved/followed peers.
