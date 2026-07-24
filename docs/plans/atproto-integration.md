# Plan: AT Protocol Integration

## Status

Shipped and live as of 2026-07-20: plugin foundation (PDS auth via app password, `did:web` document routes), the projection-backed outbound publishing substrate (`post`, `note`, `link`, `deck`, semantic `social-post`, `series`, `project`, `topic`) with local lexicon validation, blob upload, and idempotent `putRecord` upserts; canonical `ai.rizom.brain.*` contracts in `@brains/atproto-contracts` with Zod record schemas, served publicly by the registry on the live `rizom.ai` instance; the first bounded discovery slice (repo-hosted brain cards enrich or create reviewable `agent` entities); the member-handle verification endpoint (`/.well-known/atproto-did`), dogfooded by the org account — `@rizom.ai` verified over HTTP against `did:plc:oehciuqunzskplljt3qnnncw`; and live credentials on the rizom-ai brain (`ATPROTO_APP_PASSWORD` deployed).

Ambient publishing is live as of 2026-07-21 on `rizom.ai` at `0.2.0-alpha.207`: the brain card publishes on boot and is verified on the PDS (`at://did:plc:oehciuqunzskplljt3qnnncw/ai.rizom.brain.card/self`, full identity/skills payload). Going live surfaced a secrets-plumbing gap — `ATPROTO_APP_PASSWORD` reached the deploy workflow but was missing from the pilot's `.env.schema` sensitive list and kamal `env.secret`, so the container never saw it and the trigger skipped silently; fixed in the pilot. Entity-record mirroring is wired but not yet exercised live — it fires on the next `publish:completed` or public entity update, not retroactively for already-published entities. The MCP tool surface remains intentionally absent. The card's `anchor.name: Unknown` bug (singleton parse failure falling back to defaults) is fixed as of `0.2.0-alpha.217` and verified live — the published card shows `anchor {name: "Rizom", kind: "collective"}`. The same release hardened validation (lexicon refs resolve via local defs and fail closed when unresolvable) and serialized per-entity PDS writes to prevent out-of-order upserts. Lexicon authority resolution is shipped and verified live as of 2026-07-21 at `0.2.0-alpha.208`: the `_lexicon.brain.rizom.ai` DNS TXT delegates to the org DID, and the authority-gated ambient publisher (atproto plugin `lexiconAuthority` flag, set only for `rizom-ai` via `@rizom/ops`) upserts all nine canonical lexicons as `com.atproto.lexicon.schema` records on every boot — verified via `listRecords` on the org repo, so third-party viewers now resolve `ai.rizom.brain.*` schemas protocol-natively. The registry's HTTP lexicon routes remain a human-facing mirror only.

Jetstream discovery is implemented as of 2026-07-24 and remains disabled by default pending a live canary. The implementation adds bounded websocket consumption, durable cursor/dedupe and budget state, authoritative credential-free PDS refetching, safe public egress, `did:web`/repo binding, collision protection, deletion/failure staleness, stale unapproved-candidate archival, card heartbeats and immediate identity/skill republishing, plus scheduler-backed discovery/conflict notification digests. `@rizom/ops` can opt an individual fleet brain into the nested `atproto.jetstream` block without changing the fleet default.

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

### 2. Jetstream discovery (Phase 4 tail) — implemented; live canary pending

The bounded discovery pipeline is implemented end to end — `discoverBrainCards` resolves a repo, reads its card, converts cross-version anchor kinds, validates, and broadcasts `atproto:brain-card:discovered`; agent-discovery upserts a reviewable `agent` entity and its daily refresh keeps known cards current — but nothing in production feeds it candidates. Its only caller is a smoke script. Operator-listed repo DIDs were considered and rejected: hand-maintaining peer lists in config is O(fleet-size) toil per brain and cannot scale past a handful of peers.

Jetstream is an **untrusted candidate signal**, never the record source. A commit event may cause the existing bounded pipeline to inspect a repo DID; the consumer never broadcasts the event's embedded record directly. This preserves one convert → validate → reviewable-entity path and prevents Jetstream from becoming a parallel trust boundary.

#### Trust and collision boundary — release-blocking

- Only `create`/`update` commits for `ai.rizom.brain.card/self` may trigger a candidate fetch; handle a matching `delete` through the staleness path below and ignore every other collection/rkey/operation before network access. V1 accepts `did:plc` repo DIDs only. Pass the event DID to `discoverBrainCards`, which resolves the authoritative PDS and refetches `getRecord`; require the returned AT URI repo to equal the event DID.
- Bind the claimed domain identity before creating or refreshing an agent: `siteUrl` must be HTTPS; its hostname must equal the `did:web` hostname in `brain.did`; that DID document must identify itself correctly and advertise an `alsoKnownAs` ATProto identifier that is either the candidate repo DID or resolves to it. Repo signature/hosting alone does not prove the card may speak for an arbitrary brain domain.
- Agent identity collisions fail closed. If an existing domain-backed agent has a different `repoDid`, do not mutate it, do not preserve its approval on the candidate, and emit a reviewable conflict/failure. A legitimate repo-DID migration requires explicit reapproval. The same repo DID may idempotently refresh its existing agent and preserve local approval fields.
- These checks precede the claim that approval is the trust gate: an unapproved candidate is non-callable, and an untrusted repo can never overwrite an already-approved agent by claiming its `siteUrl`.

