# Plan: Finish Rizom consolidation — one brain, one site

## Status

Partial. Cutover preparation is active. The consolidated home, `/work`, `/foundation`, `/writing`, and
`/network` implementation is merged into `main`, and `@rizom/site-rizom-ai` is published
at `0.2.0-alpha.192`. The schema-first content model, merged `rizom-content` corpus, and
Rover composition are complete.

`new.rizom.ai` still runs runtime and site package `0.2.0-alpha.186`; production
`rizom.ai` still runs Ranger `0.1.0`. This plan now tracks the staging refresh, runtime
state migration, production cutover, redirects, soak, and retirement. Delete it when one
production Rizom deployment remains.

## Goal

Serve the Rizom platform, work, and foundation faces from one brain and one site at
`rizom.ai`. Redirect `rizom.work` and `rizom.foundation` at the edge, preserve the AT
Protocol registry and collective memory, then retire the redundant deployments.

## Settled target

- **One site:** `rizom.ai`, with `/work` and `/foundation` rooms, one `/writing` index,
  `/network`, and `/docs` linking to `docs.rizom.ai`.
- **One brain:** Rover default plus `web-chat`, `atproto-registry`, `products`,
  `rizom-ecosystem`, `newsletter`, and `site-content` until capability bundles replace
  preset language. `site-content` is load-bearing: it registers the entity type the page
  sections render from — without it the site builds with empty sections (verified
  against a local render, 2026-07-13).
- **One content repo:** `rizom-ai/rizom-content`, already merged from the three source
  repos with history and collision handling.
- **One runtime lineage:** migrate the foundation brain's conversation/team-memory state;
  the two site-serving brains' runtime state is disposable.
- **Old domains:** one domain-level Cloudflare `301` per zone to `/work` and `/foundation`;
  no replacement origins.
- **Events:** remain on the `/foundation#events` teaser. A real `/events` route waits for a
  separate event-entity plan after this migration.

## Remaining work

### 1. Finish the published site package

- ✅ Complete the schema-first section/content work in the active worktree (2026-07-13).
- ✅ Author the final consolidated copy into `rizom-content` (`site-content/*` generated
  through the schema-derived formatter, round-trip verified).
- ✅ Rebase/merge current `main` and resolve package-boundary drift without reintroducing
  private runtime imports into the public site package.
- ✅ Run package tests, rendered-site checks, typecheck, lint, and the full commit hooks
  (local render verified: all sections on all faces, `/writing` + `/network` lists, only
  `boot.js` in the head).
- ✅ Merge and publish the resulting site release. `@rizom/site-rizom-ai`,
  `@rizom/site-sections`, `@rizom/site`, `@rizom/site-rizom`, and `@rizom/brain` are
  published at `0.2.0-alpha.192`.

### 2. Stage the actual consolidated brain

The rover-pilot `new` desired state already selects the consolidated site package,
`rizom-ai/rizom-content`, `@rizom/theme-rizom-ai`, `web-chat`, `atproto-registry`,
`rizom-ecosystem`, `newsletter`, and `site-content`. Update its runtime and exact site
package pins from `0.2.0-alpha.186` to the chosen release.

Build the exact hash-tagged image, deploy to `new.rizom.ai`, trigger the preview rebuild
through the running app, and review the consolidated home/rooms/indexes against the
approved mockups and real merged content.

### 3. Prepare state and production cutover

- Freeze writes for the cutover window.
- Back up all three existing deployments.
- Copy the foundation runtime databases to the consolidated deployment and verify a known
  conversation-memory read before DNS changes.
