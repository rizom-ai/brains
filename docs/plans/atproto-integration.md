# Plan: AT Protocol Integration

## Status

Shipped and live as of 2026-07-20: plugin foundation (PDS auth via app password, `did:web` document routes), the projection-backed outbound publishing substrate (`post`, `note`, `link`, `deck`, semantic `social-post`, `series`, `project`, `topic`) with local lexicon validation, blob upload, and idempotent `putRecord` upserts; canonical `ai.rizom.brain.*` contracts in `@brains/atproto-contracts` with Zod record schemas, served publicly by the registry on the live `rizom.ai` instance; the first bounded discovery slice (signed brain cards enrich or create reviewable `agent` entities); the member-handle verification endpoint (`/.well-known/atproto-did`), dogfooded by the org account — `@rizom.ai` verified over HTTP against `did:plc:oehciuqunzskplljt3qnnncw`; and live credentials on the rizom-ai brain (`ATPROTO_APP_PASSWORD` deployed).

Ambient publishing is live as of 2026-07-21 on `rizom.ai` at `0.2.0-alpha.207`: the brain card publishes on boot and is verified on the PDS (`at://did:plc:oehciuqunzskplljt3qnnncw/ai.rizom.brain.card/self`, full identity/skills payload). Going live surfaced a secrets-plumbing gap — `ATPROTO_APP_PASSWORD` reached the deploy workflow but was missing from the pilot's `.env.schema` sensitive list and kamal `env.secret`, so the container never saw it and the trigger skipped silently; fixed in the pilot. Entity-record mirroring is wired but not yet exercised live — it fires on the next `publish:completed` or public entity update, not retroactively for already-published entities. The MCP tool surface remains intentionally absent. The published card's `anchor.name` is `Unknown` — the card builder does not resolve the anchor profile's display name yet. First external consumption also surfaced that `ai.rizom.brain.*` NSIDs do not resolve protocol-natively (viewers report "lexicon authority not found"); the `_lexicon.brain.rizom.ai` DNS delegation is in place as of 2026-07-21 and the schema-record publisher is open work 2.

## Reference invariants (needed by the open work)

