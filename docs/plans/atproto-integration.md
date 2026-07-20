# Plan: AT Protocol Integration

## Status

Shipped and live as of 2026-07-20: plugin foundation (PDS auth via app password, `did:web` document routes), the projection-backed outbound publishing substrate (`post`, `note`, `link`, `deck`, semantic `social-post`, `series`, `project`, `topic`) with local lexicon validation, blob upload, and idempotent `putRecord` upserts; canonical `ai.rizom.brain.*` contracts in `@brains/atproto-contracts` with Zod record schemas, served publicly by the registry on the live `rizom.ai` instance; the first bounded discovery slice (signed brain cards enrich or create reviewable `agent` entities); the member-handle verification endpoint (`/.well-known/atproto-did`), dogfooded by the org account — `@rizom.ai` verified over HTTP against `did:plc:oehciuqunzskplljt3qnnncw`; and live credentials on the rizom-ai brain (`ATPROTO_APP_PASSWORD` deployed).

**Nothing publishes yet.** The publish methods (`publishBrainCard`, `publishEntity`, `publishPost`) have zero callers: the MCP tool surface was deliberately removed on 2026-06-27 (`fix(atproto): remove agent tool surface`) and no invocation surface replaced it. Earlier "done" evidence in this plan cited `atproto_publish_*` smoke runs through those since-removed tools. Wiring a trigger is the top open item.

## Reference invariants (needed by the open work)

- **Ownership boundary**: the ATProto plugin owns identity, PDS auth, transport, blobs, generic publishing, and the brain card publisher. Entity packages own projection definitions and mappers, importing canonical lexicons and Zod schemas from `@brains/atproto-contracts` — no duplicated lexicon JSON. The registry plugin on `rizom.ai` is the public protocol authority for `ai.rizom.brain.*`.
- **Projection selection rule**: durable, user-meaningful public entities get quiet semantic projections. Public visibility is required but not sufficient — an entity package must register an explicit safe projection. Ephemeral/support/directory entities (`skill`, `agent`) are not projected.
- **Validation stance**: records are validated locally against canonical contracts before PDS writes; PDS writes use `validate: false` because public PDS instances do not know Rizom lexicons.
- **Identity model**: `repoDid` (PDS account that signs records) ≠ `brain.did` (`did:web:<site-host>`) ≠ `anchor.did` (owner, groups brains across domains) ≠ `accountDid` (member's personal atproto account, served at `/.well-known/atproto-did` for handle verification). See [Identity & trust architecture](./identity-and-trust.md).
- **Feed posts are out of scope for semantic publishing**: `app.bsky.feed.post` distribution belongs to a later `social-post` workflow/provider, never a side effect of entity records.

## Open work

Ordered; each slice ships independently.

### 1. Publishing trigger (make brains publish themselves)

The substrate is complete but inert. Make publishing ambient, replacing the removed tool surface with event wiring inside the atproto plugin:

- **Brain card on ready**: when credentials are configured, publish/refresh `ai.rizom.brain.card/self` at `system:plugins:ready`. `putRecord` under `literal:self` is an idempotent upsert, so every boot converges the card; no dedupe state needed.
- **Entity records on publish events**: subscribe to the publish-pipeline's `publish:report:success` and to entity update events for already-public entities. For any entity type with a registered projection, build, validate, and upsert the projected record. Entity deletion (or a public entity turning non-public) deletes the projected record — the PDS repo is a quiet mirror of public projected state.
- **Safety boundary, sharpened**: projection registration is the consent gate. Once an entity package registers a projection and the operator configures credentials, publishing for that type is automatic. "No entity type is published blindly" means no publishing without a registered projection — not that each record needs a manual act. The explicit-act model was the removed tool surface; this slice supersedes it.
- **Failure handling**: publish failures report through the existing messaging/report path and never fail the source operation (a PDS outage must not block a local publish).
- Tests: card upsert on ready (and skipped without credentials), publish event → record upsert, delete → record delete, no publish for types without projections, failure isolation.

First verification on live: `com.atproto.repo.listRecords` for `did:plc:oehciuqunzskplljt3qnnncw` shows `ai.rizom.brain.card/self` and records for the rizom-ai brain's public entities.

### 2. Outbound ATProto OAuth (fleet-user publishing)

App password is the sanctioned headless credential for operator-configured brains; OAuth is the fleet-user story:

- Console "connect Bluesky" flow using `@atproto/oauth-client-node` (confidential client via existing JWKS); browser user-delegation with PAR/DPoP and rotating refresh tokens.
- The same gesture captures the user's account DID for member-handle plumbing (see 3).
- Includes JWT/session refresh in `AtprotoPdsClient` (the app-password client does one-shot publishes today).

### 3. Member handle rollout

Mechanism shipped and dogfooded by the org account. Remaining:

- Per-member adoption is pilot config only: set `atproto.accountDid` in `users/<handle>.yaml`, member flips their handle via Bluesky's "I have my own domain" (HTTP method). Handle is org-tenured: it verifies only while the member's subdomain serves their DID; offboarding retires the name while the member keeps their DID, repo, and followers.
- Later, the OAuth connect flow (2) captures the DID automatically instead of operator config.

### 4. Complete the Zod-source-of-truth migration (Phase 2.7 tail)

Lexicon JSON is still hand-authored with conformance tests keeping Zod schemas aligned. Finish the planned inversion:

- Define each record via `defineAtprotoRecord({ id, key, description, schema })`; generate lexicon JSON from Zod with an emitter covering the used subset (`max → maxLength`, `.datetime()`/`.url() → format`, literals/enums → `knownValues`, optional → not-required, nested objects).
- Commit generated JSON with a regenerate-and-assert-no-diff test. Prove the emitter on `ai.rizom.brain.card` first.
- Reuse the same schemas for inbound ingestion (6).

### 5. Discovery remainder (Phase 4 tail)

Bounded card discovery and agent enrichment are implemented. Remaining:

- Jetstream/firehose candidate sourcing (current producer reads supplied repo DIDs/handles only).
- Configurable allow/deny domain-DID filters and skill-keyword filters (max-per-run and in-batch dedupe exist).
- Republish the card when brain identity, anchor identity, model, or skills change (subsumed by the trigger slice's card-on-ready if card content is derived at publish time).

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

- Split the `shared/atproto-contracts` barrel (`src/index.ts`, 800+ lines re-exporting 200+ Zod schemas) by domain (records, types, projections) when next touching the package — it is the type-instantiation blowup `shared/utils` warns against.
- `topics` registers its plugin from `src/index.ts` instead of a dedicated `src/plugin.ts`; align when next touching the package.
- `did:web` documents intentionally omit `verificationMethod` (the repo `did:plc` signs records); revisit only if a brain gets its own signing key.

## Verification (open items only)

1. Live repo shows `ai.rizom.brain.card/self` plus records for public projected entities, updated without manual action (trigger slice).
2. A fleet user can connect Bluesky via OAuth and their brain publishes under their account (OAuth slice).
3. Bluesky/atproto content can be ingested as brain entities with topic extraction.
4. Brain cards are discoverable via Jetstream; discovered brains stay non-callable until approved.
5. Custom feeds are subscribable in Bluesky.
6. Peer activity triggers local reactions only for approved/followed peers.
