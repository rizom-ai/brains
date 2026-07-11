# Plan: Rizom consolidation — one brain, one site

## Status

In progress — direction decided 2026-07-07; Phases 0–3 done and Phase 4's route
work complete (2026-07-10, `work/rizom-consolidated-site`): section formatters,
`/writing` (Essays + Talks) and `/network` shipped, `/events` deferred to a
post-migration `event`-entity plan, footer unified across faces. Phase 2's
deployment-time config and Phase 3's push/runtime-DB copy roll into Phase 5.
Phase 5's first step — merging main into the branch (published `@rizom` scope,
`@rizom/site` SDK, TS7) — is done (2026-07-11, `8721c963e`); the rev-5 design now
lives in history at `ff0e49bbc` as the port reference. Next in Phase 5: re-home
`sites/rizom-ai` onto the published model, then the staging deploy to
`new.rizom.ai`. **Follow-up to
[`rizom-sites-on-hosted-rover.md`](./rizom-sites-on-hosted-rover.md)**: once the site
packaging and hosted-rover custom-domain machinery from that plan land, the three Rizom
web properties (`rizom.ai`, `rizom.work`, `rizom.foundation`) consolidate into **one site
at `rizom.ai`**, and the three deployed brains behind them (ranger, ranger, relay)
consolidate into **one Rizom brain**. The predecessor keeps its scope (npm-resolvable site
packages, per-domain TLS/DNS); this plan is the end-state it feeds into — from three
custom-domain sites down to one.

## Why

- Three deploys, three Cloudflare zones with their own certs/DNS, three content repos, and
  three site variants exist to serve what is one organisation's presence. The predecessor
  plan makes the three-of-everything shape _hostable_; this plan removes the reason for it —
  the per-domain machinery gets exercised for one domain instead of three, permanently.
- The repo's stated direction is a single brain, not a fleet. Site consolidation without
  brain consolidation would leave two brains whose only job is redundancy.
- Bundle-model alignment (`brain-model-unification.md`): the consolidated brain is exactly
  the composition that plan already anticipates — `core + site + team` plus opt-ins — so
  consolidation reduces the number of live compositions the unification must migrate.

## Design mockups (approved direction, rev 5 — 2026-07-07)

Interactive mockups live at [`docs/rizom-site-mockups.html`](../rizom-site-mockups.html)
(open in a browser; light and dark are both first-class). Three screens — Home, `/work`,
`/foundation` — built from the live sites' verbatim copy and the Rizom Brand Book
(deep indigo, brass/ruby/moss, Fraunces, mycelial motifs). Decisions they settle for
Phase 0/1:

- **Platform-first home, no synthesizing lobby**: the home is today's rizom.ai tightened
  (hero → growth diagram → problem → your-data → quickstart → mission band); the
  "one practice, three faces" synthesis is a slim band before the footer, using the live
  sites' own role names (the tools / the service / the source). /work is not the homepage.
- **Two-tier navigation**: a quiet org-level faces strip (`rizom · Platform / Work /
Foundation`) above a per-face contextual nav; each room keeps its live nav and its old
  domain as the nameplate (`rizom.work`, `rizom.foundation`).
- **IA / sitemap (settled in Phase 0)**: one `/writing` index for everything published
  (foundation essays are a series — matches the entity model); `/events` for gatherings
  (deferred — needs an `event` entity, its own plan after migration); `/network` from
  the agent directory; `/docs` ↗ docs.rizom.ai; `/chat` public. Old domains 301
  domain-level into their rooms.
- **The growth diagram is the product story**: You → Team → Network drawn as one organism
  (Rover/Relay/Ranger as separate products is retired — the one sanctioned content rework).
- **Living proof**: a colophon line (latest essay, talk-to-this-brain, agent card, lexicon
  registry) makes the dogfooding part of the pitch.

## Decisions

1. **One site, at `rizom.ai`.** `sites/rizom` (the shared core) stops being a
   variant-substrate and becomes _the_ Rizom site. The work and foundation properties fold
   in as routes/sections of that site (working assumption: `/work` and `/foundation`
   landing routes composed from their current section sets — hero/workshop/personas/proof
   and research/events/support respectively). The three `themeProfile` variants
   (product/editorial/studio) collapse to one profile; per-route accents replace
   per-site themes.
2. **`rizom.work` and `rizom.foundation` become edge redirects — one rule per zone.**
   A single domain-level Cloudflare 301 per zone (`rizom.work/*` → `rizom.ai/work`,
   `rizom.foundation/*` → `rizom.ai/foundation`). No per-path map: the old sites were
   barely used and every list page on them is empty (verified 2026-07-09), so there are
   no deep links worth preserving individually. No origin, no certs, no hosted-rover
   involvement. The zones stay under our account for the domains' lifetime.
