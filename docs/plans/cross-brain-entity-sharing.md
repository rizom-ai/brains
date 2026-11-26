# Plan: Cross-brain entity sharing

Last updated: 2026-11-25

## Status

**In progress. Slices 1 to 5 are built (PR #1044) and not yet run against a live repo; slices 6 to 9 are next.** This plan covers how one brain uses what another brain publishes: public content as pointers over ATProto, shared content as tracked copies over A2A. It replaces the plan of 2026-09-22 and `curated-member-posts.md` (2026-11-24). Checked against the code on 2026-11-25, the old plan no longer held: its public half had been built as `network-piece` and removed, unknown frontmatter keys now survive export, and directory sync no longer discards conflicts.

The first user is the Rizom Foundation's site, `rizom.foundation`, which will show a curated selection of articles by members of the Rizom network, the founder's own essays included. The [three-site plan](./rizom-three-sites.md) shows that selection as hand-authored rows until slice 4 ships, then switches to it.

Slices 6 to 9 (shared copies) follow as a second PR; slice 6 moves peer approval into runtime state before any copy is exchanged. Records for the types that have a page but no record (newsletter, doc, guide, book) follow as their own PR, one format per type.

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
- **Records are kept complete on every start** (slice 1). Before it, entities published before the projection existed had no record: yeehaa.io's repo held 3 `ai.rizom.brain.post` records against 28 published essays. A record names its brain and anchor as the brain card does: the configured DIDs, else the site's `did:web` pair, else the account or repo.
- **Eight entity types project records**, each carrying `canonicalUrl`, `sourceEntityType` and `sourceEntityId`: post, deck, link, note, project, series, social post and topic (`shared/atproto-contracts/src/lexicons/`). A post record holds `title`, `summary` (the excerpt), `body`, `series`, `seriesIndex`, `publishedAt` and `canonicalUrl` (`entities/blog/src/atproto-projection.ts:73-96`); an essay first published elsewhere keeps that address as its `canonicalUrl` and names its page on the author's brain as `pageUrl`.
- **A brain card names the author.** Each brain's `ai.rizom.brain.card` record carries its anchor's `did` and `name`, the brain's profile name.
- **Reading another brain's records** goes through `@brains/atproto-client` (slice 1): a repo is resolved to its PDS, the endpoint is checked to be a safe public URL, and records are read or listed a page at a time without signing in. An agent entity can hold a peer's `repoDid` (`entities/agent-discovery/src/schemas/agent.ts:77`).
- **Frontmatter keeps what a type does not claim.** A stored key the type's schema does not name survives export (`preserveSourceFrontmatter`, `shell/entity-service/src/entity-serializer.ts:257`), and a type can register extra flat fields with `extendFrontmatterSchema` (`shell/entity-service/src/entityRegistry.ts:404`), which also makes them queryable metadata. `link` already owns `sourceRef` (`entities/link/src/lib/link-markdown.ts:51`).
- **Refresh bookkeeping belongs in runtime state.** [frontmatter-hygiene.md](./frontmatter-hygiene.md) keeps frontmatter to what a person authors or reads plus provenance the entity cannot reconstruct; refresh state, retry counters and check times live in the owning plugin's runtime state.
- **No entity crosses A2A.** A2A dispatches three JSON-RPC methods (`interfaces/a2a/src/jsonrpc-handler.ts:167-176`), and nothing handles the `X-A2A-Extensions` header: the anchor extension only declares card params (`shell/plugins/src/a2a/agent-card-schema.ts:10`, `interfaces/a2a/src/agent-card.ts:82-88`). Structured data already travels as a `DataPart` in the `sources` artifact (`jsonrpc-handler.ts:19-36`).
- **Peers top out at `trusted`.** The stored peer grant is `"public" | "trusted"` (`shared/contracts/src/auth-access.ts:97-100`), and `grant()` refuses `admin` (`shell/auth-service/src/peer-trust-store.ts:49`), so a peer reads at most the `shared` scope. Public readers see only published entities (`scopeEntityReads`).

## Decisions

### Public pointers

1. **One pointer type, `reference`, in a new package `entities/reference`, part of the `federation` bundle.** The bundle is both directions: a brain publishes itself and points to what other brains publish. The lexicon registry (`atproto-registry`) is outside every bundle, added by the one brain that is the lexicon authority. One YAML file per referenced entity in the referencing brain, for every kind of entity, with `sourceEntityType` saying which. The package holds the entity, its capture job, its daily recheck and its site template, as `entities/agent-discovery` holds the agent entity with its templates, data source and recurring check. Entity packages expose no CRUD tools (`entities/AGENTS.md`), so a curator creates an entry through the shared create path, which runs the capture job. `link` is not a fit: its summary is LLM-written and it has no date or byline.
2. **ATProto is the only source.** A record holds every field a pointer shows, records exist for all eight projected types, the author is identified by DID, and withdrawal is a deleted record. RSS would cover posts only and needs a parser that does not exist. The price is that a member can be featured only when their brain publishes records (an ATProto account and app password; the professional recipe includes the `federation` bundle), and only for a type that has a record and a page on the author's site.
3. **The `at://` URI is the key.** It survives a slug rename, which a URL does not. The curator still gives an address, and capture resolves it to a record through `canonicalUrl`. Creating the same record twice returns the existing entry. An entry's id is the author's site and the record key (`yeehaa-io-scale-without-a-centre`).
4. **Selection is the status.** A captured entry is a `draft`; publishing it is the editorial choice; unpublishing removes it from the site. Production renders only published entries whose source is `active`; the preview also shows drafts, as site builds do for every type (`publishedOnly` is set for production builds only, `plugins/site-builder/src/lib/prepare-site-build.ts:95`), so the curator sees an entry before choosing it. A `withdrawn` entry renders in neither.
5. **Display fields and provenance in frontmatter; check state in runtime state.** Frontmatter holds what a reader or curator needs and the provenance the entry cannot reconstruct (see the entity below). The record's CID, the last check and failure counts live in the package's runtime state, following frontmatter hygiene.
6. **The body is never stored.** Capture and recheck read a record's display fields and drop its `body`. An entry's own body stays empty: a curator's note on a public, published entry would be readable through public chat (`system_get` returns the stored markdown, and visibility covers a whole entity), and a public note would set the Foundation's words beside the author's.
7. **The ATProto read path is shared.** Resolving a repo, the safe-endpoint check and the public client move out of `plugins/atproto` into a shared package, so the atproto plugin and `entities/reference` use one path and the entity package imports no plugin. `listRecords` is added there. Fetching is injected: tests pass their own fetch, built like `createSafePublicFetch` (`shared/utils/src/safe-public-fetch.ts`); nothing mocks `globalThis.fetch` or our own utils.
8. **A withdrawn entity leaves production too.** A recheck run that marks any entry `withdrawn` requests one site rebuild through `siteBuildRequestContract` (`shared/contracts/src/site-build.ts`).
9. **Only entities on a member's own Brain.** A pointer is to a record in a member brain's repo, not to Substack, Medium or a journal. Its link goes to the entity's page on the member's own brain (`pageUrl`, else `canonicalUrl`), also for an essay first published elsewhere, and the curator can give either address.
10. **Admins select.** Creating and publishing a pointer takes the admin level, the platform default for every entity action (`PLATFORM_ENTITY_ACTION_DEFAULTS`, `shell/app/src/resolver/permissions.ts:11`), so the package declares no policy. A brain can later let trusted users propose drafts with `entityActions.reference.create: trusted` in `brain.yaml`, while `publish` stays admin.
11. **The author's own name is shown.** The byline is the anchor `name` on the author's brain card, the name the author gave their own brain. The curator cannot override it; the recheck keeps it current; an author who wants another name changes their profile.
12. **Single entities, newest first.** Every type that publishes a record can be featured when its record names a page: post, deck, project, series, link, note, topic and social post. The curator does not order entries by hand; that can come later as an optional field that falls back to the date, with no migration.
13. **Authors are not notified.** Featuring sends nothing to the author. A notice would travel over A2A, which reaches only approved agents, and approving a member lists them in the featuring brain's public agent directory. An author leaves the selection by unpublishing the entity, which deletes its record and so withdraws the pointer, by deleting or deactivating their ATProto account, or by asking the featuring brain's admins to unpublish the entry.

### Shared copies (slices 6 to 9)

14. **A shared entity is stored as a read-only copy in its own type.** A pulled note is a `note`, validated against the local schema and found by search and the agent like any other. To build on it, the receiving team writes its own entity that links to it.
15. **Copies live in the database only.** A copy is a database row, with its search index and embeddings, and is never written to the receiving brain's markdown or content repo: directory sync skips every entity carrying `sourceBrain`, a per-entity rule it does not have today (it filters by type only, `plugins/directory-sync/src/types/config.ts:85`). Nobody can edit a copy through a file or Obsidian, the owner's text never enters the receiving brain's git history, and the repo cannot carry it anywhere the owner did not agree to. A copy is not in the content repo's backups; a lost database is restored by pulling again.
16. **Every edit to a copy is refused, except the owner's sync.** A persist validator (`registerPersistValidator`, `shell/entity-service/src/types.ts:1398`) refuses any create or update of an entity carrying `sourceBrain` that does not come from the sync, so tools, Studio and the agent can read a copy but not change it. Read-only holds against the receiving brain's users, its agent and accidents, not against its operator, who controls the database; decision 22 makes such an edit provable.
17. **Provenance is metadata, registered per type.** A type that accepts copies registers `sourceBrain`, `sourceEntityType`, `sourceEntityId` and `sourceState` with `extendFrontmatterSchema` (`shell/entity-service/src/entityRegistry.ts:404`), which makes them queryable metadata. No system envelope is added; widening `ENTITY_SYSTEM_FIELDS` (`shell/entity-service/src/frontmatter.ts:42`) would add entity row columns. Check state lives in runtime state, and no copy uses `sourceRef`, which `link` owns.
18. **The pull is a declared A2A extension, not a new method.** `https://rizom.ai/ext/entity-sharing/v1` is declared in `capabilities.extensions` beside the anchor extension and activated per request by the `X-A2A-Extensions` header, with the request carried as a `DataPart` in an ordinary `message/send`. The handler matches the header and the `DataPart` before dispatch reaches the agent, so no model is in the path. New JSON-RPC methods are rejected because the SDK's `A2ARequest` union is closed; MCP client enrolment and a free-text skill are rejected for making a brain a user of another brain and for putting a model in a byte-transfer path. This handler is new: nothing reads the extension header today.
19. **Peers never reach `restricted`, and every miss is a `404`.** A peer's best grant is `trusted`, which maps to the `shared` scope. The peer read path applies the published-only gate public readers already get, and serves `shared` entities only. A public entity is never copied; it is pointed to. Not found, out of scope, public and wrong type are one byte-identical response.
20. **Withdrawal erases the text and keeps a stub.** When the owner stops sharing, the copy's `sourceState` becomes `withdrawn` and its body is erased. A stub stays: the title, the source, when it was received and withdrawn, and the signed content hash (decision 22), so the receiving team can see that it existed and why it is gone, and can still prove what it had, without keeping the owner's words. A stub is excluded from search and every surface but its own record. An unreachable peer is never a withdrawal.
21. **The first pull is confirmed; refreshes are not.** Taking a peer's entity writes into search and possibly a site, so the first acquisition waits in an entity inbox, as `agent-sightings` does (`entities/agent-discovery/src/agent-entity.ts:46`). Later refreshes apply on their own.
22. **The owner signs the content hash.** With every copy it serves, the owner brain signs the entity's `contentHash` (`shell/entity-service/src/types.ts:311`) together with its type, id and the time, using the brain key it already publishes for A2A request signatures. The receiving brain stores the signature and the key's id with the copy, so anyone holding the owner's public key can verify that the copy is byte for byte what the owner sent. This makes tampering provable, including a direct edit of the receiving brain's database; it does not prevent it. Because keys rotate, the owner keeps publishing retired keys, and the receiving brain records that it verified the signature on receipt. A public pointer needs nothing new: an ATProto record is addressed by its CID in a signed repo.
23. **Peer approval is runtime state.** Whether this brain may contact a peer is decided today by the agent entity's `status` (`interfaces/a2a/src/client.ts:761`), a line in git-synced markdown that anyone who can write the content repo can change. Before any copy is exchanged, approval moves into runtime state like the inbound peer grant, changeable only by an admin through the brain's tools; the agent file shows the state but no longer decides it. Exchanging copies raises approval from "may talk to" to "may send material into this brain", and the forged-`sourceBrain` guard (slice 8) only holds if approval cannot be written as content.

## The pointer

`reference`, one YAML file per referenced entity. The name says what it is, not one use of it: a reference can be shown on a site (published) or only kept by a team.

| Field              | Source                                   | Notes                                   |
| ------------------ | ---------------------------------------- | --------------------------------------- |
| `sourceUri`        | the record's `at://` URI                 | the key (decision 3)                    |
| `sourceEntityType` | record `sourceEntityType`                | any type that publishes a record        |
| `sourceEntityId`   | record `sourceEntityId`                  |                                         |
| `sourceBrain`      | record `brainDid`                        | optional; yeehaa.io sets none today     |
| `url`              | record `pageUrl`, else `canonicalUrl`    | a record without one cannot be featured |
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
3. It lists the repo's records a few at a time, finds the one whose `pageUrl` or `canonicalUrl` matches the address, reads the brain card for the byline, and writes a `draft`. When no record matches, it fails with a message that says the article has no record yet.
4. The curator publishes the draft. The site shows it on its next build.

### Recheck

Every day, the recheck reads each entry's record with `getRecord` and each author's brain card once:

- the same CID: nothing changes;
- a new CID: changed fields and the byline are updated in place;
- record not found, or the account reported deleted, deactivated, taken down or suspended: `withdrawn`, and one rebuild request for the run;
- a record that returns: `active` again;
- a network or server failure: nothing changes, and the failure is counted in runtime state.

### Pull a shared entity (slices 7 to 9)

```
operator or refresh asks for <peer, entityType, id>
  → resolve the peer in the agent directory
      ✗ not approved / archived / unknown → fail closed, no network contact
  → signed message/send, X-A2A-Extensions: https://rizom.ai/ext/entity-sharing/v1
    DataPart { op: "get", entityType, id }
  → peer verifies the RFC 9421 signature (interfaces/a2a/src/a2a-interface.ts:156-195)
      ✗ invalid                         → 401
  → peer scopes the read to the caller's grant, published only, shared only
      ✗ any miss                        → 404
  → peer returns the entity's markdown and content hash
  → consumer validates against its local schema
      ✗ invalid                         → rejected, shown to the operator, nothing written
  → first pull → inbox, confirmation required; refresh → applied
  → stored in its own type with provenance in the database only (decisions 15 to 17), with the owner's signature (decision 22)
```

A refresh with the same hash writes nothing; a new hash replaces the body; a `404` (including a downgraded grant) becomes a `withdrawn` stub (decision 20) and notifies the operator; an unreachable peer changes nothing.

## Slices

Each slice is end to end and has its tests written before the code. Tests use `createPluginHarness()`, inject HTTP through constructor dependencies, and use no type casts.

1. **Records for everything published, kept complete on every start.** _Built._ The shared ATProto read path with `listRecords` (decision 7), and a reconcile step the atproto plugin runs once startup content has settled, never at ready: a database still importing holds no entities, and every record would look like an orphan. It lists its own records once per projected collection, compares them with its public, publishable entities by record key (`deriveAtprotoRecordKey(entity.id)`), writes the records that are missing or differ from what their entity builds today (a dry-run build, so a config change is caught), and deletes records whose entity is gone or no longer publishable. It signs in once and writes one record at a time. A start with nothing to do sends one small request per collection and writes nothing; cover images upload only for records written. Records name their brain and anchor as the card does, so no brain needs them configured. _Tests:_ missing records are written and nothing else; an outdated record is rewritten; an orphan is deleted; drafts and non-public entities get no record; a second start writes nothing; `listRecords` pages through a repo and rejects an unsafe endpoint.
2. **The pointer and capture.** _Built._ The schema, the markdown adapter and the capture job. A curator can create and publish entries; nothing renders yet. _Tests:_ an address with a matching post record becomes a draft with the fields above; the byline comes from the brain card; an address with no record fails with a clear message and creates nothing; the same record twice returns one entry; the stored file never contains the record's `body`.
3. **Recheck and withdrawal.** _Built._ The daily recurring check, runtime-state bookkeeping, `withdrawn` and back, and the rebuild request. _Tests:_ the recheck outcomes above, with exactly one rebuild request per run that withdraws.
4. **Site section.** _The section is built; the `rizom.foundation` swap waits for that site package._ A `references` section template and data source any site package can use: each entry shows its series, author and date as a kicker, the title and the summary, and links to `url` on the author's site; there are no local detail pages; newest first. Then `rizom.foundation` replaces its hand-authored rows with the section. _Tests:_ a production build renders only `published` and `active` entries, a preview build also renders drafts, a `withdrawn` entry renders in neither, and each links to its `url`.
5. **More kinds.** _Built._ Every type that publishes a record, read from its own collection, with a kicker each kind can fill: a post its series, the others what they are.
6. **Peer approval in runtime state.** Outbound approval moves out of the agent entity's git-synced `status` into runtime state, beside the inbound peer grants (decision 23). The agent file still shows the state; editing it changes nothing. _Tests:_ editing an agent file to `approved` does not let the A2A client contact that peer; approving through the admin tool does; an existing approved agent keeps its approval after the move.
7. **Pull one shared entity.** The declared extension and its handler ahead of agent dispatch, and a tool that pulls a named entity from a named approved peer and shows it; nothing stored. _Tests:_ an unapproved peer fails before network contact; a bad signature is `401`; `restricted` is `404` for a `trusted` caller; `shared` is `404` for a `public` caller and served to a `trusted` one; a public or unpublished entity is `404`; every miss is byte-identical; a request without the header reaches the agent as ordinary prose; an unrelated A2A client still completes `message/send`, `tasks/get` and `tasks/cancel`.
8. **Store and refresh copies.** Database-only copies with provenance registered per type, the directory-sync rule that skips them, the persist validator that refuses edits, the signature check, the inbox confirmation, refresh, withdrawal stubs and the republish guard. _Tests:_ a copy is never written to markdown or the content repo; an edit through a tool, Studio or the agent is refused while the sync's refresh is applied; a copy whose signature does not verify against the owner's key is rejected; a withdrawal erases the body and keeps the stub with its signed hash; a forged `sourceBrain` naming an unapproved peer never triggers a fetch; a copy is never projected to ATProto; content failing the local schema writes nothing; the refresh outcomes above.
9. **Discovery and change signals.** A scoped `list` operation, so a consumer sees what a peer offers without guessing ids, and, once the [atproto plan](./atproto-integration.md)'s known-only Jetstream admission ships, record events for approved repos that trigger a recheck or refresh early. The daily check stays as reconciliation, and the stream never creates an entity.

## Validation

- Package tests, `bun run typecheck` and `bun run lint` for each slice.
- Slices 1 to 4, app-managed: start a brain with `entities/reference`, create an entry for a real yeehaa.io essay after its first start on the new release, trigger a site rebuild on the running app through the app command surface, and inspect `dist/site-preview`. For withdrawal, point the recheck at a fixture repo without the record and confirm the rebuild removes the entry.

## Later, not in this plan

- Hand ordering, and a public curator's note (decisions 6 and 12).
- Telling authors they are featured (decision 13).
- Publishing the selection itself as ATProto records.

## Risks

- **Members without records cannot be featured.** A member whose brain has no ATProto account has nothing to point to; capture says so rather than falling back to scraping. The same holds for a type with no record: newsletter, doc, guide and book have a page on some sites and no record yet.
- **Recheck cost grows with the selection.** One `getRecord` per entry and one brain card per author per day stays small at the Foundation's scale; past that, `listRecords` per repo replaces per-entry reads.
