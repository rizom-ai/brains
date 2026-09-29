# Plan: rizom.ai as one story

## Status

All four slices are built on `work/organization-atlas`; each page's rendering is checked on the running rizom.ai test app, and the drawings' motion between stages by scrolling each story page in headless Chromium, since the automation browser tab runs no transitions: the one bar, the footer, the story page shape, the `organism` drawing engine, the reading thread, Foundation, the homepage as a story that opens on the live network with the Ask host and closes on the two doors (with `/network` and `brain-network.tsx` gone), and Brain and Work as story pages beside their drawings, with the bar's audit button landing on the audit chapter, and Writing as an archive on one thread over the real essays and presentations. The Brain drawing's third stage draws you, your team and the network, which is what that chapter's content says, rather than the mockup's invented "See it run" copy. The Ask host is verified disabled by test only: guest Ask was not switched on locally, since activation is the owner's call under the public Ask plan. The content changes are a separate content-repo PR: the homepage title, lede and description; the Work audit copy (the workshop section's cap and headline, and a `Ctas` door to book it); the Brain quick-start door and collective link that still say knowledge session and `/network`. The five mockups in [`docs/design/rizom-ai-story/`](../design/rizom-ai-story/) are the visual contract: [home](../design/rizom-ai-story/home.html), [Brain](../design/rizom-ai-story/brain.html), [Work](../design/rizom-ai-story/work.html), [Foundation](../design/rizom-ai-story/foundation.html) and [Writing](../design/rizom-ai-story/writing.html). They carry the live site's copy and shell, so what they add is the design.

## Goal

rizom.ai becomes one story told in one language. The homepage opens on Rizom's live network under the title "Distributed Living Memory", with the guest Ask box, and scrolls through the science, the shift, the organism and where it goes, to two ways in. Brain, Work and Foundation tell their own stories the same way: chapters beside one drawing that grows with them. Writing is an archive on one thread. One navigation bar replaces the room bar and the masthead; the Network page and the About page are gone, because the homepage is both. A reading thread down the left edge, the live rail's mycelium root, fills with the room's colour as a visitor reads.

## Baseline

- **The site.** `@rizom/site-rizom-ai` (`sites/rizom-ai`) is built with `createRizomSite` (`src/rizom/create-site.ts`): a layout, routes, section groups and an `entityDisplay`. `AiLayout` (`src/layout.tsx`) draws the room bar, the masthead, the mycelium rail, the side-nav dots and the footer, and sets `data-room` per face; `boot.js` (`src/rizom/runtime/boot/`) wires scroll reveals, the dots and the theme toggle. Routes (`src/routes.ts`): `/` (the proximity-map hero and eight `living-memory:*` sections plus `topics:knowledge-map`), `/brain`, `/ask`, `/writing` (posts and decks), `/network` (`agent-discovery:agent-list`), `/work` and `/foundation`.
- **Copy.** Every section is `defineSection(schema, Component)` in a `sectionGroup`; its copy is markdown in the content repo under `site-content/<route>/<section>.md` (`living-memory/`, `brain/`, `work/`, `foundation/`), synced by `directory-sync`. Section ids are content identity and must stay stable when the presentation changes.
- **The network.** `brain-network.tsx` embeds the console's `ProximityMap` from the pure `@brains/agent-discovery/proximity-map` subpath, with its own script at `/scripts/agent-proximity-map.js`. The live map places eight brains; none share a skill tag, so it has no constellations.
- **The organization site.** `@brains/site-organization` (`sites/organization`) draws the agent radar (`templates/agent-radar.tsx`, `agent-radar-styles.ts`, `lib/radar-echoes.ts`, `datasources/agent-radar.ts`) inside the atlas frame from `@brains/site-atlas`, which hosts the Ask box and the door. Its radar placement comes from `proximityPoint` on the pure subpath and `buildProximityMapData` on `./proximity-map-data`. See [organization-site.md](./organization-site.md).
- **Ask.** Guest Ask is a per-deployment owner decision ([public-ask.md](./public-ask.md)); its gates, the usage record and the Studio monitor, are on `main`. The Ask box contract is `@brains/contracts` `ask-box`; Web Chat's boot mounts the guest box into any host and serves `/ask/assets/guest.css`. rizom.ai's Ask copy is drafted in content PR rizom-content#2 (`ask-content/ask-content.md`: three questions and a note).
- **Theme.** `@rizom/theme-rizom-ai` sets Fraunces, IBM Plex Sans and Mono, the night and paper modes, brass with ruby for `[data-room="work"]` and moss for `[data-room="foundation"]`, and the mycelium tokens (`--color-myc-root`, `--color-myc-twig`).