3. **One brain, rover-based.** With relay and ranger retiring under
   `brain-model-unification`, the consolidated brain composes rover's `default` preset
   (which already carries blog, series, decks, site-builder, analytics — the
   `core + site + team` shape) with
   `add: [atproto-registry, products, rizom-ecosystem, newsletter]`: the registry serves
   the canonical `ai.rizom.brain.*` lexicons (must not lapse), products/ecosystem carry
   ranger-ai's product entities, newsletter backs the `/foundation` follow band.
   `content-pipeline` and `social-media` stay out — no live cadence exists to carry
   (settled in Phase 0; publishing itself comes with the rover base).
4. **Content repos merge into a NEW repo, `rizom-ai/rizom-content`** (decided
   2026-07-09; supersedes "merge into `rizom-ai-content`"). All three old content repos
   are merged in with full history (`-s ours` merges + selective checkout), collisions
   resolved per the IA note, and `site-content/*` retired immediately — the new repo has
   no live consumer, so nothing is deferred to cutover. The live brain keeps syncing the
   untouched `rizom-ai-content` until cutover; the consolidated brain starts on
   `rizom-content` from day one, and the three old repos are archived at cutover.
5. **Runtime state migrates with the foundation brain.** The foundation relay's
   conversation/team memory is the collective POC's working state; its runtime DBs
   (conversations, entities, jobs) are copied to the consolidated deployment at cutover
   rather than starting fresh. The other two brains' runtime state is disposable
   (site-serving only).
6. **Deploy shape: the hosted-rover custom-domain slot the predecessor builds.** The
   consolidated brain deploys as a single custom-domain brain on hosted Rover, using the
   per-domain cert/DNS machinery (Origin CA per zone, per-brain PEM pair, NS-delegation
   onboarding) from the predecessor plan — exercised for `rizom.ai` only. The two retired
   domains never need that machinery; they are edge redirects (decision 2).

## Sequencing note for the in-flight worktree

`work/sites-controlled-deploy` is executing the predecessor's Phase 1 with
`@brains/site-rizom-work` as the pilot package. With this follow-up decided, that package
has a bounded lifetime: it proves the packaging/resolution path, then folds into the
consolidated site here. Its durable products — the site-package CSS contract
(`themeOverride`) and the publishability groundwork for the site dependency chain — carry
over unchanged. Worth weighing inside the predecessor's scope: whether the pilot package
should be the consolidated `rizom.ai` site rather than `rizom.work`, so the throwaway is
avoided; that call belongs to that plan's lane.

## Phases (thin vertical, tests first)

### Phase 0 — Information architecture merge (content decision, no infra)