- ✅ Confirm `rizom.ai/.well-known/*` and `/atproto/lexicons/*.json` are identical in
  behavior on staging (2026-07-16, against alpha.186 on `new`):
  - All nine `/atproto/lexicons/ai.rizom.brain.*.json` return 200 on both; eight are
    byte-identical. The card lexicon differs only because staging serves the current
    canonical shape while the old Ranger prod serves a pre-`2c00f3afb` copy — staging is
    correct. (Separately found and fixed: the parse schema stripped
    `defs.main.description` from all nine served lexicons; fix on
    `work/rizom-site-visual-pass`, rides the next release.)
  - `/.well-known/did.json`, `jwks.json`, and `oauth-authorization-server` return 200 on
    staging and 404 on the old prod (Ranger runs neither atproto nor auth-service) —
    cutover only adds surface, nothing regresses.
  - The DID document derives from the request hostname (atproto plugin builds it
    per-request), so `did:web:rizom.ai` appears automatically at cutover. Note the brain's
    identity changes from `did:web:new.rizom.ai`; anything that captured the staging DID
    re-registers after cutover.
  - Unauthenticated `POST /mcp` returns 401 on both staging and old prod.
  - `GET /health`: staging reports `rover 0.2.0-alpha.186`; old prod reports
    `ranger 0.1.0` (the deployment being retired).
- ✅ Prepared rollback instructions and the two edge redirect rules (below).

#### Edge redirect rules (Cloudflare, one per zone)

Single-redirect rules at the zone level, applied at cutover (plan settled on room-level
redirects, not per-path maps):

- Zone `rizom.work`: dynamic redirect, expression `true` →
  `concat("https://rizom.ai/work")`, status 301, preserve query string off.
- Zone `rizom.foundation`: dynamic redirect, expression `true` →
  `concat("https://rizom.ai/foundation")`, status 301, preserve query string off.

Both zones keep DNS records proxied (orange-cloud) so the rules fire without an origin.

#### Rollback instructions

Cutover is a rover-pilot desired-state change plus DNS; rollback is the inverse, in order:

1. Point `rizom.ai` DNS back at the old Ranger origin (record values captured in the
   pre-cutover backup step). TTL is Cloudflare-proxied, so propagation is immediate.
2. Disable the two zone redirect rules so rizom.work / rizom.foundation serve their old
   origins again (origins stay up until the rollback window closes — do not retire early).
3. Revert the rover-pilot production-user commit (`git revert`, push; Build/Reconcile/
   Deploy runs restore the previous desired state).
4. The consolidated brain's runtime state stays on the `new` deployment throughout the
   window — no data moves during rollback; the migrated foundation-memory copy is a copy,
   originals remain on the foundation brain until retirement.
5. Verify: old prod `/health` reports `ranger`, site serves the pre-cutover pages,
   `rizom.work`/`rizom.foundation` 200 from their own origins.

### 4. Cut over and retire

- Deploy the consolidated brain at `rizom.ai`.
- Apply `rizom.work/* → rizom.ai/work` and
  `rizom.foundation/* → rizom.ai/foundation` redirects.
- Soak while monitoring health, TLS, MCP auth, site rebuilds, registry routes, Discord, and
  representative content.
- Retire the old Work/Foundation origins only after the rollback window closes.
- Archive superseded app and content repos; retain the domains and redirect rules.
- Remove obsolete Ranger/Relay deployment paths and delete this plan.

## Verification

1. `rizom.ai`, `/work`, `/foundation`, `/writing`, and `/network` render from the merged
   content and intended package version.
2. `rizom.work` and `rizom.foundation` return permanent redirects to their rooms.
3. `GET /health` reports the intended runtime; unauthenticated `POST /mcp` returns `401`.
4. Foundation conversation memory is readable after migration and Discord reaches the
   consolidated brain.
5. AT Protocol well-known and lexicon registry routes remain available.
6. Preview and production rebuilds run through the deployed app's remote command surface.
7. Exactly one Rizom production brain remains.

## Non-goals

- Waiting for full brain-model unification before cutover.
- Inventing a second composition abstraction; the deployed composition should translate
  directly to bundles later.
- Building the deferred event entity or `/events` route.
- Preserving unused per-path redirects when room-level redirects are sufficient.

## References

- [`rizom-sites-on-hosted-rover.md`](./rizom-sites-on-hosted-rover.md)
- [`brain-model-unification.md`](./brain-model-unification.md)
- [`docs/rizom-site-mockups.html`](../rizom-site-mockups.html)
- `sites/rizom-ai`
- `work/rizom-consolidated-site`
