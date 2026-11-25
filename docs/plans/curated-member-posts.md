# Plan: Curated member posts

Last updated: 2026-11-24

## Status

**Proposed. Nothing is built.** This plan stands on its own: it adds a capability any brain can use, and it can be built, tested and released without the site work that will use it first.

The first user is the Rizom Foundation's site, `rizom.foundation`, which will show a curated selection of articles by members of the Rizom network, the founder's own essays included. The [three-site plan](./rizom-three-sites.md) shows that selection as hand-authored rows until this plan ships, then switches to it.

The owner's questions are answered (decisions 8 to 13), so Slice 1 can start.

## Goal

A brain can feature a curated selection of articles that other brains publish, without copying them.

- The curator chooses which articles appear.
- The author keeps the article: it stays published on their own brain, and the featuring brain links to it there.
- The featuring brain stores a pointer with metadata read from the author's own feed, keeps it current, and drops it when the author withdraws the article.

## Non-goals

- **No copies.** Brains stopped copying other brains' published pieces on 2026-10-10 (commit `2490d2aa5c`, which removed the `network-piece` type and its paged `listRecords` reader; `entities/agent-discovery/src/plugin.ts` still purges old pieces on setup). A featured article never stores the article's body.
- **No automatic feed.** Nothing appears without a curator selecting it.
- **No inbound ATProto ingestion.** That stays deferred in [atproto-integration.md](./atproto-integration.md); ATProto is a later source here (Slice 4), not a dependency.
- **No cross-brain mirroring.** [cross-brain-entity-sharing.md](./cross-brain-entity-sharing.md) copies whole entities between approved peers and forbids republishing them; a pointer needs neither.

## What exists today

