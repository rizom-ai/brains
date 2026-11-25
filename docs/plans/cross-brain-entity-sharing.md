# Plan: Cross-brain entity sharing

Last updated: 2026-11-25

## Status

**Proposed. Nothing is built.** This plan covers how one brain uses what another brain publishes: public content as pointers over ATProto, shared content as tracked copies over A2A. It replaces the plan of 2026-09-22 and `curated-member-posts.md` (2026-11-24). Checked against the code on 2026-11-25, the old plan no longer held: its public half had been built as `network-piece` and removed, unknown frontmatter keys now survive export, and directory sync no longer discards conflicts.

The first user is the Rizom Foundation's site, `rizom.foundation`, which will show a curated selection of articles by members of the Rizom network, the founder's own essays included. The [three-site plan](./rizom-three-sites.md) shows that selection as hand-authored rows until slice 4 ships, then switches to it.

Slices 1 to 4 (public pointers) can start; the owner's questions for them are answered. Slices 6 to 8 (shared copies) wait for demand and for the approval risk below to be settled.

## The shape

**Visibility picks the transport and what is stored.**

```
public      → ATProto record      a pointer: display fields and provenance, never the body
shared      → A2A directed pull   a tracked copy in its own type, read-only
restricted  → neither, ever
```

`shell/entity-service/src/visibility.ts` already defines the three levels and maps a caller's permission level onto the scope they may read. The plan invents no identifier and no authorization vocabulary.

Public content is pointed to, not copied: brains copied other brains' public records as `network-piece` entities from 2026-10-02 (`eecbdea7dc`) until 2026-10-10 (`2490d2aa5c`), which removed the type because `network_ask` answers live, so the copy "only duplicated their content". Shared content is copied, because a pointer to something only a granted peer may read is useless to everyone else.

## Goal

- A brain can feature a curated selection of public entities that other brains publish, without copying them: the curator chooses, the author keeps the entity on their own brain, and the featuring brain links to it there.
- A brain can later take a peer's shared entity into its own store as a read-only copy that stays current and is withdrawn when the owner stops sharing.

## Non-goals

- **No copies of public content.** A pointer never stores a record's `body`.
- **No automatic feed.** Nothing is featured without a curator selecting it, and nothing is created from the ATProto firehose.
- **No bidirectional sync.** An entity has one owner brain; editing a tracked copy forks it into an ordinary local entity carrying `derivedFrom`, and the subscription ends.
- **No republishing.** Pointers and copies are never projected to ATProto or offered onward; forwarding someone else's content is its own consent question.
- **No RSS.** Every field a pointer needs is in the author's ATProto records (decision 2), so no inbound feed parser is built.
- **No shared git remote between brains run by different people**, and no MCP-to-MCP federation: both would make one brain a user or writer of another (`identity-and-trust.md` decisions 4 and 5).

## What exists today

