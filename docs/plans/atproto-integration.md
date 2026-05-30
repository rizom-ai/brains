# Plan: AT Protocol Integration

## Status

Phase 1 foundation is implemented and live-smoked for the app-password prototype. Phase 2 outbound article publishing is implemented for the explicit blog-post path: public blog posts can publish semantic `ai.rizom.brain.post` records with cover-image blobs. The remaining Phase 1 production hardening item is outbound ATProto OAuth. The Phase 2 projection registry contract exists, and the blog `post` projection is now owned/registered by the blog entity package. Bluesky feed posting is intentionally not part of blog article publishing; it should be handled later through the `social-post` workflow/provider, mirroring LinkedIn-style social distribution. Content-pipeline provider registration now preserves explicit providers when entity plugins send internal fallback registrations. The distribution/discovery direction remains aligned with the current agent-directory approval model: firehose-discovered brains may create or refresh reviewable `agent` entities with `status: discovered`, but they must not become callable A2A targets until explicitly approved.

## Context

The AT Protocol (atproto) is a decentralized protocol for social networking with portable identity (DIDs), signed personal data repos, federation via firehose, and custom schemas (lexicons). Bluesky is the main app, but the protocol supports arbitrary record types — WhiteWind already stores blog posts, Linkat stores link collections.

AT Protocol is a **distribution and identity layer**, not a replacement for anything we have. The brain keeps its local-first architecture (SQLite, markdown, entity service). AT Protocol adds: federated content distribution, cryptographic identity, ambient brain-to-brain awareness, inbound content ingestion, and decentralized discovery.

## Design Decisions

| Integration          | Decision | Rationale                                                                                                                 |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| Content distribution | Yes      | Publish entities as signed atproto records. Federated, portable, verifiable.                                              |
| Identity             | Yes      | DIDs for anchors and brains. Cryptographic proof of authorship.                                                           |
| Feed generators      | Yes      | Algorithmic curation, especially cross-brain feeds.                                                                       |
| Inbound portability  | Yes      | Import existing atproto content (Bluesky posts) as brain entities.                                                        |
| Discovery            | Yes      | Brains publish cards to the network and discover peers via firehose, feeding the existing approval-based agent directory. |
| Federation (pub/sub) | Yes      | Ambient awareness between brains. Complements A2A (which stays for directed RPC).                                         |
| Data storage         | No       | SQLite stays as primary store. AT Protocol is distribution, not a database.                                               |

## Architecture

```
Brain (local-first)
  ├── SQLite + entity service (primary store, search, queries)
  ├── AT Protocol plugin (ServicePlugin)
  │   ├── Outbound: publish entities → PDS as signed records
  │   ├── Inbound: subscribe to firehose → ingest as entities
  │   ├── Identity: repo DID config plus optional anchor/brain DID metadata
  │   ├── Discovery: publish brain card, index peer cards from firehose
  │   └── Feeds: serve curated content to Bluesky clients
  └── A2A (stays for directed agent-to-agent RPC)
```

Two communication patterns coexist:

- **A2A** for directed tasks ("generate a blog post," "summarize this document") — request-response RPC
- **AT Protocol** for ambient awareness ("Rover published a new post," "a new brain joined the network") — pub/sub via firehose

## Lexicons

Custom lexicons under `ai.rizom.brain.*` (reverse-domain form for `rizom.ai`; change only if project ownership moves to another domain):

```
ai.rizom.brain.post       — blog posts (markdown body, title, series, topics)
ai.rizom.brain.note       — knowledge notes
ai.rizom.brain.link       — curated bookmarks (URL, title, description, extracted content)
ai.rizom.brain.deck       — presentations
ai.rizom.brain.socialPost — social media posts (platform, content)
ai.rizom.brain.card       — brain capability card (name, role, skills, endpoints)
```

Records are JSON with markdown in string fields (same pattern as WhiteWind). Entity metadata maps to record fields. Lexicons are distribution projections of existing brain entities, not replacement entity models. For example, `ai.rizom.brain.post` is the ATProto projection of the existing blog `post` entity (`entities/blog`, entityType `post`). The local entity remains the source of truth. Do not introduce parallel ATProto-only entity models.

Ownership boundary: the ATProto plugin owns identity, PDS auth, transport, blobs, and the brain card. Entity packages own their own ATProto projection definitions and mappers, then register them with ATProto publishing. The blog `post` projection now lives in `entities/blog`; broader entity projections such as `note`, `link`, `deck`, and `socialPost` should likewise be registered from their entity plugins instead of centralized in the ATProto plugin.