#### Consumer and resource boundary

- A schema-first `jetstream` config block now provides `enabled` (false for canary rollout), endpoint, replay window, deny DIDs/domains, optional skill keywords, queue/concurrency limits, per-DID cooldown, global fetch budget, new-agent rate cap, pending-candidate ceiling, and stale-candidate retention. Filters default open only inside all budgets; flipping the default enablement still requires live capacity and abuse verification.
- Run one websocket daemon per opted-in full brain; never open it during startup-check or eval (`evalDisable` already covers atproto). Relevant event volume scales with network activity and total fleet cost scales with brain count, so record queue depth, dropped/coalesced candidates, fetch outcomes, and creation-cap decisions. Revisit a shared fleet relay if the decentralized cost crosses an operational threshold.
- Treat every candidate-driven fetch as hostile egress: require HTTPS public endpoints, reject loopback/private/link-local destinations after DNS resolution and on every redirect, cap redirects and response bytes, set timeouts, and send no credentials. Bound the candidate queue and fetch concurrency, coalesce repeated events per DID, and apply a global processing budget; the new-agent creation cap alone is not a network-abuse control.
- Apply the DID deny-list before fetch. Apply domain and skill filters only after authoritative fetch, identity binding, conversion, and validation. Deduplicate one pending candidate per repo DID/domain pair; never prune approved agents, but expire never-approved stale candidates under the configured ceiling.

#### Cursor, replay, and liveness

- Persist a Zod-validated Jetstream cursor/checkpoint in the plugin's scoped `runtimeState`. Processing is at-least-once: advance the durable contiguous watermark only after each event reaches a terminal outcome. Validation/filter rejections are terminal skips; transient fetch failures retry with bounded backoff, then report and advance so one poison candidate cannot stall the stream.
- Keep a bounded durable dedupe window keyed by event DID plus revision/CID/operation. Inclusive replay after restart may redeliver the last event; duplicates must not repeat PDS fetches, consume creation budget, or emit duplicate discovery events.
- With no cursor, start at `now - replayWindow`. If the cursor predates retained Jetstream history, clamp to the earliest supported point, emit an observable gap, and continue. Do not describe this alone as eventual consistency: a peer may remain online without another update.
- Close that liveness gap with a low-frequency, jittered brain-card heartbeat (and immediate republish on identity/skill changes). The idempotent `putRecord` keeps one card while producing a later update signal, so a peer missed outside the replay window is eventually rediscovered without requiring a reboot.
- Reconnect uses bounded exponential backoff and jitter. Shutdown aborts the socket, stops retries, safely abandons queued work behind the durable checkpoint, and opens no replacement socket. Brain-card identity/profile/skill changes republish immediately, while a low-frequency jittered heartbeat closes the replay-window liveness gap.

#### Deletion and staleness

- A Jetstream delete for `ai.rizom.brain.card/self` marks the matching repo's card unavailable/stale; it never deletes the local agent or automatically revokes explicit approval/runtime trust. Surface the state to review and stop treating card-derived metadata as fresh until a bound card reappears.
- Repeated refresh failures follow the same availability model, retain the last verified snapshot with failure timestamps/counts, and clear the unavailable state when the same bound card reappears. Never-approved deleted candidates receive a configured stale deadline and are archived by the existing daily recurring check; approved agents are never auto-archived. A different repo claiming the same domain remains a conflict, not a recovery path.

#### Tests

- Mocked valid event DID → authoritative PDS refetch → discovered broadcast → agent upsert; embedded Jetstream record is ignored.
- Wrong collection/rkey/operation, returned-URI repo mismatch, invalid domain/DID binding, hostile PDS endpoints, and oversized/timeout responses are rejected before mutation.
- A malicious repo claiming an existing approved domain cannot mutate that agent or inherit approval; same-repo refresh remains idempotent; repo migration requires reapproval.
- Queue/concurrency bounds, per-DID coalescing, fetch and creation budgets, pending ceiling/retention, and post-validation domain/skill filters.
- Cursor persistence, contiguous checkpointing, duplicate replay, stale-cursor gap reporting, bounded transient retries, reconnect after socket drop, and shutdown during queued work.
- Delete and repeated-refresh failure mark availability without deleting approval; heartbeat republishes under the same rkey; startup-check/eval boots open no socket.

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
2. Brain cards are safely discoverable via Jetstream; hostile identity collisions and endpoints fail closed, missed cards recover through bounded replay/heartbeat, and discovered brains stay non-callable until approved.
3. A fleet user can connect Bluesky via OAuth and their brain publishes under their account (OAuth slice).
4. Bluesky/atproto content can be ingested as brain entities with topic extraction.
5. Custom feeds are subscribable in Bluesky.
6. Peer activity triggers local reactions only for approved/followed peers.
