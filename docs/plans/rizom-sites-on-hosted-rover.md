# Plan: Finish the hosted Rizom site rollout

## Status

Rollout tail. The platform work is implemented and released:

- `@rizom/site` and the Rizom/docs site packages are public;
- hosted Rover resolves exact site package refs into hash-tagged fleet images;
- generated user config carries `siteOverride` and optional capabilities;
- custom-domain TLS/DNS support is available;
- packed boot/render smokes cover the published-package path;
- `new.rizom.ai` is live on Rover with `@rizom/site-rizom-ai@0.2.0-alpha.157`
  and the AT Protocol registry capability.

This plan now owns only production cutover validation. Architecture and package history are
in git and changelogs, not here. Delete this file when the production sites are cut over or
when [`rizom-consolidation.md`](./rizom-consolidation.md) replaces the remaining rollout.

## Goal

Move the production Rizom and docs domains onto the proven hosted Rover package path
without losing content, canonical URLs, registry routes, TLS, or rollback capability.

## Remaining rollout

Use this order unless the consolidation plan intentionally removes a target:

1. `rizom.ai`
2. `rizom.work`
3. `rizom.foundation`
4. `docs.rizom.ai`

For each target:

1. Pin the released runtime and site package in rover-pilot desired state.
2. Preserve required capabilities:
   - `rizom.ai`: `atproto-registry`
   - `docs.rizom.ai`: `docs`
3. Build the exact hash-tagged image before deployment.
4. Reconcile generated config and inspect the effective `brain.yaml`.
5. Deploy preview first and trigger a preview site rebuild through the running app's remote
   command surface.
6. Verify the generated preview output and site-specific markers.
7. Deploy the production domain and verify TLS, DNS, health, canonical routes, and content.
8. Keep the previous deployment available until the rollback window closes.

## Desired-state shape

```yaml
handle: <handle>
domainOverride: <domain>
cloudflareZoneId: <zone-id>
contentRepoOverride: <owner/repo>
addOverride: []
siteOverride:
  package: <published-site-package>
  version: <exact-released-version>
  theme: "@brains/theme-rizom"
```

`siteOverride.version` and the runtime version are exact release pins. The generated fleet
image must install the same package set represented by desired state.

## Acceptance checks

### Every site

- `GET /health` returns `200` and the intended runtime version.
- Unauthenticated `POST /mcp` returns `401`.
- Apex, `www` where applicable, and preview DNS resolve to the intended deployment.
- Origin TLS verification passes.
- A remote preview rebuild writes `dist/site-preview` on the running app.
- Canonical URLs, navigation, theme assets, and representative content survive cutover.

### `rizom.ai`

- `/.well-known/*` behavior is preserved.
- `/atproto/lexicons/*.json` serves the canonical registry documents.
- The installed package is `@rizom/site-rizom-ai` at the desired version.

### `rizom.work` and `rizom.foundation`

- Representative legacy deep links resolve correctly.
- Their distinct route content and visual profile survive unless consolidation has already
  replaced them with redirects.

### `docs.rizom.ai`

- The docs manifest/content sync remains current.
- Grouped docs navigation and representative document routes render.

## Retirement

After a successful soak:

- remove the superseded standalone deploy workflow;
- archive the old app repo only when it no longer owns runtime or site behavior;
- keep content repos active until the consolidation plan explicitly merges them;
- remove obsolete Ranger/Relay site-only deployment paths;
- delete this plan.

## Related

- [`rizom-consolidation.md`](./rizom-consolidation.md) — preferred end-state: one Rizom
  brain and one site, with old domains redirected at the edge.
- `packages/site` — public site authoring boundary.
- `packages/brains-ops` — hosted fleet desired-state and image tooling.
- `sites/rizom*`, `sites/docs` — published site packages.
