# Plan: AT Protocol Integration

## Status

Phase 1 foundation is implemented and live-smoked for the app-password prototype. Phase 2 outbound publishing is implemented as a generic projection-backed substrate: any public entity can be published to ATProto when its entity package registers an explicit ATProto projection. Blog `post` publishes semantic `ai.rizom.brain.post` records with cover-image blobs, and Phase 2 projections now cover `post`, `note`, `link`, `deck`, semantic `social-post`, `series`, `project`, and `topic`. Phase 2.5 local validation is implemented for the current outbound record set. Phase 2.6 establishes canonical `ai.rizom.brain.*` lexicons as a single in-repo contract source in `@brains/atproto-contracts`; entity projections and the Rizom site consume those contracts, and the official live `rizom.ai` instance serves them through the opt-in `@brains/atproto-registry` capability. Ranger exposes `atproto-registry` as an opt-in capability, but it is not in the default preset. Phase 4's first bounded discovery slice is implemented: signed brain cards can enrich or create reviewable `agent` entities while preserving the approval lifecycle. Remaining active targets are outbound ATProto OAuth, configurable discovery filters / Jetstream candidate sourcing, and later Phase 3 inbound ingestion plus feed-generator work. Bluesky feed posting is intentionally not part of semantic entity publishing; it should be handled later through the `social-post` workflow/provider, mirroring LinkedIn-style social distribution.

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
ai.rizom.brain.socialPost — semantic social-post entities (not Bluesky feed posts)
ai.rizom.brain.series     — derived public series/grouping entities
ai.rizom.brain.project    — public portfolio/project entries
ai.rizom.brain.topic      — public topic/knowledge tags
ai.rizom.brain.card       — brain discovery card (brain identity, anchor snapshot, skills, site URL)
```

Records are JSON with markdown in string fields (same pattern as WhiteWind). Entity metadata maps to record fields. Lexicons are distribution projections of existing brain entities, not replacement entity models. For example, `ai.rizom.brain.post` is the ATProto projection of the existing blog `post` entity (`entities/blog`, entityType `post`). The local entity remains the source of truth. Do not introduce parallel ATProto-only entity models.

Ownership boundary: the ATProto plugin owns identity, PDS auth, transport, blobs, generic publishing, and the brain card publisher. Shared ATProto contracts live in `@brains/atproto-contracts`, not in the service plugin package. Canonical `ai.rizom.brain.*` lexicon JSON should live in `@brains/atproto-contracts` as the single in-repo source of truth for local validation and projection registration. Entity packages own projection definitions, mappers, and package-local conformance tests for their entity types; they import canonical lexicons from `@brains/atproto-contracts` and do not carry separate `ai.rizom.brain.*` lexicon JSON. Public protocol authority is provided by a Rizom protocol registry plugin operated by the official `rizom.ai` brain/site, which serves the same canonical contracts. The projection registry entry includes the entity type, collection NSID, canonical lexicon JSON, mapper, and optional publish hook; registration rejects collection/lexicon mismatches and conflicting entity-type registrations. The blog `post` projection lives in `entities/blog`; broader entity projections should likewise be registered from their entity plugins instead of centralized in the ATProto plugin.

Projection selection rule: durable, user-meaningful public entities should generally get quiet semantic ATProto projections. Public visibility is required but not sufficient: each entity package must define an explicit safe projection. Derived entities are not excluded automatically: `series` is derived from source entities with `seriesName`, but it is still a first-class durable grouping entity and should be projected. Ephemeral, operational, evidence/support, or relationship/directory entities should not be published just because they exist. `agent` is excluded from Phase 2 because publishing discovered peer-agent directory entries implies a product/approval semantics decision; `skill` is currently derived/ephemeral support data and should not be projected in Phase 2.

Current decision: do not defer typed runtime schemas. Phase 2.6 established `@brains/atproto-contracts` as the canonical lexicon source, and Phase 2.7 should add Zod-backed record schemas/types derived from those canonical contracts before Phase 3 inbound ingestion depends on accepting records from other producers. Entity packages should import canonical lexicons and generated/derived record schemas from `@brains/atproto-contracts`; they should not own separate `ai.rizom.brain.*` lexicon JSON or ad hoc validators. The ATProto service plugin owns only publishing behavior such as identity, PDS writes, blobs, and brain-card publishing.

PDS-side validation is not the authoritative contract for Rizom custom records. Public PDS instances may reject unknown `ai.rizom.brain.*` lexicons when `validate: true`, so outbound custom record writes use `validate: false` at the PDS boundary. The safety contract is local: before publishing, Rizom should validate projected records against the registered lexicon and entity-owned mapper contract, then use the PDS as the signed repository/storage layer. Public lexicon publication is required before network interoperability work depends on other producers or consumers understanding Rizom records.

## Identity Model

Separate AT Protocol repo identity from public brain identity:

- **Repo DID** — the DID of the PDS account that owns and signs atproto records. In Bluesky/PDS practice this is usually the account DID (`did:plc` or `did:web`). Records are written into this repo via `com.atproto.repo.*`.
- **Brain DID** — the agent/brain identity. This identifies the specific brain described by a record. It does not imply write authority over the PDS repo unless the brain itself owns the PDS account.
- **Anchor DID** — the owner/operator identity for a person, team, organization, or collective. One anchor may own/operate multiple brains across multiple domains. Discovery groups related brains by `anchor.did`, not by domain.

Phase 1 supports the simplest deployable model: one configured PDS login identifier plus optional `repoDid`, `anchorDid`, and `brainDid` metadata. When `repoDid` is omitted, the plugin uses the DID returned from `com.atproto.server.createSession`, avoiding duplicated handle→DID config. When `brainDid` / `anchorDid` are omitted, publishing and DID routes use the site-host conventions `did:web:<site-host>` and `did:web:<site-host>:anchor`. A dedicated PDS account per brain can be added later when a brain needs independent account-level authorship.

Identity architecture target:

- `repoDid` is ATProto provenance: the account/repo that signed and published the record.
- `brain.did` is the discovered brain identity.
- `anchor.did` is the owner/operator identity.
- A single anchor can own many brains: e.g. `anchor.did = did:web:yeehaa.io:anchor` can own `brain.did = did:web:yeehaa.io`, `did:web:rizom.ai`, and `did:web:rover.example.com`.
- Domain ownership is not inferred from hostname equality. The relationship is explicit in the brain card via `anchor.did`.

For public DID documents, prefer `did:web`:

- If a domain primarily serves one brain, the root DID is conventional for the brain: `did:web:yeehaa.io` served at `https://yeehaa.io/.well-known/did.json`.
- The anchor is conventionally distinct on the same domain using a path DID: `did:web:yeehaa.io:anchor` served at `https://yeehaa.io/anchor/did.json` — implemented for both conventional defaults and configured `anchorDid` values in the ATProto plugin.
- If a domain primarily represents the anchor and hosts multiple brains, use path/subdomain DIDs for brains instead.
- `did:plc` remains appropriate when domain-independent portability is needed.

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

