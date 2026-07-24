# Plan: AT Protocol Integration

## Status

Shipped and live as of 2026-07-20: plugin foundation (PDS auth via app password, `did:web` document routes), the projection-backed outbound publishing substrate (`post`, `note`, `link`, `deck`, semantic `social-post`, `series`, `project`, `topic`) with local lexicon validation, blob upload, and idempotent `putRecord` upserts; canonical `ai.rizom.brain.*` contracts in `@brains/atproto-contracts` with Zod record schemas, served publicly by the registry on the live `rizom.ai` instance; the first bounded discovery slice (repo-hosted brain cards enrich or create reviewable `agent` entities); the member-handle verification endpoint (`/.well-known/atproto-did`), dogfooded by the org account — `@rizom.ai` verified over HTTP against `did:plc:oehciuqunzskplljt3qnnncw`; and live credentials on the rizom-ai brain (`ATPROTO_APP_PASSWORD` deployed).

Ambient publishing is live as of 2026-07-21 on `rizom.ai` at `0.2.0-alpha.207`: the brain card publishes on boot and is verified on the PDS (`at://did:plc:oehciuqunzskplljt3qnnncw/ai.rizom.brain.card/self`, full identity/skills payload). Going live surfaced a secrets-plumbing gap — `ATPROTO_APP_PASSWORD` reached the deploy workflow but was missing from the pilot's `.env.schema` sensitive list and kamal `env.secret`, so the container never saw it and the trigger skipped silently; fixed in the pilot. Entity-record mirroring is wired but not yet exercised live — it fires on the next `publish:completed` or public entity update, not retroactively for already-published entities. The MCP tool surface remains intentionally absent. The card's `anchor.name: Unknown` bug (singleton parse failure falling back to defaults) is fixed as of `0.2.0-alpha.217` and verified live — the published card shows `anchor {name: "Rizom", kind: "collective"}`. The same release hardened validation (lexicon refs resolve via local defs and fail closed when unresolvable) and serialized per-entity PDS writes to prevent out-of-order upserts. Lexicon authority resolution is shipped and verified live as of 2026-07-21 at `0.2.0-alpha.208`: the `_lexicon.brain.rizom.ai` DNS TXT delegates to the org DID, and the authority-gated ambient publisher (atproto plugin `lexiconAuthority` flag, set only for `rizom-ai` via `@rizom/ops`) upserts all nine canonical lexicons as `com.atproto.lexicon.schema` records on every boot — verified via `listRecords` on the org repo, so third-party viewers now resolve `ai.rizom.brain.*` schemas protocol-natively. The registry's HTTP lexicon routes remain a human-facing mirror only.

Jetstream support shipped in `0.2.0-alpha.224` on 2026-07-24 and remains disabled in every fleet configuration. The release added bounded websocket consumption, durable cursor/dedupe and budget state, authoritative credential-free PDS refetching, safe public egress, `did:web`/repo binding, collision protection, staleness handling, card heartbeats, and per-brain `@rizom/ops` configuration. It also made an unapproved product-policy choice: once Jetstream was enabled, an unknown valid brain card could automatically become an `agent` with `status: discovered`. That coupling is not approved. No live canary may enable Jetstream until the known-peer-only correction below ships.

## Reference invariants (needed by the open work)