- **Done (2026-07-09).** Output: `docs/site-consolidation-ia.md` in the `rizom-ai`
  content repo — merged sitemap (`/`, `/work`, `/foundation`, `/writing`, `/events`,
  `/network`, `/docs` ↗, `/chat`), section survival (rev-5 package sections supersede
  all three repos' `site-content/*`, which retire unimported), the publishing decision,
  the domain-level redirect rules (per-path map dropped — see decision 2), and the
  content-merge collision policy (rizom-ai ids win; foundation-unique content imports
  as-is) that Phase 3 executes.

### Phase 1 — One site in the monorepo

- **Walking skeleton landed** (`work/rizom-consolidated-site`): `sites/rizom-ai`
  (`@brains/site-rizom-ai`) composes `createRizomSite` from the shared core with the
  rev-5 two-tier chrome (faces strip + per-face nav with old-domain nameplates), the
  `/`, `/work`, `/foundation` routes carrying verbatim live copy as static fallbacks,
  and package-registered templates (self-contained — no site-content plugin required).
  Test brain: `brains/rover/test-apps/rizom-ai` boots rover's default preset with
  `site.package: "@brains/site-rizom-ai"` — the same override rover-pilot will use.
  A new package (rather than absorbing into `sites/rizom`) because relay still consumes
  the shared core as a variant substrate; the variant machinery gets deleted when that
  consumer folds in, not before.
- **Also landed**: the full rev-5 section sets for all three rooms (21 colocated
  `defineSection` definitions with verbatim copy), the rev-5 design system as
  `@brains/theme-rizom-ai`, and per-room accents via `[data-room]` scoping — with
  route/section/layout/theme tests.
- The `/writing`, `/events`, and `/network` routes from the merged sitemap are
  deliberately **not** built here: they are list pages, and every entity that would
  populate them arrives in the Phase 3 content merge (the foundation essay becomes a
  series entry there; events and posts are empty today). They get their own phase
  after the merge (Phase 4) so they are built against real entities, not placeholders.

### Phase 2 — One brain

- **Composition landed (2026-07-09).** `test-apps/rizom-ai/brain.yaml` now carries
  `add: [web-chat, atproto-registry, products, rizom-ecosystem, newsletter]` on the
  `default` preset; rover registers `products` and `atproto-registry` as
  preset-less capabilities for the `add:` (and gained the previously undeclared
  `@brains/atproto-registry` dependency). `test/rizom-ai-composition.test.ts`
  asserts the resolved plugin set equals rover-default ∪ the adds (plus the
  newsletter composite's buttondown expansion — `add:` silently drops unregistered
  ids, so the equality test is the guard). Boot smoke green.
- Remaining: the production instance's config specifics (domain, real content repo,
  the collective's Discord wiring) — deployment-time, lands with Phase 5.

### Phase 3 — Content and state cutover

- **Content merge landed and published (2026-07-09)** as the new
  `rizom-ai/rizom-content` repo (decision 4): all three old repos' histories
  merged, collisions resolved per the IA note (work's skills/topics/swot/
  prompts won their collisions; foundation contributed decks + essays + brand
  docs; identity entities rewritten for the consolidated brain), and
  `site-content/*` retired in the same stroke. The live brain's
  `rizom-ai-content` is untouched.
- **Verified (2026-07-09)**: the test brain seeded from the real merged corpus
  imports everything with zero errors — 4 decks, 6 skills, 11 topics, swot,
  consolidated identity, products, root docs — and serves the site alongside.
  Verification surfaced and fixed three real issues: `seedContentPath` is dead
  config when git sync is on unless `git.bootstrapFromSeed: true` (now set on
  all rover test-apps), the seed bootstrap leaked the seed dir's own `.git`
  into the remote (fixed in directory-sync), and the foundation decks lacked
  the `status` frontmatter rover's deck schema requires (fixed in
  `rizom-content` with real publish dates).
- Remaining at cutover: copy foundation runtime DBs to the new deployment,
  verify conversation memory reads.

### Phase 4 — Published-index routes on the merged content

- **Landed**: schema-derived markdown formatters for every section (entity content
  now overrides the static fallbacks); `/writing` (Essays band via `blog:entities`
  - Talks band via `decks:entities`) and `/network` (agent directory via
    `agent-discovery:entities`), each with its org-index nav link top-right in the
    strip; the footer unified to a full four-column footer on every face.
- **`/events` deferred (decided 2026-07-10)**: gatherings deserve a real `event`
  entity (dates, locations, RSVP/status) rather than static section copy — that is
  its own plan, sequenced _after_ this site migration ships. Until it exists, the
  `Events` nav/footer links point at the `/foundation#events` teaser and no route
  promises a `/events` URL. See the follow-up note below.
- Editorial pass (user-driven): essays for `/writing`, refreshed room copy.
- Tests first: each route renders real entries from a merged-corpus fixture under the
  two-tier chrome; nav shows the new links on the platform face only.

### Phase 5 — Port onto the published `@rizom/site` model + staging deploy to `new.rizom.ai`

The branch was built on the pre-`@rizom` base; main has since split out a published
site SDK (`@rizom/site` contracts + `@rizom/site-rizom` components), renamed
`@brains`→`@rizom`, and moved to TS7. rover-pilot deploys **published** site packages
(minimal deps: `@rizom/site` + `@rizom/site-rizom` + preact), so our site must fit that
model. Pattern confirmed from `@rizom/site-docs` and yeehaa-io: sites never import entity
packages — entity plugins own their list rendering; the site configures presentation via
`entityDisplay` and references templates by string.

- ✅ Merge main into the branch; resolve the ~9 conflicts (mostly the scope rename).
  Done 2026-07-11 (`8721c963e`): branch caught up to main's published `@rizom` scope,
  `@rizom/site` SDK and TS7; site directory taken wholesale from main; all non-site work
  (rover `products`, directory-sync seed-bootstrap fix, content-formatters fixes,
  `@brains/theme-rizom-ai`, plans) preserved. The rev-5 design stays in history at
  `ff0e49bbc` as the port reference.