Users can publish public brain content to AT Protocol through explicit entity-owned projections. Semantic custom records are quiet network records by default; Bluesky/social feed posts are a separate `social-post` workflow to design later.

- Public brain entities with registered projections become signed atproto records.
- Blog posts publish as `ai.rizom.brain.post` records.
- Durable public entities such as notes, links, decks, semantic social posts, series, projects, and topics should get entity-owned projections.
- Derived/ephemeral/internal support entities such as skills should not be projected in Phase 2 unless their product semantics change.
- No entity type is published blindly or automatically; projection registration is the explicit safety boundary.
- Bluesky `app.bsky.feed.post` publishing should be implemented through `social-post`, not as a side effect of semantic entity publishing.

User-facing result: **"My brain can publish my work to ATProto with portable identity and signed records."**

This is the first visibly valuable milestone.

### Phase 2.5: Public lexicon publication and local validation

Before Phase 3/4 network interoperability depends on custom records from multiple brains, Rizom lexicons must become public, canonical contracts with an explicit owner.

- Canonical `ai.rizom.brain.*` authority belongs to a Rizom protocol registry operated by the official `rizom.ai` brain/site, not to each publishing brain.
- Canonical lexicon JSON has one in-repo source of truth in `@brains/atproto-contracts` so publishing code, mapper tests, and registry routes consume the same artifacts.
- Entity packages own projections/mappers only. They import canonical lexicons from `@brains/atproto-contracts` for registration and local validation; they do not own separate `entities/*/lexicons/ai.rizom.brain.*.json` files.
- Serve machine-readable `ai.rizom.brain.*` lexicon JSON from the canonical registry path, likely `https://rizom.ai/atproto/lexicons/<nsid>.json`, with a manifest/index.
- Document canonical NSIDs, registry ownership, package projection ownership, compatibility/change policy, and how custom brain-specific extensions must use a namespace controlled by that brain/operator rather than `ai.rizom.brain.*`.
- Add local lexicon-backed validation in the ATProto publish path before calling `com.atproto.repo.createRecord` / `putRecord`; keep PDS writes compatible with public PDS instances that do not know Rizom lexicons.
- Add tests/checks that no duplicate canonical `ai.rizom.brain.*` lexicon JSON exists outside the contracts source of truth, and that all projections use canonical contracts.
- Revisit PDS `validate: true` only where the target PDS can resolve the relevant Rizom lexicons; do not make PDS-side validation the only correctness check.