Current decision: keep hand-written projection types and explicit tests for now. Lexicon JSON is validated by tests, and record mapper tests verify the important projections against existing entity schemas. Add generated TypeScript from lexicons later only if the custom record surface grows enough to justify the build step.

## Identity Model

Separate AT Protocol repo identity from public brain identity:

- **Repo DID** — the DID of the PDS account that owns and signs atproto records. In Bluesky/PDS practice this is usually the account DID (`did:plc` or `did:web`). Records are written into this repo via `com.atproto.repo.*`.
- **Anchor DID** — the human/operator identity. This may be the same as the repo DID for personal brains, or a DID referenced from records/profile metadata.
- **Brain DID** — the agent identity. This identifies which brain produced a record and is included in custom record fields such as `brainDid` / `operatedBy`. It does not imply write authority over the PDS repo unless the brain itself owns the PDS account.

Phase 1 supports the simplest deployable model: one configured PDS login identifier plus optional `repoDid`, `anchorDid`, and `brainDid` metadata. When `repoDid` is omitted, the plugin uses the DID returned from `com.atproto.server.createSession`, avoiding duplicated handle→DID config. A dedicated PDS account per brain can be added later when a brain needs independent account-level authorship.

For public brain DID documents, prefer `did:web` served from the brain's domain at `/.well-known/did.json`. `did:plc` can be added later if domain-independent portability becomes important.

Key management: secrets live in environment variables or the app's secret configuration, not committed markdown. Rotation is a later identity-service concern.

## User Experience (today)

The immediate value is a Bluesky presence. Day to day:

1. AT Protocol users follow the brain on Bluesky — see blog post summaries, social posts
2. Subscribe to custom feeds ("Yeehaa's architecture posts")
3. Reply/quote to engage with brain content
4. Click through to full content on the brain's site

Future: @ mention the brain to interact directly (requires a mention-watching daemon — Phase 6+).

## User Value by Phase

### Phase 1: Identity + plugin foundation

Users get an AT Protocol-ready brain identity and the infrastructure needed for later publishing/discovery.

- The brain can expose a public `did:web` identity.
- The app can authenticate to a configured PDS account.
- The plugin has initial lexicons and a testable PDS client wrapper.

User-facing result: **"My brain can exist on AT Protocol."**

### Phase 2: Outbound publishing

Users can publish brain content to AT Protocol. Blog article publishing creates semantic custom ATProto records; Bluesky/social feed posts are a separate social-post workflow to design later.

- Brain entities become signed atproto records.
- Blog posts publish as `ai.rizom.brain.post` records.
- Bluesky `app.bsky.feed.post` publishing should be implemented through `social-post`, not as a side effect of blog article publishing.

User-facing result: **"My brain can publish my work to ATProto with portable identity and signed records."**

This is the first visibly valuable milestone.

### Phase 3: Inbound ingestion

Users can pull ATProto/Bluesky content into their brain.

- Bluesky posts and custom brain records can become local entities.
- Imported content can go through search, topic extraction, and other entity pipelines.
- Users can configure what is imported automatically versus held for review.

User-facing result: **"My brain can learn from my Bluesky/ATProto world."**

### Phase 4: Discovery

Users can discover other brains through the network while staying in control.

- Brains publish capability cards.
- Other brains see those cards through Jetstream/firehose.
- Discovered brains appear as reviewable `agent` entries.
- Users explicitly approve agents before A2A calls are allowed.

User-facing result: **"My brain can find other useful brains, but I stay in control."**

This becomes a decentralized agent directory.

### Phase 5: Feed generators

Users can offer custom feeds that people subscribe to in Bluesky.

- "All posts by this brain" feeds.
- Topic feeds.
- Series feeds.
- Cross-brain feeds from approved or explicitly followed brains.

User-facing result: **"My brain can curate channels people subscribe to."**

### Phase 6: Ambient federation

Users get ongoing brain-to-brain awareness.

- Approved/followed peer activity can create local references, reactions, or curation events.
- Brains can acknowledge, curate, or react to each other's content.
- Ranger-style brains can build living network feeds.

User-facing result: **"My brain participates in a living knowledge network."**

Recommended product order:

1. Phase 1 + Phase 2: public ATProto article publishing.
2. Phase 4: decentralized brain discovery.
3. Phase 3: ingest external/social knowledge.
4. Phase 5 + Phase 6: curation and federation.

First product promise: **"Publish from your brain to ATProto, with portable identity and signed records."**

## Phases

### Phase 1: Plugin skeleton + identity

Status: core implementation complete for local/dev prototype; production hardening remains.

Done:

1. Create `plugins/atproto/` as a `ServicePlugin`
2. Define lexicon JSON files for `ai.rizom.brain.card` and `ai.rizom.brain.post`
3. Add plugin config for PDS endpoint, handle/repo DID, optional `anchorDid`, optional `brainDid`, and standard `${ENV_VAR}`-interpolated auth secret references
4. Implement `did:web` document serving via `getWebRoutes()` at `/.well-known/did.json` when `brainDid` uses `did:web`
5. Authenticate to PDS with app password for the local prototype; keep outbound ATProto OAuth as a follow-up once the first slice works
6. Add a small PDS client wrapper so tests can mock repo writes without network access
7. Tests: DID document route, config validation, mocked PDS authentication/client calls
8. Document config, tools, and manual smoke checklist in `plugins/atproto/README.md`

Closed Phase 1 decisions:

1. Use tested hand-written projection types for now instead of wiring lexicon TypeScript generation into the workspace.
2. Keep ATProto opt-in in Rover/Relay presets until credentials are configured and a real operator explicitly enables publishing.
3. Treat existing brain OAuth as inbound auth for clients calling the brain; outbound ATProto OAuth to a PDS is a separate follow-up, not a blocker for the app-password prototype.

Live PDS smoke result:

- 2026-05-29 against `https://bsky.social` with test handle `rizom-test.bsky.social` / repo `did:plc:mut7oy7nctoevokkshes2wpq`.
- `atproto_validate_credentials` equivalent session creation succeeded.
- `atproto_publish_card` dry-run succeeded.
- `atproto_publish_card` live upsert succeeded: `at://did:plc:mut7oy7nctoevokkshes2wpq/ai.rizom.brain.card/self`, latest smoke CID `bafyreieqve77kosvsvjsob5nt2szoy3rhmpdxogbkwgchw6254sxyozgje`.
- Follow-up verification via `com.atproto.repo.getRecord` returned the same card URI and `$type: ai.rizom.brain.card`.
- `atproto_publish_post` dry-run and live custom post write succeeded: `at://did:plc:mut7oy7nctoevokkshes2wpq/ai.rizom.brain.post/3mmywyqjukc2h`, CID `bafyreidcjytze5rg3tmbpsff3big4i4ilqn7arczeamodxwwieaxhhu3u4`.
- Follow-up verification via `com.atproto.repo.getRecord` returned the same post URI/CID and `$type: ai.rizom.brain.post`.
- Cover-image custom post smoke succeeded: `at://did:plc:mut7oy7nctoevokkshes2wpq/ai.rizom.brain.post/3mmyy53cu342h`, CID `bafyreiflaqk3lggleuo7ug757oj3yyofjnjfocdqg6weudmkovhh5qv2be`.
- Follow-up verification returned the custom post with `coverImage`.
- Finding: live PDS rejects unknown custom lexicons when `validate: true`; custom `ai.rizom.brain.*` writes use `validate: false`.

Still needed before production:

1. Add outbound ATProto OAuth once app-password prototype behavior is settled.

### Phase 2: Content distribution (outbound)

1. Implement explicit outbound publishing in the atproto plugin: entity → custom record via `com.atproto.repo.createRecord` / `putRecord`; custom `ai.rizom.brain.*` records are written with PDS validation disabled because public PDS instances do not know private Rizom lexicons
2. Add a tested `post` entity → `ai.rizom.brain.post` mapper using the existing blog post schema/frontmatter; include source references such as `sourceEntityType` and `sourceEntityId` where useful — implemented in `entities/blog` and registered through the ATProto projection registry; successful publishes write the custom article URI back to blog frontmatter as `atprotoUri`
3. Do not initially replace existing content-pipeline providers for entity types such as `post`; the current registry is one provider per entity type and internal publish status semantics are separate from distribution targets
4. Evaluate a content-pipeline multi-provider/distribution-target extension after the explicit path works
5. Handle blob uploads for images (`com.atproto.repo.uploadBlob`) before records reference images — implemented for blog post cover images in custom records
6. Do not cross-post blog articles directly as `app.bsky.feed.post`; Bluesky/social posting should be added later as an ATProto provider/projection for the existing `social-post` workflow
7. Add an ATProto projection registration contract so entity plugins can register their own lexicons/mappers; do not centralize remaining entity lexicons (`note`, `link`, `deck`, `socialPost`) inside the ATProto plugin — registry contract implemented and blog `post` registration moved to the blog entity package
8. Add a generic projection-backed publish path for any public entity with a registered ATProto projection, while keeping `atproto_publish_post` as the blog convenience path
9. Tests: blog `post` entity → `ai.rizom.brain.post` record payload, blob upload path, generic projection publishing, no accidental override of internal publish providers — implemented

### Phase 3: Inbound ingestion

