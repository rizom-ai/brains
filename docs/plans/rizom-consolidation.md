# Plan: Rizom consolidation — one brain, one site

## Status

Proposed; decided 2026-07-07. **Supersedes `rizom-sites-on-hosted-rover.md`** (deleted with
this plan's landing): the three Rizom web properties (`rizom.ai`, `rizom.work`,
`rizom.foundation`) consolidate into **one site at `rizom.ai`**, and the three deployed
brains behind them (ranger, ranger, relay) consolidate into **one Rizom brain**. The
predecessor's premise — packaging three per-site variants so hosted Rover can resolve them
as npm refs — dissolves: with one site there is no fan-out to package.

## Why

- Three standalone deploys, three Cloudflare zones with their own certs/DNS, three content
  repos, and three site variants exist to serve what is one organisation's presence. The
  predecessor plan's hardest work (per-site npm packaging, per-domain TLS parameterization,
  multi-zone DNS) is cost incurred _because_ there are three of everything.
- The repo's stated direction is a single brain, not a fleet. Site consolidation without
  brain consolidation would leave two brains whose only job is redundancy.
- Bundle-model alignment (`brain-model-unification.md`): the consolidated brain is exactly
  the composition that plan already anticipates — `core + site + team` plus opt-ins — so
  consolidation reduces the number of live compositions the unification must migrate.

## Decisions

1. **One site, at `rizom.ai`.** `sites/rizom` (the shared core) stops being a
   variant-substrate and becomes _the_ Rizom site. The work and foundation properties fold
   in as routes/sections of that site (working assumption: `/work` and `/foundation`
   landing routes composed from their current section sets — hero/workshop/personas/proof
   and research/events/support respectively). The three `themeProfile` variants
   (product/editorial/studio) collapse to one profile; per-route accents replace
   per-site themes.
2. **`rizom.work` and `rizom.foundation` become edge redirects.** A Cloudflare redirect
   rule per zone (301 to the corresponding `rizom.ai` route). No origin, no certs, no
   hosted-rover involvement. The zones stay under our account for the domains' lifetime.
3. **One brain, relay-shaped.** The consolidated brain's composition is relay's base
   (team memory: `conversation-memory` shared + docs + Discord for the collective) **plus**
   what rizom.ai's ranger carries today: `atproto-registry` (the live instance serves the
   canonical `ai.rizom.brain.*` lexicons — this must not lapse) and `products`. In bundle
   vocabulary: `core + site + team` with `add: [atproto-registry, products]`. Whether it
   also takes `publishing` is a content question decided during the IA merge, not up front.
4. **Content repos merge into `rizom-ai-content`.** The work and foundation content repos
   are imported (with history, via subtree or plain file import — subtree preferred so
   provenance survives) and then archived. Entity collisions (same id/slug across repos)
   are resolved during the merge; the import runs through directory-sync so the entity DB
   is the writer of record for the merged corpus.
5. **Runtime state migrates with the foundation brain.** The foundation relay's
   conversation/team memory is the collective POC's working state; its runtime DBs
   (conversations, entities, jobs) are copied to the consolidated deployment at cutover
   rather than starting fresh. The other two brains' runtime state is disposable
   (site-serving only).
6. **Deploy shape: one standalone deploy now; hosted-rover later, optionally.** The
   predecessor plan existed to put three sites on hosted Rover. With one brain, the
   simplest safe shape is the one that already works: a single standalone deploy (today's
   `rizom-ai` repo shape) serving `rizom.ai`. Moving that one brain onto hosted-rover
   custom-domain machinery becomes an independent, optional follow-up — the per-domain
   cert/DNS design from the predecessor plan (Origin CA per zone, per-brain PEM pair,
   NS-delegation onboarding) remains documented in git history if/when that happens.

## What carries over from the in-flight worktree

`work/sites-controlled-deploy` started the predecessor's Phase 1 (`@brains/site-rizom-work`
package scaffold). Under this plan that package is not needed, but two of its products are:

- the **site-package CSS contract** (`themeOverride` layered after base theme) — applies
  unchanged to the single consolidated site;
- the **publishability groundwork** for the site dependency chain — needed the day the
  hosted-rover follow-up is picked up, and harmless before then.

The lane should be redirected before more work-specific effort lands.

## Phases (thin vertical, tests first)

### Phase 0 — Information architecture merge (content decision, no infra)

- Decide the merged sitemap: what `/work` and `/foundation` contain, which of the three
  section sets survive, what redirect targets each old URL maps to (per-path map for the
  redirect rules, so deep links don't all land on the homepage).
- Output: a short IA note in `rizom-ai-content` + the redirect map. No code.

### Phase 1 — One site in the monorepo

- `sites/rizom` absorbs the work/foundation routes, layouts, and sections behind the
  merged sitemap; one theme profile with per-route accents; delete the variant machinery
  that has no remaining consumer.
- Tests first: route table renders the merged sitemap; work/foundation sections render
  under their new routes; theme override contract holds.

### Phase 2 — One brain

- Compose the consolidated brain (relay base + `atproto-registry` + `products` + the one
  site); port rizom.ai's config specifics; wire the collective's Discord.
- Tests first: composition test asserting the plugin set equals relay's ∪ ranger-ai's
  additions; boot + eval smoke on the composed brain.

### Phase 3 — Content and state cutover

- Merge content repos (subtree import → collision pass → directory-sync import settles);
  copy foundation runtime DBs to the new deployment; verify conversation memory reads.
- Tests first: import round-trip on a merged fixture; collision policy covered.

### Phase 4 — DNS cutover and retirement

- Deploy the consolidated brain to `rizom.ai`; apply the per-path redirect rules on the
  `rizom.work` / `rizom.foundation` zones; watch for a soak period; retire the two old
  deployments and archive their app + content repos.
- Verification is live: old deep links 301 to their mapped targets; lexicon registry URLs
  on `rizom.ai` unchanged; foundation Discord flows land in the consolidated brain.

## Verification

1. `rizom.ai` serves the merged site; `/work` and `/foundation` render the folded content.
2. Every previously-published `rizom.work`/`rizom.foundation` URL 301s to its mapped
   target (spot-check list from the Phase 0 redirect map).
3. The consolidated brain answers on Discord with the foundation's conversation memory
   intact (pre-cutover conversation retrievable post-cutover).
4. `rizom.ai/.well-known/*` and the atproto registry endpoints serve identically to
   before the migration.
5. Exactly one Rizom deployment remains; the other two app repos and content repos are
   archived read-only.
6. `sites/rizom` has no variant machinery without a consumer; per-package gates pass.

## Open decisions (to settle in Phase 0, not before starting it)

- Does the consolidated brain take `publishing` (blog/newsletter on rizom.ai), or stay
  presence + registry + team memory?
- Redirect map granularity: per-path 301s vs section-level.

## Related

- `brain-model-unification.md` — the consolidated brain becomes the natural relay-successor
  composition (`core + site + team` + adds); one fewer live model to migrate.
- `work/sites-controlled-deploy` — in-flight lane to redirect; CSS contract carries over.
- `sites/rizom`, `brains/relay`, `brains/ranger` — sources of the consolidated composition.
- Predecessor: `rizom-sites-on-hosted-rover.md` (superseded and deleted; its per-domain
  TLS/DNS design lives in git history for the optional hosted-rover follow-up).
