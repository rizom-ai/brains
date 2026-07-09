# Plan: Rizom consolidation — one brain, one site

## Status

In progress — direction decided 2026-07-07; Phases 0–2 done
(2026-07-09, `work/rizom-consolidated-site`; the published-index routes moved to
Phase 4, after the content merge; Phase 2's deployment-time config rolls into
Phase 5). Next: Phase 3 (content and state cutover). **Follow-up to
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
  (foundation essays are a series — matches the entity model); `/events` for gatherings;
  `/network` from the agent directory; `/docs` ↗ docs.rizom.ai; `/chat` public. Old
  domains 301 domain-level into their rooms, each room's footer acknowledging the move.
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

- Merge content repos (subtree import → collision pass → directory-sync import settles;
  policy per the Phase 0 IA note: rizom-ai ids win, foundation-unique content imports
  as-is, `site-content/*` retires unimported); copy foundation runtime DBs to the new
  deployment; verify conversation memory reads.
- Tests first: import round-trip on a merged fixture; collision policy covered.

### Phase 4 — Published-index routes on the merged content

- Build the remaining merged-sitemap routes against the merged corpus: `/writing`
  (posts + foundation-essay series + decks through the rizom-ai layout), `/events`,
  `/network` (agent directory), plus the platform nav links that point at them
  (`Writing`, `Network`) deferred from Phase 1.
- Tests first: each route renders real entries from a merged-corpus fixture under the
  two-tier chrome; nav shows the new links on the platform face only.

### Phase 5 — DNS cutover and retirement

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