1. Subscribe to user's atproto repo (or Jetstream for lightweight JSON events)
2. Filter for relevant record types (`app.bsky.feed.post`, `ai.rizom.brain.*` custom lexicons from other brains)
3. Convert atproto records to brain entities (markdown with frontmatter)
4. Ingest via entity service (`createEntity`)
5. Run entity pipeline on ingested content (topic extraction, series association)
6. Configurable: which record types to ingest, filter by DID, auto vs manual approval
7. Tests: mock firehose events → verify entities created

### Phase 4: Discovery

Shares the `agent` entity type with the broader agent-directory work. Firehose-discovered brains should enter the directory as `discovered` agents, not immediately callable contacts. The durable agent model no longer assumes `discoveredVia`, and A2A no longer auto-creates saved agents on first contact. Firehose discovery should therefore enrich or refresh existing saved entries when they already exist, while otherwise creating reviewable discovered agents keyed by domain.

1. Publish an `ai.rizom.brain.card` record to PDS when configured (name, role, capabilities, public site URL, optional A2A endpoint)
2. Subscribe to Jetstream filtered for `ai.rizom.brain.card` records
3. Upsert discovered brains as `agent` entities keyed by domain/URL/DID, merging with existing entries by domain where possible
4. Preserve the approval lifecycle: new firehose entries are `status: discovered`; existing `approved` entries may be enriched but must not be downgraded; discovered entries must not be callable until approved
5. A2A client resolution continues to use only approved saved agents
6. Update card when capabilities change (new plugins registered)
7. Tests: publish card → discover from another brain → create reviewable agent, enrich existing approved agent without downgrade, verify discovered agents are refused by A2A until approval

### Phase 5: Feed generators

1. Implement feed generator HTTP endpoint for `app.bsky.feed.getFeedSkeleton`
2. Publish/register an `app.bsky.feed.generator` record in the configured PDS repo with the service endpoint and avatar/metadata as needed
3. Basic feed: "All posts by this brain" (filter by repo DID and/or `brainDid` field)
4. Topic feed: filter by topic entity associations
5. Series feed: ordered posts within a series
6. Cross-brain feed (Ranger): aggregate posts from approved or explicitly followed brain DIDs; discovered-only peers should not silently enter trusted feeds
7. Deploy as part of webserver interface or standalone service
8. Tests: generator record payload, feed skeleton returns correct AT URIs, topic filtering works

### Phase 6: Ambient federation

1. Subscribe to Jetstream filtered for `ai.rizom.brain.*` records from approved or explicitly followed brain DIDs
2. On new record from a peer brain: create a local reference entity (link or note)
3. Enable derive() reactions — e.g., Ranger auto-curates posts from network brains into a feed
4. Publish `ai.rizom.brain.reaction` records (brain acknowledged/curated another brain's content)
5. Configurable: which peer brains to follow, which record types to react to, and whether discovered-only peers are ignored or stored for review
6. Tests: peer brain publishes → local brain receives and processes

## Dependencies

- `@atproto/api` — client library
- `@atproto/oauth-client-node` — outbound PDS OAuth authentication (follow-up after app-password prototype; separate from the brain's existing inbound OAuth server)
- `@atproto/lexicon` — schema validation
- `@atproto/syntax` — identifier parsing (DIDs, handles, AT URIs)

No dependency on `@atproto/pds` — we connect to an external PDS, we don't run one (unless needed for hosted rovers later).

## Files affected (estimated)

| Phase | Files | Nature                                                    |
| ----- | ----- | --------------------------------------------------------- |
| 1     | ~10   | New plugin, lexicons, DID config, webserver route         |
| 2     | ~5    | Explicit outbound publisher, entity-owned record mappers  |
| 3     | ~5    | Firehose subscriber, record-to-entity converter           |
| 4     | ~5    | Card publishing, Jetstream subscription, agent index      |
| 5     | ~5    | Feed generator endpoint, topic/series filtering           |
| 6     | ~5    | Peer subscription, reaction records, derive() integration |

## Verification

1. Configured `did:web` brain identities resolve at `/.well-known/did.json`
2. Published entities appear as signed records in the configured PDS repo
3. Published blog posts appear as semantic custom records in the configured PDS repo
4. Bluesky/atproto content can be ingested as brain entities with topic extraction
5. Brain cards are discoverable by peer brains via Jetstream
6. Firehose-discovered brains enter the agent directory as reviewable `discovered` agents and are not callable until approved
7. Custom feeds are subscribable in Bluesky
8. Peer brain activity triggers local reactions only for approved or explicitly followed peers
9. A2A continues to work for directed RPC alongside atproto pub/sub