User-facing result: **"Other tools and brains can understand Rizom ATProto records from a stable public contract owned by Rizom's protocol registry."**

### Phase 3: Inbound ingestion

Users can pull ATProto/Bluesky content into their brain.

- Bluesky posts and custom brain records can become local entities.
- Imported content can go through search, topic extraction, and other entity pipelines.
- Users can configure what is imported automatically versus held for review.

User-facing result: **"My brain can learn from my Bluesky/ATProto world."**

### Phase 4: Discovery

Users can discover other brains through the network while staying in control. Existing URL-based brain/agent addition remains the right path when the user already knows a brain URL; ATProto discovery adds value by finding unknown peers and enriching known agents from signed cards.

- Brains publish discovery cards.
- Other brains see those cards through Jetstream/firehose.
- Discovered brains appear as reviewable `agent` entries.
- Known agents can be enriched with signed card metadata, repo DID, brain DID, anchor DID, public skills, site URL, card URI, and CID.
- Discovery emits internal brain events so dashboards, notifications, or interfaces can signal new reviewable brains to the user.
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

Current implementation/product order:

1. Phase 1 + Phase 2: public ATProto article publishing — done for the app-password prototype.
2. Phase 4: decentralized brain discovery and signed card enrichment — next.
3. Phase 3: ingest external/social knowledge — after discovery establishes trusted/followed peers.
4. Phase 5 + Phase 6: curation and federation.

Phase numbers are historical; implementation proceeds in the order above.

First product promise: **"Publish public brain knowledge to ATProto, with portable identity and signed records, without automatically posting it to a social feed."**

## Phases

Implementation order is Phase 4 before Phase 3. The sections below keep the original phase numbers for continuity with earlier planning and cross-references.

### Phase 1: Plugin skeleton + identity

Status: core implementation complete for local/dev prototype; production hardening remains.

Done:

1. Create `plugins/atproto/` as a `ServicePlugin`
2. Define initial lexicon JSON for `ai.rizom.brain.card`; Phase 2.6 will move canonical `ai.rizom.brain.*` lexicons into `@brains/atproto-contracts` as the single source of truth
3. Add plugin config for PDS endpoint, handle/repo DID, optional `anchorDid`, optional `brainDid`, and standard `${ENV_VAR}`-interpolated auth secret references
4. Implement `did:web` document serving via `getWebRoutes()`: conventional root brain DID at `/.well-known/did.json` and conventional/configured path-based anchor DID values such as `did:web:example.com:anchor` at `/anchor/did.json`
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
- `atproto_publish_card` live upsert succeeded: `at://did:plc:mut7oy7nctoevokkshes2wpq/ai.rizom.brain.card/self`, latest smoke CID `bafyreidssutwp4rz42biofxtlkzbeiygwkwrst2she3owtxuykrc3xhzsm`.
- Follow-up verification via `com.atproto.repo.getRecord` returned the same card URI and `$type: ai.rizom.brain.card`.
- `atproto_publish_post` dry-run and live custom post write succeeded: `at://did:plc:mut7oy7nctoevokkshes2wpq/ai.rizom.brain.post/3mmywyqjukc2h`, CID `bafyreidcjytze5rg3tmbpsff3big4i4ilqn7arczeamodxwwieaxhhu3u4`.
- Follow-up verification via `com.atproto.repo.getRecord` returned the same post URI/CID and `$type: ai.rizom.brain.post`.
- Cover-image custom post smoke succeeded: `at://did:plc:mut7oy7nctoevokkshes2wpq/ai.rizom.brain.post/3mmyy53cu342h`, CID `bafyreiflaqk3lggleuo7ug757oj3yyofjnjfocdqg6weudmkovhh5qv2be`.
- Follow-up verification returned the custom post with `coverImage`.
- Finding: live PDS rejects unknown custom lexicons when `validate: true`; custom `ai.rizom.brain.*` writes use `validate: false`.
- 2026-06-02: stale `ai.rizom.brain.card/self` was republished against the then-current discovery-card schema.
- 2026-06-04: follow-up readback confirmed the live card is now invalid against the nested brain/anchor card schema (`Missing required AT Protocol record field: brain`). It still contains old top-level `name`, `description`, `a2aEndpoint`, and `capabilities`. Republish requires a controlled `siteUrl` domain; the conventional DIDs will be `did:web:<site-host>` and `did:web:<site-host>:anchor`. `rizom-test.bsky.social` is only the PDS handle and must not be used as a `did:web` host.
- 2026-06-02: generic semantic post smoke via `atproto_publish_entity` upserted `at://did:plc:mut7oy7nctoevokkshes2wpq/ai.rizom.brain.post/rizom-atproto-live-smoke`, CID `bafyreibjm3tazhp2hnryirtpairwcowpzl6pjbzgv7ljdjiqdpputyzquu`; follow-up PDS readback validated against the live `rizom.ai` post lexicon.

Still needed before production:

1. Add outbound ATProto OAuth once app-password prototype behavior is settled.

### Phase 2: Content distribution (outbound)

1. Implement explicit outbound publishing in the atproto plugin: entity → custom record via `com.atproto.repo.createRecord` / `putRecord`; custom `ai.rizom.brain.*` records are written with PDS validation disabled because public PDS instances do not know Rizom lexicons — implemented
2. Add an ATProto projection registration contract so entity plugins can register their mapper plus canonical lexicon contract as one projection; do not centralize entity mappers inside the ATProto plugin — implemented
3. Add a generic projection-backed publish path for any public entity with a registered ATProto projection, while keeping entity-specific convenience paths where useful — implemented as `atproto_publish_entity`, with `atproto_publish_post` as the blog convenience path
4. Add a tested `post` entity → `ai.rizom.brain.post` mapper using the existing blog post schema/frontmatter; include source references such as `sourceEntityType` and `sourceEntityId` where useful — implemented in `entities/blog`; successful publishes write the custom article URI back to blog frontmatter as `atprotoUri`
5. Add entity-owned projections for durable public entity types beyond blog posts: `note`, `link`, `deck`, semantic `social-post`, `series`, `project`, and `topic`. `series` is derived but durable and user-facing, so it belongs in Phase 2. Do not add Phase 2 projections for relationship/directory or ephemeral/support entities such as `agent` or `skill` unless their product semantics change. Public visibility is required but not sufficient: an entity type must define an explicit safe projection before it can be published.
6. Do not initially replace existing content-pipeline providers for entity types such as `post`; internal publish status semantics are separate from external ATProto distribution targets — protected by provider override regression tests
7. Evaluate a content-pipeline multi-provider/distribution-target extension after explicit publishing behavior is settled
8. Handle blob uploads for images (`com.atproto.repo.uploadBlob`) before records reference images — implemented for blog post cover images in custom records
9. Do not cross-post semantic entity records directly as `app.bsky.feed.post`; Bluesky/social posting should be added later as an ATProto provider/projection for the existing `social-post` workflow
10. Tests: blog `post` entity → `ai.rizom.brain.post` record payload, blob upload path, generic projection publishing, no accidental override of internal publish providers — implemented