- **Records are written on publish and update.** The atproto plugin upserts a record when a public, publishable entity is published or changed, and deletes it when the entity is unpublished or stops being public (`plugins/atproto/src/plugin.ts:172-194`, `:783-812`). Records upsert under a key derived from the entity id (`deriveAtprotoRecordKey(entity.id)`), not the URL slug: yeehaa.io's `scale-without-a-centre` record is the page `scale-without-a-center`.
- **Nothing backfills.** Entities published before the projection existed, or not touched since, have no record: yeehaa.io's repo holds 3 `ai.rizom.brain.post` records against 28 published essays. `brainDid` and `anchorDid` are added only when configured (`shared/atproto-contracts/src/record-provenance.ts:52-65`), and yeehaa.io's records carry neither.
- **Eight entity types project records**, each carrying `canonicalUrl`, `sourceEntityType` and `sourceEntityId`: post, deck, link, note, project, series, social post and topic (`shared/atproto-contracts/src/lexicons/`). A post record holds `title`, `summary` (the excerpt), `body`, `series`, `seriesIndex`, `publishedAt` and `canonicalUrl` (`entities/blog/src/atproto-projection.ts:73-96`); an essay first published elsewhere keeps that address as its `canonicalUrl`.
- **A brain card names the author.** Each brain's `ai.rizom.brain.card` record carries its anchor's `did` and `name`, the brain's profile name.
- **Reading another brain's records** works for brain cards: the plugin resolves a repo to its PDS (`resolveRepoPdsEndpoint`, `plugins/atproto/src/identity-resolver.ts:85`), checks the endpoint is a safe public URL, and calls `getRecord` on a public client (`plugins/atproto/src/plugin.ts:466-480`). `listRecords` was removed with `network-piece`. An agent entity can hold a peer's `repoDid` (`entities/agent-discovery/src/schemas/agent.ts:77`).
- **Frontmatter keeps what a type does not claim.** A stored key the type's schema does not name survives export (`preserveSourceFrontmatter`, `shell/entity-service/src/entity-serializer.ts:257`), and a type can register extra flat fields with `extendFrontmatterSchema` (`shell/entity-service/src/entityRegistry.ts:404`), which also makes them queryable metadata. `link` already owns `sourceRef` (`entities/link/src/lib/link-markdown.ts:51`).
- **Refresh bookkeeping belongs in runtime state.** [frontmatter-hygiene.md](./frontmatter-hygiene.md) keeps frontmatter to what a person authors or reads plus provenance the entity cannot reconstruct; refresh state, retry counters and check times live in the owning plugin's runtime state.
- **No entity crosses A2A.** A2A dispatches three JSON-RPC methods (`interfaces/a2a/src/jsonrpc-handler.ts:167-176`), and nothing handles the `X-A2A-Extensions` header: the anchor extension only declares card params (`shell/plugins/src/a2a/agent-card-schema.ts:10`, `interfaces/a2a/src/agent-card.ts:82-88`). Structured data already travels as a `DataPart` in the `sources` artifact (`jsonrpc-handler.ts:19-36`).
- **Peers top out at `trusted`.** The stored peer grant is `"public" | "trusted"` (`shared/contracts/src/auth-access.ts:97-100`), and `grant()` refuses `admin` (`shell/auth-service/src/peer-trust-store.ts:49`), so a peer reads at most the `shared` scope. Public readers see only published entities (`scopeEntityReads`).

## Decisions

### Public pointers

