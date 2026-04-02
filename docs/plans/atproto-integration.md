# Plan: AT Protocol Integration

## Context

The AT Protocol (atproto) is a decentralized protocol for social networking with portable identity (DIDs), signed personal data repos, federation via firehose, and custom schemas (lexicons). Bluesky is the main app, but the protocol supports arbitrary record types — WhiteWind already stores blog posts, Linkat stores link collections.

AT Protocol is a **distribution and identity layer**, not a replacement for anything we have. The brain keeps its local-first architecture (SQLite, markdown, entity service). AT Protocol adds: federated content distribution, cryptographic identity, ambient brain-to-brain awareness, inbound content ingestion, and decentralized discovery.

## Design Decisions

| Integration          | Decision | Rationale                                                                                    |
| -------------------- | -------- | -------------------------------------------------------------------------------------------- |
| Content distribution | Yes      | Publish entities as signed atproto records. Federated, portable, verifiable.                 |
| Identity             | Yes      | DIDs for anchors and brains. Cryptographic proof of authorship.                              |
| Feed generators      | Yes      | Algorithmic curation, especially cross-brain feeds.                                          |
| Inbound portability  | Yes      | Import existing atproto content (Bluesky posts) as brain entities.                           |
| Discovery            | Yes      | Brains publish cards to the network, discover peers via firehose. Replaces custom directory. |
| Federation (pub/sub) | Yes      | Ambient awareness between brains. Complements A2A (which stays for directed RPC).            |
| Data storage         | No       | SQLite stays as primary store. AT Protocol is distribution, not a database.                  |

## Architecture

```
Brain (local-first)
  ├── SQLite + entity service (primary store, search, queries)
  ├── AT Protocol plugin (ServicePlugin)
  │   ├── Outbound: publish entities → PDS as signed records
  │   ├── Inbound: subscribe to firehose → ingest as entities
  │   ├── Identity: DID management for anchor + brain
  │   ├── Discovery: publish brain card, index peer cards from firehose
  │   └── Feeds: serve curated content to Bluesky clients
  └── A2A (stays for directed agent-to-agent RPC)
```

Two communication patterns coexist:

- **A2A** for directed tasks ("generate a blog post," "summarize this document") — request-response RPC
- **AT Protocol** for ambient awareness ("Rover published a new post," "a new brain joined the network") — pub/sub via firehose

## Lexicons

Custom lexicons under `io.rizom.brain.*`:

```
io.rizom.brain.post       — blog posts (markdown body, title, series, topics)
io.rizom.brain.note       — knowledge notes
io.rizom.brain.link       — curated bookmarks (URL, title, description, extracted content)
io.rizom.brain.deck       — presentations
io.rizom.brain.socialPost — social media posts (platform, content)
io.rizom.brain.card       — brain capability card (name, role, skills, endpoints)
```

Records are JSON with markdown in string fields (same pattern as WhiteWind). Entity metadata maps to record fields. The lexicon schema is generated from existing Zod entity schemas where possible.

## Identity Model

Two DIDs per brain instance:

- **Anchor DID** — the human. Owns the PDS account. Persists across brain instances. One person running multiple brains = one anchor DID, multiple brain DIDs.
- **Brain DID** — the agent. Links to its anchor ("operated by"). Distinguishes which brain published what. Ranger (no single anchor) has a brain DID that stands alone.

Both use `did:web` (DID document served at `/.well-known/did.json` on the brain's domain). Simple, no external dependencies. `did:plc` (Bluesky's portable registry) can be added later if domain-independent portability becomes important.

Key management: signing keys stored in brain.yaml secrets or environment variables. Rotation handled by the identity service.

## User Experience (today)

The immediate value is a Bluesky presence. Day to day:

1. AT Protocol users follow the brain on Bluesky — see blog post summaries, social posts
2. Subscribe to custom feeds ("Yeehaa's architecture posts")
3. Reply/quote to engage with brain content
4. Click through to full content on the brain's site

Future: @ mention the brain to interact directly (requires a mention-watching daemon — Phase 6+).

## Phases

### Phase 1: Plugin skeleton + identity

1. Create `plugins/atproto/` as a ServicePlugin
2. Define lexicon JSON files for `io.rizom.brain.post` and `io.rizom.brain.card`
3. Generate TypeScript types from lexicons (`@atproto/lex-cli`)
4. Add DID configuration to brain.yaml (anchor DID, brain DID, PDS endpoint)
5. Implement `did:web` document serving via webserver interface (`.well-known/did.json`)
6. Authenticate to PDS via OAuth (`@atproto/oauth-client-node`) or app password
7. Tests: DID resolution, PDS authentication