### Phase 2 hardening (pre-merge review findings)

Pre-merge review findings are implemented for the current outbound scope:

1. **Registry uniqueness guard** — implemented. `AtprotoProjectionRegistry.register` allows idempotent re-registration of the same projection but rejects conflicting registrations for the same `entityType`.
2. **Dry-run cover-image parity** — implemented. Projection build input includes `dryRun`; blog cover-image dry-runs emit the same record shape without uploading a blob.
3. **Shared note frontmatter parsing** — implemented. The note projection uses `parseMarkdownWithFrontmatter` instead of a hand-rolled regex.
4. **Cleanups** — implemented for the current scope. Entity ATProto projection registrations keep unregister handles for shutdown cleanup, and blog `post.body` now matches the other longform lexicons with `maxLength: 100000`.

One structural cleanup remains deliberately deferred because it would move the topics plugin class: `topics` currently defines/registers its plugin from `src/index.ts`, unlike packages with a dedicated `src/plugin.ts`. This does not affect ATProto publishing behavior.

Deliberately deferred (consistent with this plan, not blockers):

- **JWT/session refresh** in `AtprotoPdsClient` — covered by the outbound ATProto OAuth follow-up; the app-password client does one-shot publishes today.
- **`did:web` `verificationMethod`** — the identity model treats `brainDid` as a non-signing reference DID (the repo `did:plc` signs records), so the served DID document intentionally carries only the PDS service endpoint. Revisit if a brain owns its own signing key.

### Phase 2 post-merge review fixes

Follow-up review of the integration merge fixed these issues in the current outbound scope:

1. **Idempotent entity publishing** — projected entity records now upsert via `putRecord` under a stable record key derived from the source entity id, instead of `createRecord` minting a new TID on every call. Republishing an entity updates its record in place rather than creating duplicates. Entity lexicon `key` is therefore `any` (caller-supplied stable keys), matching the "local entity is the source of truth" model; the brain card keeps `literal:self`. The blog `post` convenience path still writes `atprotoUri` back to frontmatter.
2. **Projection config surface narrowed** — `AtprotoPublishConfig` in `@brains/atproto-contracts` (the config handed to entity `buildRecord` mappers) now exposes only `brainDid`/`anchorDid`, the fields projections actually read. PDS auth/transport fields (identifier, endpoint, credentials, repo DID) stay on the plugin's own `AtprotoConfig` and no longer leak into entity packages.
3. **Secret handling consolidated** — removed the redundant `appPasswordEnv` config field. The app password is supplied via `${ENV_VAR}` interpolation into `appPassword`, consistent with how every other secret in the repo is configured.
4. **Stricter local validation** — `validateAtprotoRecord` now requires RFC-3339 date-times (previously a lenient `Date.parse`).

### Phase 2.5: Local validation and provisional public lexicon publication