1. **One pointer type, `featured`, in a new package `entities/featured`.** One markdown file per featured entity in the featuring brain, for every kind of entity, with `sourceEntityType` saying which. The package holds the entity, its capture job, its daily recheck and its site template, as `entities/agent-discovery` holds the agent entity with its templates, data source and recurring check. Entity packages expose no CRUD tools (`entities/AGENTS.md`), so a curator creates an entry through the shared create path, which runs the capture job. `link` is not a fit: its summary is LLM-written and it has no date or byline.
2. **ATProto is the only source.** A record holds every field a pointer shows, records exist for all eight projected types, the author is identified by DID, and withdrawal is a deleted record. RSS would cover posts only and needs a parser that does not exist. The price is that a member can be featured only when their brain publishes records (an ATProto account and app password; the professional recipe includes the `federation` bundle).
3. **The `at://` URI is the key.** It survives a slug rename, which a URL does not. The curator still gives an address, and capture resolves it to a record through `canonicalUrl`. Creating the same record twice returns the existing entry.
4. **Selection is the status.** A captured entry is a `draft`; publishing it is the editorial choice; unpublishing removes it from the site. Production renders only published entries whose source is `active`; the preview also shows drafts, as site builds do for every type (`publishedOnly` is set for production builds only, `plugins/site-builder/src/lib/prepare-site-build.ts:95`), so the curator sees an entry before choosing it. A `withdrawn` entry renders in neither.
5. **Display fields and provenance in frontmatter; check state in runtime state.** Frontmatter holds what a reader or curator needs and the provenance the entry cannot reconstruct (see the entity below). The record's CID, the last check and failure counts live in the package's runtime state, following frontmatter hygiene.
6. **The body is never stored.** Capture and recheck read a record's display fields and drop its `body`. An entry's own body stays empty: a curator's note on a public, published entry would be readable through public chat (`system_get` returns the stored markdown, and visibility covers a whole entity), and a public note would set the Foundation's words beside the author's.
7. **The ATProto read path is shared.** Resolving a repo, the safe-endpoint check and the public client move out of `plugins/atproto` into a shared package, so the atproto plugin and `entities/featured` use one path and the entity package imports no plugin. `listRecords` is added there. Fetching is injected: tests pass their own fetch, built like `createSafePublicFetch` (`shared/utils/src/safe-public-fetch.ts`); nothing mocks `globalThis.fetch` or our own utils.
8. **A withdrawn entity leaves production too.** When the recheck marks an entry `withdrawn`, it requests a site rebuild through `siteBuildRequestContract` (`shared/contracts/src/site-build.ts`).
9. **Only entities on a member's own Brain.** A pointer is to a record in a member brain's repo, not to Substack, Medium or a journal. Its link follows the record's `canonicalUrl`, which for an essay first published elsewhere is that address, as its author chose.
10. **Admins select.** Creating and publishing a pointer takes the admin level, the platform default for every entity action (`PLATFORM_ENTITY_ACTION_DEFAULTS`, `shell/app/src/resolver/permissions.ts:11`), so the package declares no policy. A brain can later let trusted users propose drafts with `entityActions.featured.create: trusted` in `brain.yaml`, while `publish` stays admin.
11. **The author's own name is shown.** The byline is the anchor `name` on the author's brain card, the name the author gave their own brain. The curator cannot override it; the recheck keeps it current; an author who wants another name changes their profile.
12. **Posts first, single entities, newest first.** The first version features posts. Decks, projects and series follow in slice 5: their records already carry a title, a description and a `canonicalUrl`, so they need no other source. The curator does not order entries by hand; that can come later as an optional field that falls back to the date, with no migration.
13. **Authors are not notified.** Featuring sends nothing to the author. A notice would travel over A2A, which reaches only approved agents, and approving a member lists them in the featuring brain's public agent directory. An author leaves the selection by unpublishing the entity, which deletes its record and so withdraws the pointer, or by asking the featuring brain's admins to unpublish the entry.

### Shared copies (slices 6 to 8)

14. **A shared entity is stored as a read-only copy in its own type.** A pulled note is a `note`, validated against the local schema and found by search like any other. Editing it forks it (non-goals).
15. **Provenance is flat frontmatter, registered per type.** A type that accepts copies registers `sourceBrain`, `sourceEntityType`, `sourceEntityId` and `sourceState` with `extendFrontmatterSchema`. No system envelope is added: unclaimed keys already survive export, and widening `ENTITY_SYSTEM_FIELDS` (`shell/entity-service/src/frontmatter.ts:42`) would add entity row columns. The source's content hash and check state live in runtime state, and no copy uses `sourceRef`, which `link` owns.
16. **The pull is a declared A2A extension, not a new method.** `https://rizom.ai/ext/entity-sharing/v1` is declared in `capabilities.extensions` beside the anchor extension and activated per request by the `X-A2A-Extensions` header, with the request carried as a `DataPart` in an ordinary `message/send`. The handler matches the header and the `DataPart` before dispatch reaches the agent, so no model is in the path. New JSON-RPC methods are rejected because the SDK's `A2ARequest` union is closed; MCP client enrolment and a free-text skill are rejected for making a brain a user of another brain and for putting a model in a byte-transfer path. This handler is new: nothing reads the extension header today.
17. **Peers never reach `restricted`, and every miss is a `404`.** A peer's best grant is `trusted`, which maps to the `shared` scope. The peer read path applies the published-only gate public readers already get, and serves only entities whose visibility was declared explicitly: a file with no `visibility` key resolves to `public` at the entity layer (`visibility.ts:28`), while the file layer treats the absence as no opinion (`frontmatter.ts:234-249`). Not found, out of scope, undeclared and wrong type are one byte-identical response.
18. **Withdrawal retains and excludes.** When the owner stops sharing, the copy's `sourceState` becomes `withdrawn`; the copy is kept as a record and excluded from every published surface. An unreachable peer is never a withdrawal.
19. **The first pull is confirmed; refreshes are not.** Taking a peer's entity writes into search and possibly a site, so the first acquisition waits in an entity inbox, as `agent-sightings` does (`entities/agent-discovery/src/agent-entity.ts:46`). Later refreshes apply on their own.