### Phase 2: Content distribution (outbound)

1. Implement `PublishProvider` for atproto — publishes entities as records via `com.atproto.repo.createRecord`
2. Register provider in content-pipeline's provider registry
3. Handle blob uploads for images (`com.atproto.repo.uploadBlob`)
4. Cross-post summaries as `app.bsky.feed.post` for Bluesky visibility (with link to full content)
5. Add remaining lexicons (`note`, `link`, `deck`, `socialPost`)
6. Tests: publish entity → verify record in PDS, cross-post to Bluesky

### Phase 3: Inbound ingestion

1. Subscribe to user's atproto repo (or Jetstream for lightweight JSON events)
2. Filter for relevant record types (`app.bsky.feed.post`, custom lexicons from other brains)
3. Convert atproto records to brain entities (markdown with frontmatter)
4. Ingest via entity service (`createEntity`)
5. Run entity pipeline on ingested content (topic extraction, series association)
6. Configurable: which record types to ingest, filter by DID, auto vs manual approval
7. Tests: mock firehose events → verify entities created

### Phase 4: Discovery

Shares the `agent` entity type with the [Agent Directory](./agent-discovery.md) plan. Firehose-discovered brains are stored as agent entities with `discoveredVia: "atproto"`. The agent directory may already have entries created via `agent_add` or A2A auto-create — firehose discovery updates these with richer AT Protocol identity data (signed profile, anchor DID) rather than creating duplicates.

1. On brain startup, publish `io.rizom.brain.card` record to PDS (name, role, capabilities, A2A endpoint)
2. Subscribe to Jetstream filtered for `io.rizom.brain.card` records
3. Upsert discovered brains as `agent` entities (merge with existing entries by domain)
4. Auto-populate A2A client with discovered brain endpoints
5. Update card when capabilities change (new plugins registered)
6. Tests: publish card → discover from another brain → verify A2A connectivity, upsert with existing agent entity

### Phase 5: Feed generators

1. Implement feed generator HTTP endpoint (`app.bsky.feed.getFeedSkeleton`)
2. Register feed with the brain's PDS
3. Basic feed: "All posts by this brain" (filter by DID)
4. Topic feed: filter by topic entity associations
5. Series feed: ordered posts within a series
6. Cross-brain feed (Ranger): aggregate posts from all known brain DIDs
7. Deploy as part of webserver interface or standalone service
8. Tests: feed skeleton returns correct URIs, topic filtering works

### Phase 6: Ambient federation

1. Subscribe to Jetstream filtered for `io.rizom.brain.*` records from known brain DIDs
2. On new record from a peer brain: create a local reference entity (link or note)
3. Enable derive() reactions — e.g., Ranger auto-curates posts from network brains into a feed
4. Publish `io.rizom.brain.reaction` records (brain acknowledged/curated another brain's content)
5. Configurable: which peer brains to follow, which record types to react to
6. Tests: peer brain publishes → local brain receives and processes

## Dependencies

- `@atproto/api` — client library
- `@atproto/oauth-client-node` — OAuth authentication
- `@atproto/lexicon` — schema validation
- `@atproto/syntax` — identifier parsing (DIDs, handles, AT URIs)

No dependency on `@atproto/pds` — we connect to an external PDS, we don't run one (unless needed for hosted rovers later).

## Files affected (estimated)

| Phase | Files | Nature                                                    |
| ----- | ----- | --------------------------------------------------------- |
| 1     | ~10   | New plugin, lexicons, DID config, webserver route         |
| 2     | ~5    | PublishProvider, content-pipeline integration             |
| 3     | ~5    | Firehose subscriber, record-to-entity converter           |
| 4     | ~5    | Card publishing, Jetstream subscription, agent index      |
| 5     | ~5    | Feed generator endpoint, topic/series filtering           |
| 6     | ~5    | Peer subscription, reaction records, derive() integration |

## Verification

1. Brain has a `did:web` identity resolvable at `/.well-known/did.json`
2. Published entities appear as signed records in the PDS
3. Cross-posted content visible on Bluesky
4. Bluesky/atproto content ingested as brain entities with topic extraction
5. Brain cards discoverable by peer brains via Jetstream
6. Custom feeds subscribable in Bluesky
7. Peer brain activity triggers local reactions
8. A2A continues to work for directed RPC alongside atproto pub/sub