1. Add local lexicon-backed validation for projected records before PDS writes. This validation is required even when the PDS write uses `validate: false` for unknown custom lexicons — implemented.
2. Publish provisional machine-readable lexicon JSON for `ai.rizom.brain.*` under `https://rizom.ai/atproto/lexicons/<nsid>.json` — implemented in the Rizom site static assets as a prototype, not the final ownership model.
3. Add drift tests so package-local lexicons and the provisional public copies cannot diverge silently — implemented for the Rizom site static assets, but to be replaced by single-source contract checks in Phase 2.6.
4. Document how other brains/tools should fetch and interpret Rizom lexicons — implemented in [ATProto Lexicons](../atproto-lexicons.md), but must be revised once the registry ownership model is implemented.
5. Tests: malformed local projected record is rejected before PDS write; provisional lexicon publication includes every registered Rizom custom record; package-local and provisional public lexicons stay in sync.

### Phase 2.6: Rizom protocol registry ownership

Status: implemented, released, deployed, and live-verified. `@brains/atproto-registry` exists, Ranger exposes it as an opt-in capability, and the official `rizom.ai` instance serves the canonical `ai.rizom.brain.*` registry routes.

Implement a registry capability as a separate service plugin, `@brains/atproto-registry`, rather than overloading the per-brain ATProto publisher. Running this plugin on the official `rizom.ai` Ranger brain/site makes that deployment the canonical public protocol authority for the shared Rizom ATProto namespace.

Source-of-truth decision:

- Canonical lexicon JSON lives in `@brains/atproto-contracts` and is exported as typed constants/helpers.
- Entity projection packages import those canonical lexicons for registration and tests.
- `@brains/atproto-registry` imports those same canonical lexicons and serves them publicly.
- No `ai.rizom.brain.*` lexicon JSON should remain under `entities/*/lexicons`, `plugins/atproto/lexicons`, or `sites/rizom/src/runtime/atproto/lexicons` after this migration, except generated output if a later build step explicitly owns it.

Responsibilities:

1. Own public governance for `ai.rizom.brain.*` NSIDs when deployed on `rizom.ai`. Individual brains may publish records using those NSIDs, but do not independently define or mutate them.
2. Serve canonical registry routes such as:
   - `GET /atproto/lexicons/index.json`
   - `GET /atproto/lexicons/<nsid>.json`
   - optional human-readable `/atproto/lexicons/`
3. Provide registry metadata from the same source as the canonical lexicons: NSID, status (`draft`, `approved`, `deprecated`), version/revision, owner/steward, projection package, compatibility notes, and replacement/deprecation pointers.
4. Define the compatibility policy: additive fields, required-field changes, deprecation, and when a new NSID/version is required.
5. Provide admin/check tools such as:
   - `atproto_registry_list_lexicons`
   - `atproto_registry_validate_lexicon`
   - `atproto_registry_check_contracts`
6. Add checks that all registered projections import/use canonical contracts and that no duplicate canonical `ai.rizom.brain.*` JSON files exist outside `@brains/atproto-contracts`.
7. Clarify extension rules: brain-specific custom records must use a namespace controlled by that brain/operator, not `ai.rizom.brain.*`.
8. Update [ATProto Lexicons](../atproto-lexicons.md) and the Rizom site routes to describe the registry as the canonical authority instead of treating static site copies as the ownership boundary.

Live registry smoke result:

- 2026-06-02: `https://rizom.ai/health` returned `200 OK` after deploying `rizom-ai` with `@rizom/brain@0.2.0-alpha.101`.
- 2026-06-02: `https://rizom.ai/atproto/lexicons/index.json` returned `200 OK`.
- 2026-06-02: `https://rizom.ai/atproto/lexicons/ai.rizom.brain.post.json` returned `200 OK`.
- 2026-06-02: `https://rizom.ai/atproto/lexicons/ai.rizom.brain.card.json` returned `200 OK`.

Important distinction:

- Runtime projection registration means: "this brain can publish this entity type to this ATProto collection."
- Protocol registry publication means: "the official `rizom.ai` registry exposes this NSID as part of the canonical `ai.rizom.brain.*` protocol."
- Both consume the same `@brains/atproto-contracts` lexicon artifacts, so coordination is by shared contract import rather than drift-prone duplicated files.

### Phase 2.7: Zod-sourced contracts