## The pointer

`featured`, one markdown file per featured entity.

| Field              | Source                                   | Notes                                   |
| ------------------ | ---------------------------------------- | --------------------------------------- |
| `sourceUri`        | the record's `at://` URI                 | the key (decision 3)                    |
| `sourceEntityType` | record `sourceEntityType`                | `post` in the first version             |
| `sourceEntityId`   | record `sourceEntityId`                  |                                         |
| `sourceBrain`      | record `brainDid`                        | optional; yeehaa.io sets none today     |
| `url`              | record `canonicalUrl`                    | a record without one cannot be featured |
| `title`            | record `title`                           |                                         |
| `summary`          | record `summary`, else `description`     | the author's own words, never a summary |
| `author`           | anchor `name` on the author's brain card | decision 11                             |
| `authorSite`       | origin of `url`                          | for example `yeehaa.io`                 |
| `publishedAt`      | record `publishedAt`, else `createdAt`   |                                         |
| `series`           | post record `series`                     | optional                                |
| `status`           | `draft` or `published`                   | the curator's choice                    |
| `sourceState`      | `active` or `withdrawn`                  | set by the recheck; the site reads it   |

The body is empty (decision 6). The record's CID, the last check and failure counts are runtime state (decision 5).

## Flows

### Feature an entity

1. A curator gives the featuring brain an address, in chat or Studio, through the shared create path.
2. The capture job finds the author's repo: the `repoDid` of the agent entity for the address's site, else the site's domain resolved as an ATProto handle. When neither resolves, it fails with a message that says so, and nothing is created.
3. It lists the repo's post records, finds the one whose `canonicalUrl` matches the address, reads the brain card for the byline, and writes a `draft`. When no record matches, it fails with a message that says the article has no record yet.
4. The curator publishes the draft. The site shows it on its next build.

### Recheck

Every day, the recheck reads each entry's record with `getRecord` and each author's brain card once:

- the same CID: nothing changes;
- a new CID: changed fields and the byline are updated in place;
- record not found: `withdrawn`, and one rebuild request;
- a record that returns: `active` again;
- a network or server failure: nothing changes, and the failure is counted in runtime state.

### Pull a shared entity (slices 6 to 8)

```
operator or refresh asks for <peer, entityType, id>
  → resolve the peer in the agent directory
      ✗ not approved / archived / unknown → fail closed, no network contact
  → signed message/send, X-A2A-Extensions: https://rizom.ai/ext/entity-sharing/v1
    DataPart { op: "get", entityType, id }
  → peer verifies the RFC 9421 signature (interfaces/a2a/src/a2a-interface.ts:156-195)
      ✗ invalid                         → 401
  → peer scopes the read to the caller's grant, published only, declared visibility only
      ✗ any miss                        → 404
  → peer returns the entity's markdown and content hash
  → consumer validates against its local schema
      ✗ invalid                         → rejected, shown to the operator, nothing written
  → first pull → inbox, confirmation required; refresh → applied
  → stored in its own type with provenance (decision 15)
```

A refresh with the same hash writes nothing; a new hash replaces the body; a `404` (including a downgraded grant) becomes `withdrawn` and notifies the operator; an unreachable peer changes nothing.

## Slices

Each slice is end to end and has its tests written before the code. Tests use `createPluginHarness()`, inject HTTP through constructor dependencies, and use no type casts.