- **Ownership boundary**: the ATProto plugin owns identity, PDS auth, transport, blobs, generic publishing, and the brain card publisher. Entity packages own projection definitions and mappers, importing canonical lexicons and Zod schemas from `@brains/atproto-contracts` — no duplicated lexicon JSON. Protocol authority for `ai.rizom.brain.*` is the `_lexicon` DNS delegation plus `com.atproto.lexicon.schema` records in the org repo (shipped 2026-07-21); the registry plugin's HTTP lexicon routes on `rizom.ai` are a human-facing mirror, not the resolution path third-party tools consult.
- **Projection selection rule**: durable, user-meaningful public entities get quiet semantic projections. Public visibility is required but not sufficient — an entity package must register an explicit safe projection. Ephemeral/support/directory entities (`skill`, `agent`) are not projected.
- **Validation stance**: records are validated locally against canonical contracts before PDS writes; PDS writes use `validate: false` because public PDS instances do not know Rizom lexicons.
- **Identity model**: `repoDid` (PDS account that signs records) ≠ `brain.did` (`did:web:<site-host>`) ≠ `anchor.did` (owner, groups brains across domains) ≠ `accountDid` (member's personal atproto account, served at `/.well-known/atproto-did` for handle verification). See [Identity & trust architecture](./identity-and-trust.md).
- **Feed posts are out of scope for semantic publishing**: `app.bsky.feed.post` distribution belongs to a later `social-post` workflow/provider, never a side effect of entity records.

## Open work

Ordered; each slice ships independently unless it declares an explicit dependency gate.

### 1. Publishing trigger (make brains publish themselves) — implemented; card verified live, entity mirroring verification pending

The removed tool surface has been replaced with event wiring inside the atproto plugin:

- **Brain card on ready**: with credentials configured, the plugin `ready()` lifecycle hook publishes/refreshes `ai.rizom.brain.card/self`. `putRecord` under `literal:self` is an idempotent upsert, so every boot converges the card; no dedupe state is needed.
- **Entity records on publish events**: the plugin subscribes to `publish:completed`, the publish pipeline's broadcast fan-out event, rather than request-style `publish:report:success`. It also subscribes to entity updates. For any entity type with a registered projection, it builds, validates, and upserts the projected record. Entity deletion (or a projected entity turning non-public) calls `com.atproto.repo.deleteRecord`, making the PDS repo a quiet mirror of public projected state.
- **Safety boundary, sharpened**: projection registration is the consent gate. Once an entity package registers a projection and the operator configures credentials, publishing for that type is automatic. No entity type is published without a registered projection; individual records do not require a manual act.
- **Failure handling**: PDS failures log and broadcast `atproto:publish:failed`. They do not emit `publish:report:failure`, because that request belongs to the source publish provider and would incorrectly fail an already-successful local publish. Trigger handlers always isolate failures from the source operation.
- **Tests**: card upsert on ready (and skipped without credentials), publish completion → record upsert, delete → record delete, public → non-public → record delete, no publish for types without projections, PDS client deletion, and failure isolation.

The card half is verified live: `ai.rizom.brain.card/self` on `did:plc:oehciuqunzskplljt3qnnncw` carries the full identity payload (checked via `getRecord` at `0.2.0-alpha.217`), and yeehaa.io publishes its own card (`did:plc:dtxrise7xa4kat6mh4zd4lqe`) as of `0.2.0-alpha.223`. Remaining: `com.atproto.repo.listRecords` shows records for the rizom-ai brain's public entities (entity mirroring fires on the next publish/update, so this needs a live publish event to observe), and republish-on-identity-change between boots — today the card converges only on boot, so an identity/skill edit waits for the next restart to reach the PDS.

### 2. Jetstream known-peer monitoring (Phase 4 tail) — correction required before canary

`0.2.0-alpha.224` shipped the transport and hardening work but coupled `jetstream.enabled` to automatic unknown-agent enrollment. That is the wrong product boundary. Publishing a public brain card grants protocol-level discoverability; it does **not** grant membership in every receiving brain's agent directory. Enabling transport must not silently enable admission.

The corrected first use of Jetstream is a change feed for **already-known repo DIDs**:

- A matching event for a known agent may trigger authoritative card refresh.
- A matching delete for a known agent may update card availability.
- An unknown repo DID is checkpointed and discarded before candidate-controlled DNS, PLC, DID-document, or PDS access.
- An unknown event creates no `agent`, emits no new-agent notification, and enters no review queue.

This correction keeps the useful liveness and refresh properties without turning the global ATProto stream into an implicit social graph.

#### Admission boundary — release-blocking

- Jetstream transport and agent admission are separate capabilities. `jetstream.enabled` controls only the websocket monitor.
- New agents continue to enter through intentional paths: confirmation-gated `agent_connect`, or the existing directory scan from approved peers with introduction provenance.
- `discoverBrainCards` may retain an explicit trusted/manual creation path, but the Jetstream caller must never request creation for an unknown repo.
- Before any candidate-controlled network request, look up the event repo DID among existing `agent` entities. Treat discovered, approved, and archived records as known; preserve their current local status on refresh.
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
- An unknown repo is a terminal no-fetch skip. Count it for operational visibility without retaining identifying candidate data or producing notifications.
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

#### Optional ambient candidates — deferred product decision

If ambient awareness is wanted later, design it as a second, explicit capability such as `jetstream.ambientCandidates.enabled`; do not infer it from `jetstream.enabled`.

- A validated unknown card would enter a separate bounded, expiring observation inbox, not the `agent` entity collection.
- Observation digests would be opt-in and would not link to `/agents?status=discovered` unless an operator had explicitly promoted the candidate.
- Promotion would require a confirmation-gated operator action that authoritatively refetches the current card before creating an agent.
- No `auto-discover` mode is part of the corrective slice. Adding one requires a separate product decision, plan review, abuse model, and release approval.

#### Corrective implementation sequence

1. Add a failing behavior test proving that `jetstream.enabled: true` plus an unknown valid event performs zero candidate-controlled fetches, entity writes, discovery events, and notification writes.
2. Add the known-repo preflight before `discoverBrainCards`; route known create/update events through authoritative refresh with creation disabled.
3. Restrict delete/unavailability handling to known repo DIDs.
4. Remove the automatic unknown-candidate notification/digest path from Jetstream while preserving directory-scan notifications.
5. Update config, `@rizom/ops`, baseline fixtures, README, and this plan so transport enablement cannot imply admission.
6. Preserve hostile-input, collision, cursor, retry, reconnect, heartbeat, staleness, and shutdown coverage under the known-only policy.

#### Acceptance tests

- Unknown valid or hostile repo event → no DNS/PLC/PDS request, no entity mutation, no discovery/conflict notification, cursor advances.
- Known discovered/approved/archived repo event → authoritative refetch and idempotent refresh; status and local relationship fields remain unchanged.
- Known delete → unavailable metadata only; unknown delete → no-op; approval is never revoked.
- A known repo claiming another known domain fails closed; explicit repo migration still requires reapproval.
- Trusted directory introductions still create provenance-bearing sightings, and explicit connection remains confirmation-gated.
- Existing Jetstream configs without an admission field behave known-only.
- Queue/concurrency bounds, dedupe, cursor persistence, stale-cursor gaps, retry exhaustion, reconnect, heartbeat, and shutdown remain covered.
- Startup-check/eval boots open no socket.

#### Release remediation and gates

- First verify read-only that no deployed brain enables Jetstream; alpha.224's behavior is dormant only while that remains true.
- Build the correction forward from the release commit in an isolated worktree; do not attempt to undo npm publication with a Git revert.
- After explicit approval, publish a corrective alpha release so the fixed package replaces alpha.224 on the active dist-tag. Deprecating alpha.224 is a separate operator decision.
- Implementation, merge to `main`, and release are three independent approvals. Approval of one does not imply either of the others.

### 3. Outbound ATProto OAuth (fleet-user publishing) — blocked on auth-runtime-db

App password is the sanctioned headless credential for operator-configured brains; OAuth is the fleet-user story.

**Dependency gate:** implementation waits for [Auth runtime database](./auth-runtime-db.md) to merge and stabilize its runtime storage and Admin API boundaries. Design and protocol research may proceed in parallel, but the ATProto plugin must not create a second token database or plugin-local JSON store. The existing OAuth grant tables hold credentials the brain **issues** to MCP clients; outbound ATProto OAuth needs a distinct external-provider connection store for credentials the brain **receives** from Bluesky. That store belongs on the same private auth runtime plane, with provider tokens and DPoP key material encrypted or otherwise isolated and never written to entities, Git, or `brain.yaml`.

After the dependency lands:

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

1. Live repo shows `ai.rizom.brain.card/self` plus records for public projected entities, updated without manual action (trigger slice).
2. Jetstream refreshes only already-known repo DIDs; unknown events cause no candidate-controlled fetch or agent creation, hostile identity changes fail closed, and known cards recover through bounded replay/heartbeat without altering local approval.
3. A fleet user can connect Bluesky via OAuth and their brain publishes under their account (OAuth slice).
4. Bluesky/atproto content can be ingested as brain entities with topic extraction.
5. Custom feeds are subscribable in Bluesky.
6. Peer activity triggers local reactions only for approved/followed peers.