- **Ownership boundary**: the ATProto plugin owns identity, PDS auth, transport, blobs, generic publishing, and the brain card publisher. Entity packages own projection definitions and mappers, importing canonical lexicons and Zod schemas from `@brains/atproto-contracts` — no duplicated lexicon JSON. Protocol authority for `ai.rizom.brain.*` is the `_lexicon` DNS delegation plus `com.atproto.lexicon.schema` records in the org repo (slice 2); the registry plugin's HTTP lexicon routes on `rizom.ai` are a human-facing mirror, not the resolution path third-party tools consult.
- **Projection selection rule**: durable, user-meaningful public entities get quiet semantic projections. Public visibility is required but not sufficient — an entity package must register an explicit safe projection. Ephemeral/support/directory entities (`skill`, `agent`) are not projected.
- **Validation stance**: records are validated locally against canonical contracts before PDS writes; PDS writes use `validate: false` because public PDS instances do not know Rizom lexicons.
- **Identity model**: `repoDid` (PDS account that signs records) ≠ `brain.did` (`did:web:<site-host>`) ≠ `anchor.did` (owner, groups brains across domains) ≠ `accountDid` (member's personal atproto account, served at `/.well-known/atproto-did` for handle verification). See [Identity & trust architecture](./identity-and-trust.md).
- **Feed posts are out of scope for semantic publishing**: `app.bsky.feed.post` distribution belongs to a later `social-post` workflow/provider, never a side effect of entity records.

## Open work

Ordered; each slice ships independently.

### 1. Publishing trigger (make brains publish themselves) — implemented, live verification pending

The removed tool surface has been replaced with event wiring inside the atproto plugin:

- **Brain card on ready**: with credentials configured, `system:plugins:ready` publishes/refreshes `ai.rizom.brain.card/self`. `putRecord` under `literal:self` is an idempotent upsert, so every boot converges the card; no dedupe state is needed.
- **Entity records on publish events**: the plugin subscribes to `publish:completed`, the publish pipeline's broadcast fan-out event, rather than request-style `publish:report:success`. It also subscribes to entity updates. For any entity type with a registered projection, it builds, validates, and upserts the projected record. Entity deletion (or a projected entity turning non-public) calls `com.atproto.repo.deleteRecord`, making the PDS repo a quiet mirror of public projected state.
- **Safety boundary, sharpened**: projection registration is the consent gate. Once an entity package registers a projection and the operator configures credentials, publishing for that type is automatic. No entity type is published without a registered projection; individual records do not require a manual act.
- **Failure handling**: PDS failures log and broadcast `atproto:publish:failed`. They do not emit `publish:report:failure`, because that request belongs to the source publish provider and would incorrectly fail an already-successful local publish. Trigger handlers always isolate failures from the source operation.
- **Tests**: card upsert on ready (and skipped without credentials), publish completion → record upsert, delete → record delete, public → non-public → record delete, no publish for types without projections, PDS client deletion, and failure isolation.

Remaining verification on live: `com.atproto.repo.listRecords` for `did:plc:oehciuqunzskplljt3qnnncw` shows `ai.rizom.brain.card/self` and records for the rizom-ai brain's public entities.

### 2. Lexicon authority resolution (make `ai.rizom.brain.*` schemas resolvable)

Surfaced 2026-07-21 by the first external consumer: pdsls.dev fails with "lexicon authority not found; nsid=ai.rizom.brain.card". Third-party tools resolve schemas protocol-natively — DNS TXT at `_lexicon.<reversed authority>` names the owning DID, whose repo must hold `com.atproto.lexicon.schema` records. Our HTTP registry is a convention nothing external consults, and `validate: false` on PDS writes treated the symptom ("public PDS instances do not know Rizom lexicons") as a permanent fact instead of the problem this mechanism solves.

- **Done**: DNS TXT `_lexicon.brain.rizom.ai` → `did=did:plc:oehciuqunzskplljt3qnnncw` (Cloudflare, 2026-07-21, verified resolving). One record covers every `ai.rizom.brain.*` NSID.
- **Ambient schema publishing**: the atproto plugin gains a `lexiconAuthority` config flag (default false). When true and credentials are configured, `system:plugins:ready` upserts one `com.atproto.lexicon.schema` record per canonical lexicon from `@brains/atproto-contracts` (rkey = NSID, value = lexicon JSON plus `$type`), through the same `runPublishingTrigger` failure isolation as the card. Every boot converges the records, so lexicon edits propagate on the next deploy.
- **Why a flag**: only the DNS-designated account may serve schemas; fleet brains with credentials must not mirror `ai.rizom.brain.*` schema records into their own repos. `@rizom/ops` renders `atproto.lexiconAuthority` from `users/<handle>.yaml`; only `rizom-ai` sets it.
- **Rollout order**: brains release (plugin + ops land in the same lockstep version) → pilot ops bump → set the flag in `users/rizom-ai.yaml` → deploy → verify.
- **Tests**: schema records published on ready when flagged, none without the flag or credentials, idempotent re-publish, failure isolation.

Verification: `com.atproto.repo.getRecord` returns `com.atproto.lexicon.schema/ai.rizom.brain.card` from the org repo, and pdsls.dev renders the card without the resolution error.

### 3. Outbound ATProto OAuth (fleet-user publishing)

App password is the sanctioned headless credential for operator-configured brains; OAuth is the fleet-user story:

- Console "connect Bluesky" flow using `@atproto/oauth-client-node` (confidential client via existing JWKS); browser user-delegation with PAR/DPoP and rotating refresh tokens.
- The same gesture captures the user's account DID for member-handle plumbing (see 4).
- Includes JWT/session refresh in `AtprotoPdsClient` (the app-password client does one-shot publishes today).

### 4. Member handle rollout

Mechanism shipped and dogfooded by the org account. Remaining:

- Per-member adoption is pilot config only: set `atproto.accountDid` in `users/<handle>.yaml`, member flips their handle via Bluesky's "I have my own domain" (HTTP method). Handle is org-tenured: it verifies only while the member's subdomain serves their DID; offboarding retires the name while the member keeps their DID, repo, and followers.
- Later, the OAuth connect flow (3) captures the DID automatically instead of operator config.

### 5. Complete the Zod-source-of-truth migration (Phase 2.7 tail)

Lexicon JSON is still hand-authored with conformance tests keeping Zod schemas aligned. Finish the planned inversion:

- Define each record via `defineAtprotoRecord({ id, key, description, schema })`; generate lexicon JSON from Zod with an emitter covering the used subset (`max → maxLength`, `.datetime()`/`.url() → format`, literals/enums → `knownValues`, optional → not-required, nested objects).
- Commit generated JSON with a regenerate-and-assert-no-diff test. Prove the emitter on `ai.rizom.brain.card` first.
- Reuse the same schemas for inbound ingestion (7).

### 6. Discovery remainder (Phase 4 tail)

Bounded card discovery and agent enrichment are implemented. Remaining:

- Jetstream/firehose candidate sourcing (current producer reads supplied repo DIDs/handles only).
- Configurable allow/deny domain-DID filters and skill-keyword filters (max-per-run and in-batch dedupe exist).
- Republish the card when brain identity, anchor identity, model, or skills change (subsumed by the trigger slice's card-on-ready if card content is derived at publish time).

### 7. Inbound ingestion (Phase 3)

Deferred until discovery establishes trusted/followed peers:

- Subscribe to the user's repo or Jetstream; filter `app.bsky.feed.post` and `ai.rizom.brain.*` from other brains, validated against canonical contracts.
- Convert records to entities (markdown + frontmatter), ingest via entity service, run the entity pipeline (topics, series).
- Configurable record types, DID filters, auto vs. review.
- Tests: mock firehose events → entities created.

### 8. Feed generators (Phase 5)

- `app.bsky.feed.getFeedSkeleton` endpoint + `app.bsky.feed.generator` record in the configured repo.
- Feeds: all-posts-by-brain, topic, series, cross-brain from approved/followed brains only.
- Tests: generator record payload, skeleton URIs, topic filtering.

### 9. Ambient federation (Phase 6)

- Jetstream subscription filtered to `ai.rizom.brain.*` from approved/followed peers; new peer records create local reference entities and can trigger derive() reactions.
- `ai.rizom.brain.reaction` records for acknowledge/curate.
- Tests: peer publishes → local brain processes.

### 10. Cleanups

- Split the `shared/atproto-contracts` barrel (`src/index.ts`, 800+ lines re-exporting 200+ Zod schemas) by domain (records, types, projections) when next touching the package — it is the type-instantiation blowup `shared/utils` warns against.
- `topics` registers its plugin from `src/index.ts` instead of a dedicated `src/plugin.ts`; align when next touching the package.
- `did:web` documents intentionally omit `verificationMethod` (the repo `did:plc` signs records); revisit only if a brain gets its own signing key.

## Verification (open items only)

1. Live repo shows `ai.rizom.brain.card/self` plus records for public projected entities, updated without manual action (trigger slice).
2. `ai.rizom.brain.*` NSIDs resolve protocol-natively — DNS authority plus schema records — and third-party viewers validate our records without errors (lexicon authority slice).
3. A fleet user can connect Bluesky via OAuth and their brain publishes under their account (OAuth slice).
4. Bluesky/atproto content can be ingested as brain entities with topic extraction.
5. Brain cards are discoverable via Jetstream; discovered brains stay non-callable until approved.
6. Custom feeds are subscribable in Bluesky.
7. Peer activity triggers local reactions only for approved/followed peers.