1. **Records for everything published.** The shared ATProto read path with `listRecords` (decision 7), and a reconcile job in the atproto plugin that upserts a record for every public, publishable entity of each projected type. Records upsert under their stable key, so the job is idempotent. Run it on yeehaa.io, with `brainDid` and `anchorDid` set in its config. _Tests:_ the job writes one record per publishable entity and none for drafts or non-public ones; a second run changes nothing; `listRecords` pages through a repo and rejects an unsafe endpoint.
2. **The pointer and capture.** The schema, the markdown adapter and the capture job. A curator can create and publish entries; nothing renders yet. _Tests:_ an address with a matching post record becomes a draft with the fields above; the byline comes from the brain card; an address with no record fails with a clear message and creates nothing; the same record twice returns one entry; the stored file never contains the record's `body`.
3. **Recheck and withdrawal.** The daily recurring check, runtime-state bookkeeping, `withdrawn` and back, and the rebuild request. _Tests:_ the five recheck outcomes above, with exactly one rebuild request per withdrawal.
4. **Site section.** A `featured` section template and data source any site package can use: each entry shows its series, author and date as a kicker, the title and the summary, and links to `url` on the author's site; there are no local detail pages; newest first. Then `rizom.foundation` replaces its hand-authored rows with the section. _Tests:_ a production build renders only `published` and `active` entries, a preview build also renders drafts, a `withdrawn` entry renders in neither, and each links to its `url`.
5. **More kinds.** Decks, projects and series as entries, read from their own records, with a kicker each kind can fill.
6. **Pull one shared entity.** The declared extension and its handler ahead of agent dispatch, and a tool that pulls a named entity from a named approved peer and shows it; nothing stored. _Tests:_ an unapproved peer fails before network contact; a bad signature is `401`; `restricted` is `404` for a `trusted` caller; `shared` is `404` for a `public` caller and served to a `trusted` one; an undeclared or unpublished entity is `404`; every miss is byte-identical; a request without the header reaches the agent as ordinary prose; an unrelated A2A client still completes `message/send`, `tasks/get` and `tasks/cancel`.
7. **Store and refresh copies.** Provenance registered per type, the inbox confirmation, the refresh and withdrawal, and the republish guard. _Tests:_ provenance survives export and re-import; a forged `sourceBrain` naming an unapproved peer never triggers a fetch; a copy is never projected to ATProto; content failing the local schema writes nothing; the refresh outcomes above.
8. **Discovery and change signals.** A scoped `list` operation, so a consumer sees what a peer offers without guessing ids, and, once the [atproto plan](./atproto-integration.md)'s known-only Jetstream admission ships, record events for approved repos that trigger a recheck or refresh early. The daily check stays as reconciliation, and the stream never creates an entity.

## Validation

- Package tests, `bun run typecheck` and `bun run lint` for each slice.
- Slices 1 to 4, app-managed: start a brain with `entities/featured`, create an entry for a real yeehaa.io essay after its backfill, trigger a site rebuild on the running app through the app command surface, and inspect `dist/site-preview`. For withdrawal, point the recheck at a fixture repo without the record and confirm the rebuild removes the entry.

## Later, not in this plan

- Hand ordering, and a public curator's note (decisions 6 and 12).
- Telling authors they are featured (decision 13).
- Publishing the selection itself as ATProto records.

## Risks

- **Approval is content.** The A2A client's approval gate reads the agent entity's `status` (`interfaces/a2a/src/client.ts:761`), and agent entities are git-synced markdown, so anyone who can write the content repo can approve a peer. The old plan's argument that a forged `sourceBrain` is harmless rested on approval being runtime state; only the inbound peer grant is. Slices 6 to 8 do not start until this is settled.
- **Members without records cannot be featured.** A member whose brain has no ATProto account, or who has not run the backfill, has nothing to point to; capture says so rather than falling back to scraping.
- **Recheck cost grows with the selection.** One `getRecord` per entry and one brain card per author per day stays small at the Foundation's scale; past that, `listRecords` per repo replaces per-entry reads.