Status: implemented in-repo for outbound contracts as an interim bridge. `@brains/atproto-contracts` now exports lexicon-derived Zod record schemas, record-schema lookup/list helpers, canonical record type interfaces, and a Zod-backed `validateAtprotoRecord` compatibility helper. Entity projection mappers return the canonical ATProto record types directly. This gives publishing and registry validation an executable contract before Phase 3 ingestion. Remaining follow-up: reuse these schemas directly in Phase 3 inbound ingestion, then complete the planned Zod-source-of-truth migration by generating lexicon JSON from Zod.

Today the lexicon JSON is still the source of truth, with TypeScript record interfaces and runtime schemas kept aligned by conformance tests. Sync is structural where it can be (one imported lexicon object, a repo-wide duplicate-file guard, publish-time and CI validation), but the type/source axis still relies on tests until the Zod → lexicon emitter lands.

Planned direction: make a **Zod schema the single source of truth** for each canonical record, with the lexicon JSON generated from it.

- Define each record as a Zod schema in `@brains/atproto-contracts` via a small `defineAtprotoRecord({ id, key, description, schema })` helper.
- TypeScript record type = `z.infer<typeof schema>` — always in sync, no codegen-for-types, no drift.
- Runtime validation = `schema.parse(...)`, replacing the hand-rolled `validateAtprotoRecord` walker.
- Generate the AT Protocol lexicon JSON from the Zod schema with a `zod → lexicon` emitter supporting the subset actually used (`ZodString.max → maxLength`, `.datetime()`/`.url() → format`, `ZodLiteral`/`ZodEnum → knownValues`, `ZodOptional → not-required`, nested `ZodObject → object properties`). The registry serves the generated JSON.
- Commit the generated JSON and add a drift test that regenerates and asserts no git diff, so the compiler + Zod + that test together guarantee JSON ↔ TS ↔ validator alignment.
- Lexicon enrichment (nested object shapes, etc.) then flows naturally from the schemas and simultaneously strengthens runtime validation.
- Use the same schemas in `@brains/atproto-registry` validation tools, outbound projection mapper tests, and Phase 3 inbound ingestion.

Rationale: Zod is already the repo's validation idiom — entity schemas, plugin config schemas, and the lexicon parser itself all use it. The one new bespoke piece is the `zod → lexicon` emitter, which replaces the bespoke validator being deleted, so net maintained complexity is roughly a wash but better leveraged. Prove the emitter on `ai.rizom.brain.card` (the simplest record) and confirm the generated JSON matches the current hand-authored file before migrating the rest.

User-facing result: **"Rizom ATProto records have one canonical, executable contract for publishing and ingestion."**

### Phase 3: Inbound ingestion

Deferred until after Phase 4 discovery so ingestion can use the approved/followed brain model instead of importing arbitrary network records first.

1. Subscribe to user's atproto repo (or Jetstream for lightweight JSON events)
2. Filter for relevant record types (`app.bsky.feed.post`, `ai.rizom.brain.*` custom lexicons from other brains). Do not rely on private repo-local lexicon JSON here; consume records against the public canonical Rizom lexicons from the Phase 2.6 protocol registry and the Zod-backed contracts from Phase 2.7.
3. Convert atproto records to brain entities (markdown with frontmatter)
4. Ingest via entity service (`createEntity`)
5. Run entity pipeline on ingested content (topic extraction, series association)
6. Configurable: which record types to ingest, filter by DID, auto vs manual approval
7. Tests: mock firehose events → verify entities created

### Phase 4: Discovery

Status: partially implemented. The first implementation slice added bounded candidate repo discovery and agent-directory enrichment without broad inbound ingestion. The card schema has been revised to a signed public **brain + minimal anchor discovery card**, not a mini A2A Agent Card and not an endpoint registry.

Target `ai.rizom.brain.card` shape:

- `siteUrl` — public site/profile URL for the brain. The operational A2A Agent Card is derived conventionally from this at `/.well-known/agent-card.json`.
- `brain` — required brain identity block: `{ did, name, role, purpose, values }`.
- `anchor` — required minimal owner/operator snapshot: `{ did, name, kind }`. Use `anchor.did` as the canonical grouping key; keep the snapshot minimal to avoid duplicating a full owner profile across every brain card.
- `skills` — required public discovery summary of user-facing skills.
- `model`, `version`, `createdAt`, optional `updatedAt`.

Do not include top-level `a2aEndpoint`, `agentCardUrl`, generic `capabilities`, copied A2A endpoint lists, or a full anchor profile in the ATProto card. A2A owns operational protocol details; the ATProto card owns signed public discovery/identity.

Shares the `agent` entity type with the broader agent-directory work. Phase 4 should not duplicate the existing add-brain-by-URL workflow; when a user already knows a brain URL, that remains the direct path. ATProto discovery adds value by discovering unknown peers from the network and by enriching existing agents from signed `ai.rizom.brain.card` records. Firehose-discovered brains should enter the directory as `discovered` agents, not immediately callable contacts. The durable agent model no longer assumes `discoveredVia`, and A2A no longer auto-creates saved agents on first contact. Firehose discovery should therefore enrich or refresh existing saved entries when they already exist, while otherwise creating reviewable discovered agents keyed by domain/brain DID.

1. Publish an `ai.rizom.brain.card` record to PDS when configured — implemented with nested `brain` identity plus minimal `anchor` snapshot
2. Discover candidate brain cards from supplied repo DIDs/handles via resolved-PDS `com.atproto.repo.getRecord`, with explicit limits and filters rather than unbounded ingestion — implemented as the first producer slice; Jetstream candidate sourcing remains deferred
3. Validate cards against the canonical `ai.rizom.brain.card` contract before creating or updating anything — implemented
4. Upsert discovered brains as `agent` entities keyed by domain/URL/DID, merging with existing entries by domain where possible — implemented by domain for card events
5. Enrich known agents from signed cards with safe metadata: repo DID, `brain.did`, `anchor.did`, card URI/CID, site URL, and public skills — implemented
6. Preserve the approval lifecycle: new firehose entries are `status: discovered`; existing `approved` entries may be enriched but must not be downgraded; discovered entries must not be callable until approved — create/enrich behavior implemented; A2A approval-only guard remains covered by existing agent workflow semantics
7. Emit internal discovery events through the shell message bus after create/update, e.g. `atproto:brain-discovered` for new reviewable agents and `atproto:brain-card-refreshed` for existing-agent enrichment — implemented
8. Keep notification delivery separate from discovery logic: dashboards, notification plugins, Discord/web interfaces, or future UI surfaces may subscribe to those events and decide whether/how to alert the user — implemented as message-bus-only events
9. A2A client resolution continues to use only approved saved agents
10. Add a refresh path for existing agents so known URL-added agents can be upgraded with signed ATProto card metadata — implemented for existing agents keyed by domain
11. Add configurable discovery filters: allowed domains/DIDs, anchor DIDs, skill keywords, max cards per run, and dedupe by brain DID/domain/card URI — max per run and in-batch card dedupe implemented; allow/deny and skill filters remain deferred
12. Update card when brain identity, anchor identity, model, or skills change
13. Tests: publish card → discover from another brain → create reviewable agent, emit discovery event, enrich existing approved agent without downgrade, refresh URL-added agent from card, emit refresh event, verify discovered agents are refused by A2A until approval — discovery producer, agent create/enrich, and event tests implemented

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

1. Subscribe to Jetstream filtered for `ai.rizom.brain.*` records from approved or explicitly followed brain DIDs, interpreting custom records against the public canonical Rizom lexicons from the Phase 2.6 protocol registry
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

## Related finding: contracts barrel export (audit 2026-06-10)

`shared/atproto-contracts/src/index.ts` (817 lines) re-exports 200+ zod
schemas from one barrel — the type-instantiation blowup `shared/utils`
explicitly warns against in its own index. When touching the contracts
package for OAuth/discovery work, split the barrel by domain (records,
types, projections) with named exports.
