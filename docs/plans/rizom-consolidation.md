# Plan: Rizom consolidation — one brain, one site

## Status

Proposed; direction decided 2026-07-07. **Follow-up to
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
- **IA / sitemap (Phase 0 proposal)**: one `/writing` index for everything published
  (foundation essays are a series — matches the entity model); `/events` for gatherings;
  `/network` from the agent directory; `/docs` ↗ docs.rizom.ai; `/chat` public. Old
  domains 301 per-path into their rooms, each room's footer acknowledging the move.
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

- [`rizom-sites-on-hosted-rover.md`](./rizom-sites-on-hosted-rover.md) — the predecessor
  this plan follows: site packaging, package resolution, and per-domain TLS/DNS machinery.
- `brain-model-unification.md` — the consolidated brain becomes the natural relay-successor
  composition (`core + site + team` + adds); one fewer live model to migrate.
- `work/sites-controlled-deploy` — in-flight lane executing the predecessor; see the
  sequencing note above.
- `sites/rizom`, `brains/relay`, `brains/ranger` — sources of the consolidated composition.
