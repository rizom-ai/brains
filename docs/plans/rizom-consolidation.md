# Plan: Finish Rizom consolidation — one brain, one site

## Status

In progress on `work/rizom-consolidated-site`.

The branch carries the finished site work (2026-07-13): the consolidated home, `/work`,
`/foundation`, `/writing`, and `/network` authored **schema-first** via the new
`@rizom/site-sections` package (one zod schema per section; no field DSL); the final
copy authored into `rizom-ai/rizom-content` as `site-content/<page>/<section>.md`
through the schema-derived formatter; the composition verified against a local render
(all 21 sections render — which surfaced that `site-content` is a required capability);
the products-era theme-profile canvas dropped; and changesets staged for the whole
release train. That code is not on `main` and the currently deployed `new.rizom.ai`
canary proves only the hosted package path, not this consolidated result.

This plan tracks only the remaining merge, staging, cutover, and retirement work. Delete
it when one production Rizom deployment remains.

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
- Merge and publish the resulting `@rizom/site-rizom-ai` release (changesets staged on
  the branch; the release train also carries `@rizom/site-sections`, `@rizom/site`,
  `@rizom/site-rizom`, and `@rizom/brain` — the deployed runtime needs the section
  registration).

### 2. Stage the actual consolidated brain

Update rover-pilot `new` desired state to use:

- the newly published consolidated site package;
- `rizom-ai/rizom-content`;
- `@brains/theme-rizom-ai`;
- `web-chat`, `atproto-registry`, `products`, `rizom-ecosystem`, `newsletter`, and
  `site-content`.

Build the exact hash-tagged image, deploy to `new.rizom.ai`, trigger the preview rebuild
through the running app, and review the consolidated home/rooms/indexes against the
approved mockups and real merged content.

### 3. Prepare state and production cutover

- Freeze writes for the cutover window.
- Back up all three existing deployments.
- Copy the foundation runtime databases to the consolidated deployment and verify a known
  conversation-memory read before DNS changes.
- Confirm `rizom.ai/.well-known/*` and `/atproto/lexicons/*.json` are identical in behavior
  on staging.
- Prepare rollback instructions and the two edge redirect rules.

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