## Decisions

1. **One page shape.** A `StoryPage` layout in `@rizom/site-rizom-ai`: chapters on the left, one sticky drawing on the right that changes stage as the chapter under the reading line (45% down the viewport) changes, tracked by scroll position. The drawing opens full-bleed behind the first chapter and draws in to the right once the story starts; the chapter column carries a soft backing so the words read over it. On narrow screens the drawing pins to the top and the chapters scroll under it. Home, Brain, Work and Foundation use it. The section groups and their content ids stay; only their components change, so no content moves in the content repo.
2. **One drawing language.** A `@rizom/site-rizom-ai` module, `organism`, generates a continuous drawing from a spec: nodes with a position, size and opacity per stage, threads with per-stage visibility and pulses, and labels per stage. Positions become per-stage CSS, so the browser eases every node and thread between arrangements. Node kinds: node, lantern (a brain), file, hollow (AI with no place yet), lit. Labels are page text placed over the drawing, not SVG text, so they read at page size in both themes. Each page's story is one spec: the homepage's network to organism to economy, Brain's you to capture, ask, run, connect and your data, Work's team to problem, audit, types, map and question, Foundation's lattice to research, pattern, series and funding. The mockups' `rizom-organism.mjs` and the three organism specs are the reference.
3. **The homepage's network is live.** The opening stage places the brains from `buildProximityMapData` through `proximityPoint`, as the organization radar does, with the brain's lantern at the centre, distance rings, a pulse every seven seconds that lights each brain as it reaches it, an echo ring and a spark back to the centre, faint constellation threads between brains within 0.35, and each brain named beside its mark, on the other side when a neighbour is in the way or above when there is no room. The later stages draw the organism with the network faded. The `/network` route and `brain-network.tsx` are removed; `/agents/<slug>` pages stay, linked from the marks.
4. **Ask on the homepage.** The first chapter docks the Ask box host from the atlas frame contract, with the drafted questions as topics that fill the field, and the site's `/ask` page stays as the full chat the box links to. Turning guest Ask on for rizom.ai is the owner's separate decision under public-ask.md; the page renders the box disabled until Web Chat's boot enables it, as the organization homepage does.
5. **One bar.** `AiLayout` loses the room bar, the masthead and the side-nav dots for one sticky bar: the wordmark, Brain, Work, Foundation and Writing, the theme switch, and "Book an audit" to `/work#audit`. The current page carries a dot in its room's colour. Below 52rem the links collapse into the existing mobile menu.
6. **The reading thread.** The mycelium rail becomes the reading thread: the live root shape, its dashed seep kept but finer, a solid line in the room's colour filling it as the visitor reads, a spark at the tip, a node per chapter on the root (hollow ahead, a lantern for the current one, solid behind), two fixed twigs toward the page edge, and the chapter's name on hover, jumping there on click. Hidden below 64rem. It replaces the side-nav dots, which did the same job for the old homepage.
7. **What each page keeps.** Brain, Work and Foundation keep their copy, chapter by chapter, as the mockups show; the session is called the Knowledge Audit throughout, and Work's steps and "Two ways in" say audit. The homepage's story is the old homepage's science, shift, growth (as "One organism", its three parts linking to `/brain`, `/work` and the top of the page) and arc, then a new last chapter, "Two ways in", from the old `doors` section. The old `problem`, `system` and `proof` sections are dropped: the problem is `/work`'s opening argument, the system is `/brain`'s, and the map and Ask on the homepage are the proof. `/about` is not needed.
8. **Writing is an archive.** `/writing` keeps its two lists but renders them on one thread: the heading in view on the left with filters (everything, essays, presentations), the pieces on the right newest first, essays as lanterns with their excerpt and presentations as plain nodes. No drawing.
9. **Copy.** The homepage title is "Distributed Living Memory"; the lede "For hybrid human–AI teams: memory kept in brains each team owns, connected from one team to an economy."; the site description "Distributed living memory for hybrid human–AI teams: brains each team owns, connected from one team to an economy." These are content changes in the content repo, alongside the Ask copy in rizom-content#2. The footer loses its Network link and names the Knowledge Audit.