- Re-home `sites/rizom-ai` to `@rizom/site-rizom-ai` on published deps. Keep the layout
  and the home/work/foundation sections, converting them from the branch's
  `defineSection`/`createTemplate`/`StructuredContentFormatter` machinery to
  `createRizomSite`'s `content: SiteContentDefinition` field DSL (the layout components
  stay). Main's current `site-content.ts` (namespace `landing-page`, declarative
  field DSL, no zod) is the target shape — replace its landing-page sections with the
  home/work/foundation ones, and delete the old-design `sections/*`.
- **`/writing` & `/network` swap their bespoke templates for the plugins' own list
  templates** (the entity-package imports were the only thing breaking the published
  model). A custom hand-written route can hold two plugin-list sections and takes
  precedence over the auto-generated per-type index, so rev-5's combined `/writing`
  (essays + talks) survives — the sections just reference `blog:post-list` and
  `decks:deck-list` instead of `rizom-ai-site:writing*`, and `/network` references
  `agent-discovery:agent-list`. Label via `entityDisplay`: `post`→"Essay",
  `deck`→"Talk", `agent`→"Agent". Those templates render the plugins' own
  `ContentArchive`/directory chrome, not rev-5's bespoke components — a shared
  `@rizom/ui` journal-list is the later option if the themed default is not good
  enough. `/events` stays deferred.
- Reconcile the rover composition; green; merge to main; publish `@rizom/site-rizom-ai`.
- Move rover-pilot `users/new.yaml` off the old products-era pin. It currently holds
  `@rizom/site-rizom-ai@0.2.0-alpha.148`, theme `@brains/theme-rizom`, and
  `addOverride: [atproto-registry, site-content]` — all three drift from our
  composition and must move: bump to the freshly published version, switch the theme to
  `@brains/theme-rizom-ai`, and carry the real `add:` set
  (`web-chat`, `atproto-registry`, `products`, `rizom-ecosystem`, `newsletter`). For
  content, override the pilot's generic per-handle default (`rizom-ai/rover-new-content`)
  and point the staging sync at the merged `rizom-ai/rizom-content` (Decision 4) — the
  whole reason to stage is to validate the folded corpus before the production cutover.
  Then deploy to `new.rizom.ai`.

### Phase 6 — Production DNS cutover and retirement

- Deploy the consolidated brain to `rizom.ai`; apply the domain-level redirect rule on
  each of the `rizom.work` / `rizom.foundation` zones; watch for a soak period; retire
  the two old deployments and archive their app + content repos.
- Verification is live: the old domains 301 to their rooms; lexicon registry URLs
  on `rizom.ai` unchanged; foundation Discord flows land in the consolidated brain.

## Verification

1. `rizom.ai` serves the merged site; `/work` and `/foundation` render the folded content.
2. `rizom.work` and `rizom.foundation` 301 domain-level to their rooms (per-path
   fidelity deliberately not required — Phase 0 established there are no deep links
   worth preserving).
3. The consolidated brain answers on Discord with the foundation's conversation memory
   intact (pre-cutover conversation retrievable post-cutover).
4. `rizom.ai/.well-known/*` and the atproto registry endpoints serve identically to
   before the migration.
5. Exactly one Rizom deployment remains; the other two app repos and content repos are
   archived read-only.
6. `sites/rizom` has no variant machinery without a consumer; per-package gates pass.

## Follow-up: the `event` entity (post-migration)

`/events` is intentionally not built as part of this migration. Gatherings need a
real `event` entity — dates, locations, status/RSVP, city-chapter grouping — the
same entity-backed shape `/writing` and `/network` use, not hardcoded section copy
that would be thrown away. That is its own plan, to be written and executed **after**
the consolidated site ships. Until then the `/foundation` page carries the gatherings
teaser and the `Events` links point there.

## Open decisions — all settled in Phase 0 (2026-07-09)

- Publishing: **yes** — it comes with the rover base (blog/series/decks in the
  `default` preset); newsletter added, content-pipeline/social-media excluded
  (decision 3).
- Redirect granularity: **domain-level, one rule per zone** — the per-path map was
  dropped entirely (decision 2).

## Related

- [`rizom-sites-on-hosted-rover.md`](./rizom-sites-on-hosted-rover.md) — the predecessor
  this plan follows: site packaging, package resolution, and per-domain TLS/DNS machinery.
- `brain-model-unification.md` — the consolidated brain becomes the natural relay-successor
  composition (`core + site + team` + adds); one fewer live model to migrate.
- `work/sites-controlled-deploy` — in-flight lane executing the predecessor; see the
  sequencing note above.
- `sites/rizom`, `brains/relay`, `brains/ranger` — sources of the consolidated composition.