- **Every brain site writes an RSS 2.0 `feed.xml`** of its published posts (`entities/blog/src/feed.ts`). Each item carries `title`, `link`/`guid`, `description` (the post's excerpt), `content:encoded`, `author`, `pubDate` and `category` (the series). yeehaa.io's feed holds all 28 essays and answers `ETag`/`304`, so a daily recheck is one small request per source.
- **Article addresses vary by site.** yeehaa.io's feed links are `/essays/<slug>`, not `/posts/<slug>`; the feed link is the address to store.
- **ATProto lags the feed.** yeehaa.io's ATProto repo holds 3 `ai.rizom.brain.post` records against 28 feed items, none with `brainDid` or `anchorDid`. A record's key is not the URL slug (`scale-without-a-centre` against `scale-without-a-center`), so a record can only be matched to an article through its `canonicalUrl`, which equals the feed link.
- **Withdrawal is visible.** A withdrawn essay drops out of the feed and its page returns `404`.
- **No inbound RSS parser exists** anywhere in the repo.
- **`link` is not a fit.** Its summary is written by an LLM from a Jina Reader fetch (`entities/link/src/jobs/capture.ts`), it has no author, date or series fields, and its ATProto projection has no `isPublishable` hook, so drafts would be published as records.

## Decisions

1. **A new entity package, `entities/featured-post`.** One package holds the entity, its capture job, its daily recheck and its site template, as `entities/agent-discovery` holds the agent entity with its own `defineServicePlugin`, templates, data source and `runtime.recurringCheck`. Entity packages expose no CRUD tools (`entities/AGENTS.md`), so a curator creates an entry through the shared create path, which runs a capture job, as `link` does (`jobs: { capture, generation }` in `entities/link/src/index.ts`).
2. **The author's feed is the first source.** It covers every published article today and is cheap to recheck. ATProto becomes a second source once members publish records (Slice 4).
3. **The canonical URL is the key.** An entry is identified by the article's address as the feed gives it (`link`), which is also what an ATProto record's `canonicalUrl` holds. Creating the same URL twice returns the existing entry.
4. **Selection is the status.** A captured entry is a `draft`; publishing it is the editorial choice; unpublishing removes it from the site. Production renders only published entries whose source is still active; the preview also shows drafts, as site builds do for every type (`publishedOnly` is set for production builds only, `plugins/site-builder/src/lib/prepare-site-build.ts`), so the curator sees an entry before choosing it. A `gone` entry renders in neither.
5. **Fetching is injected.** The capture job and the recheck take a fetch built on `createSafePublicFetch` (`shared/utils/src/safe-public-fetch.ts`), passed in the way `createAgentDiscoveryPackages(network)` passes `network.fetch`. Tests inject their own; nothing mocks `globalThis.fetch` or our own utils.
6. **Recheck bookkeeping lives in runtime state, not in the entity.** `ETag`, last check and failure counts stay out of the markdown, as agent card refresh keeps its own; the entity holds only what a reader or curator needs.
7. **A withdrawn article leaves production too.** When a recheck marks an entry `gone`, it requests a site rebuild through `siteBuildRequestContract` (`shared/contracts/src/site-build.ts`), so the article disappears from the published site, not only from the preview.
8. **Only articles on a member's own Brain.** The first version features articles published by a member's brain, not pieces on Substack, Medium or in journals. Capture and recheck rely on the feed a brain writes: the excerpt in `description`, the series in `category`, and withdrawal as a dropped item with a `404` page. Other feeds differ (Medium often puts the whole article in `description`), and unpublishing on the author's own brain stays the one way to withdraw. Other sources can be added later without undoing anything.
9. **Admins select.** Creating and publishing a featured post takes the admin level, the platform default for every entity action (`PLATFORM_ENTITY_ACTION_DEFAULTS` in `shell/app/src/resolver/permissions.ts`), so the package declares no policy of its own. A brain can later let trusted users propose drafts without code, with `entityActions.featured-post.create: trusted` in `brain.yaml`, while `publish` stays admin.
10. **The feed's byline is the name shown.** A post's author defaults to its brain's profile name (`entities/blog/src/generation.ts`), and a member's agent entity mirrors that same name, so the byline is the name the author chose. The curator cannot override it; the recheck keeps it current when the author renames, and an author who wants another name changes their own profile.
11. **Single articles, newest first.** An entry is one article; a whole series is not an entry, and the curator does not order entries by hand. The feed names a series only in `category`, with no address, description or withdrawal of its own, so series entries wait for a second source such as the series' ATProto records (Slice 4). Hand ordering can come later as an optional field that falls back to `publishedAt`, with no migration.
12. **No curator's note.** An entry's body stays empty. Visibility covers a whole entity and no read path strips part of a body, so a note on a public, published entry is readable through public chat (`system_get` returns the stored markdown), and a public note would set the Foundation's words beside the author's. Rendering a public note later needs no migration.
13. **Authors are not notified.** Featuring an article sends nothing to its author. A notice would travel over A2A, which reaches only approved agents (`interfaces/a2a/src/client.ts`), and approving a member lists them in the featuring brain's public agent directory; it would also arrive as plain chat, not a structured notice. An author leaves the selection by unpublishing the article, which the recheck turns into `gone`, or by asking the featuring brain's admins to unpublish the entry.

## The entity

`featured-post`, one markdown file per article in the featuring brain.

| Field         | Source                                | Notes                                      |
| ------------- | ------------------------------------- | ------------------------------------------ |
| `url`         | feed item `link`                      | the key; the article on its author's site  |
| `title`       | feed item `title`                     |                                            |
| `excerpt`     | feed item `description`               | the author's own words, never a summary    |
| `author`      | feed item `author`                    | shown as the source gives it (decision 10) |
| `authorSite`  | origin of `url`                       | for example `yeehaa.io`                    |
| `authorDid`   | the author's agent entity, when known | optional                                   |
| `publishedAt` | feed item `pubDate`                   |                                            |
| `series`      | feed item `category`                  | optional                                   |
| `source`      | `rss`                                 | `atproto` in Slice 4                       |
| `sourceFeed`  | the feed URL                          |                                            |
| `sourceRef`   | feed item `guid`                      | an `at://` URI and CID in Slice 4          |
| `status`      | `draft` or `published`                | the curator's choice                       |
| `sourceState` | `active` or `gone`                    | set by the recheck                         |

The body is empty (decision 12). It never holds the article.

## The editorial flow

1. A curator gives the featuring brain an article URL, in chat or Studio, through the shared create path.
2. The capture job finds the author's feed: the site's `/feed.xml`, or the feed its pages advertise. It reads the item whose `link` matches the URL and writes a `draft` with the fields above. When the feed has no such item, the job fails with a message that says so, and nothing is created.
3. The curator publishes the draft. The site shows it on its next build.
4. Every day the recheck reads each source feed once, with `If-None-Match`. An item that has left the feed and whose page returns `404` becomes `gone` and triggers a rebuild. An item that returns becomes `active` again. Changed titles, excerpts or bylines are updated in place.

## Site rendering

A `featured-posts` section template and data source in the package, usable by any site package:

- each entry shows its series, author and date as a kicker, the title, and the excerpt, and links to `url` on the author's site;
- there are no local detail pages, since that would be a copy;
- the order is newest `publishedAt` first (decision 11).

`rizom.foundation`'s members' writing chapter uses the section in place of its hand-authored rows.

## Tests first

Written before the code, in `entities/featured-post/test/`:

- **Feed parsing:** an RSS 2.0 fixture in yeehaa.io's shape (`/essays/<slug>` links, author `Yeehaa`, series as `category`) yields the entity fields; a malformed item is skipped, not fatal.
- **Capture:** with an injected fetch, a URL in the feed becomes a draft with the right fields; a URL not in the feed fails with a clear message and creates nothing; the same URL twice returns one entry; the body never contains `content:encoded`.
- **Recheck:** `304` changes nothing; an item gone from the feed with a `404` page becomes `gone` and requests one rebuild; an item that returns becomes `active`; a changed title, excerpt or byline is updated in place; a network failure changes nothing and is counted in runtime state.
- **Rendering:** a production build renders only `published` and `active` entries, a preview build also renders `draft` ones, a `gone` entry renders in neither, and each links to its `url`.

Tests use `createPluginHarness()`, with HTTP injected through the package's constructor dependencies and no type casts.

## Slices

1. **Entity and capture.** The schema, the markdown adapter, the feed parser and the capture job, with their tests. A curator can create and publish entries; nothing renders yet.
2. **Recheck and withdrawal.** The daily recurring check, runtime-state bookkeeping, `gone` and back, and the rebuild request.
3. **Site section.** The template and data source, then `rizom.foundation` switches from hand-authored rows to the section.
4. **ATProto as a second source** (when members publish records). Match records to entries through `canonicalUrl`, read through the existing public PDS client (it has `getRecord`; `listRecords` would be new), and decide then whether the selection itself is published as records.

## Validation

- Package tests and `bun run typecheck` for the new package; `bun run lint`.
- An app-managed check: start a brain with the package, create an entry for a real yeehaa.io essay, trigger a site rebuild on the running app through the app command surface, and inspect `dist/site-preview`.
- Withdrawal: point the recheck at a fixture feed without the item and confirm the rebuild removes it from the preview.

## Later, not in the first version

- Articles from other sources than a member's own Brain (decision 8).
- Series as entries, and hand ordering (decision 11).
- A public curator's note (decision 12).
- Telling authors they are featured (decision 13).

## Risks

- **Feeds differ between brain versions.** The parser accepts what `entities/blog/src/feed.ts` writes and skips anything it cannot read, rather than failing the recheck.
- **Rechecks cost requests.** One conditional request per source feed per day keeps this small; sources are grouped by feed, not checked per article.