## Slices

Each slice ships on its own; every slice is verified on the running rizom.ai test app with an app-managed preview rebuild, at 1440×900 and 390 wide, in both themes, with reduced motion.

### 1. The page shape and the bar

Goal: one page rendered the new way, with the site's new chrome.

- Tests first: a render test pins `StoryPage` for a fixed chapters-and-stages fixture; layout tests pin the bar (links, the current page's dot, the audit link) and the reading thread's markup; a script test checks the reading line picks the right chapter for given chapter tops.
- Build: `StoryPage`, `organism`, the bar and the reading thread in `@rizom/site-rizom-ai`; `AiLayout` drops the room bar, masthead, side-nav dots and mycelium rail; `boot.js` drops the dots tracker and gains the thread. Foundation moves to `StoryPage` with its organism spec, because it has the fewest sections and no data.
- Verify: `/foundation` reads as the mockup, the thread fills and its nodes light, the bar works on every page, and the other pages still render with the old sections under the new bar.

### 2. The homepage

Goal: the story homepage with the live network and the Ask box, and `/network` gone.

- Tests first: the homepage's organism spec places the seed's agents by `proximityPoint` and names them clear of neighbours; the Ask host renders disabled with the drafted topics; the route table has no `/network`.
- Build: the homepage's stages as `living-memory` sections (`hero` becomes the network opening with the Ask host, `growth` links its parts, `doors` becomes the last chapter); the `problem`, `system` and `proof` sections leave the route but their components stay until the content repo drops their files; remove `/network` and `brain-network.tsx`; content PR for the title, lede, description, footer and the `doors` copy.
- Verify: the live network on the running app matches the console's placement; the Ask box mounts when guest Ask is on locally (`guest: local-test`), with no paid messages.

### 3. Brain and Work

Goal: both rooms on the page shape with their organisms, and Work renamed to the audit.

- Tests first: each page's organism spec renders its stages; the `brain` and `work` section groups keep their ids.
- Build: Brain's and Work's chapters as `StoryPage` sections with their organism specs; the audit copy in the content repo; Work's `#audit` anchor for the bar's button.
- Verify: both pages against the mockups; the audit button lands on the audit chapter.

### 4. Writing

Goal: the archive on one thread.

- Tests first: the thread renders essays as lanterns and decks as nodes, newest first, with the filters.
- Build: a `WritingArchive` template over the existing `blog:post-list` and `decks:deck-list` data.
- Verify: the page against the mockup with the real posts and decks.

## Not in this plan

- Turning guest Ask on for rizom.ai; that is the owner's decision under [public-ask.md](./public-ask.md).
- The organization site's homepage; it keeps its radar frame for other brains ([organization-site.md](./organization-site.md)). rizom.ai shares its placement helpers and the Ask host, not its pages.
- New copy beyond the title, lede, description, footer and audit naming; the mockups carry the live copy.

## Related plans

- [organization-site.md](./organization-site.md): the radar and the atlas frame this homepage draws on.
- [public-ask.md](./public-ask.md): the Ask box and guest admission.
