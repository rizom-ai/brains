# Plan: Admin + CMS on core (no site-builder dependency)

## Status

Proposed, with early groundwork already landed.

## Context

CMS here means Sveltia CMS: a browser SPA that needs:

- a CMS config document
- a tiny bootstrap page
- GitHub auth handled client-side

Historically, that lived inside the site-builder output as `admin/config.yml` and `admin/index.html`. That made CMS effectively depend on:

- `site-builder`
- a public-site-oriented web surface
- writing admin assets into the generated site output

That is the wrong dependency direction for `preset: core`.

The real requirements are much smaller:

- schema-driven config generation
- repo/branch info from git-sync
- a browser-facing admin surface
- one HTTP endpoint the browser can visit

Core brains should be manageable without pulling in site-builder.

## Goal

Operators on `preset: core` can go to their brain URL and get an admin surface that includes CMS, without requiring site-builder.

Target UX:

1. Visit the brain URL
2. Land on the admin surface
3. Admin shell loads CMS config from the same brain
4. Sveltia talks directly to GitHub
5. Git commits flow back into the brain via directory-sync

## Product shape

### Core preset

- `/` → admin surface
- `/cms-config` → CMS config endpoint
- `/mcp` → MCP
- `/a2a` → A2A later, on the same HTTP surface
- no preview/production site split is required

Core is an operator/admin surface, not a public-site deployment shape.

### Site presets

- `/` → public site
- `/cms` or `/dashboard` → admin surface
- `/cms-config` → CMS config endpoint
- `/mcp` → MCP
- `/a2a` → A2A
- existing preview/public web behavior should continue to work when site-builder is enabled

## Non-goals

- Requiring site-builder on `preset: core`
- Keeping admin/page ownership inside `interfaces/mcp`
- Making `shell/core` aware of git repo details for CMS
- Rewriting every HTTP transport in one step
- Solving browser auth on the brain side in v1

## Architectural decisions

### 1. CMS config generation is shared logic

Keep schema → CMS config generation in `shared/cms-config`.

That package owns:

- `generateCmsConfig(...)`
- Zod/schema → Sveltia widget mapping
- CMS config data structures

This logic stays generic and reusable.

### 2. Admin capability belongs in `plugins/admin`

Admin is broader than CMS.

`plugins/admin` should own:

- CMS config orchestration
- admin shell assets/page code
- admin-specific data contracts
- later dashboard composition
- optional `brain://cms-config` resource if we keep it
- the in-process `system:cms-config:get` capability

This plugin may depend on:

- `git-sync:get-repo-info`
- entity registry/frontmatter callbacks
- site/entity display metadata

That is plugin-layer orchestration, not `shell/core` responsibility.

### 3. `shell/core` should not own CMS/admin repo-aware logic

`shell/core` should remain generic.

It should not own:

- repo/branch lookup for CMS
- `brain://cms-config`
- `system:cms-config:get`
- admin page composition

Those move to `plugins/admin`.

### 4. General web routes should not live in `interfaces/mcp`

`interfaces/mcp` should own MCP protocol behavior, not the whole browser/admin surface.

So `/cms-config` and `/` are not the final responsibility of `interfaces/mcp`.

The earlier MCP-hosted `/cms-config` route is a transitional implementation, not the target architecture.

### 5. Admin routes belong on a shared HTTP surface

The chosen owner of route mounting is an evolved `interfaces/webserver`.

We are not introducing a new generic HTTP interface for now.

Compatibility requirements:

- existing `webserver` site-serving behavior must keep working
- preview/public web behavior must stay intact when site-builder is enabled
- `core` must be able to run this shared host without preview/static-site assumptions

That shared HTTP surface owns:

- the HTTP app/router
- route mounting
- path policy
- same-port composition

It should be able to mount contributions from:

- `plugins/admin`
- `interfaces/mcp`
- `interfaces/a2a`
- public-site rendering where applicable

## Current implementation trajectory

### Already done

- extracted CMS config generation into `shared/cms-config`
- made site-builder consume the shared generator
- exposed CMS config outside site-builder
- moved CMS ownership out of `shell/core` into `plugins/admin`

### Next

Build the real shared HTTP surface and move browser/admin routes there.

## Design

### Admin plugin responsibilities

`plugins/admin` should provide:

- CMS config generation based on current entity schemas
- admin shell assets/source
- a minimal contract that the shared HTTP surface can mount
- later dashboard/CMS tabs inside the same admin UI

The admin plugin defines **what admin is**, not **which server owns the port**.

### Shared HTTP surface responsibilities

The shared HTTP surface should provide one HTTP app per brain and mount:

- `/` or `/cms` → admin shell
- `/cms-config` → config endpoint
- `/mcp` → MCP transport
- `/.well-known/agent-card.json` and `/a2a` → A2A
- `/api/*` → plugin API routes
- canonical public `/health` and status endpoints
- public site routes where applicable
- preview routes/hosts where site-builder is enabled

This is the key consolidation step.

Important constraint:

- `core` does not need a preview/production split
- site-capable presets must keep preview + public web working while admin is added alongside them

### MCP and A2A after consolidation

After consolidation:

- `interfaces/mcp` still owns MCP semantics
- `interfaces/a2a` still owns A2A semantics
- but neither should need to own a standalone general-purpose HTTP server

They should become mounted protocol modules on the shared HTTP surface.

## Including base (note) entities

### Problem

Base notes (`entityType: "base"`) can contain bare `---` in the markdown body. Frontmatter-oriented CMS parsing breaks on that.

### Fix

For base notes, the shared CMS generator emits a markdown-only collection:

- `format: "markdown"`
- one `body` field
- no frontmatter widgets

This preserves existing note content verbatim and keeps title extraction on the brain side.

### Result

- base notes become editable in CMS without migration
- typed entities keep their current frontmatter-driven CMS behavior

## Rollout

### Phase 1 — shared generator

Done.

- move CMS generation into `shared/cms-config`
- keep site-builder using it

### Phase 2 — admin plugin ownership

In progress / partially done.

- move CMS config orchestration into `plugins/admin`
- remove repo-aware CMS logic from `shell/core`

### Phase 3 — shared HTTP surface via `interfaces/webserver`

Next major slice.

- stop treating `interfaces/mcp` as the browser/admin HTTP owner
- evolve `interfaces/webserver` into the shared host
- preserve current site/preview behavior while doing so

### Phase 4 — canonical `/health` first

First consolidation slice:

- make the evolved `interfaces/webserver` own the canonical public `/health`
- use that route for Caddy/Kamal health checks
- keep site-builder deployments working while core can use the same host without preview assumptions

### Phase 5 — admin routes

- move `/cms-config` to the shared HTTP surface
- serve admin shell there
- later mount MCP and A2A onto that same surface

### Phase 4 — preset-specific path policy

- `core`: admin at `/`
- site presets: admin at `/cms` or `/dashboard`

### Phase 5 — dashboard returns inside admin

- dashboard becomes a section/tab of admin
- not a reason to move ownership back into `system`

## Deployment implications

This plan is not just a runtime change; deploy scaffolding must follow it.

### Caddy

Current internal Caddy routing assumes multiple internal ports and a preview/public split that is mainly relevant for site-capable presets.

- `/mcp` → MCP HTTP server
- `/a2a` → A2A server
- `/api/*` → plugin API server
- site fallback → webserver/A2A

Target shape:

- one primary internal HTTP app/port for production traffic
- Caddy mostly forwards by path to that one internal surface
- preview handling may remain separate initially if needed

This means `deploy/Caddyfile` will need to change once the shared surface exists.

### Kamal

Kamal itself can likely stay conceptually similar, but the generated deploy shape must align with the new runtime:

- healthcheck should hit the canonical `/health` route on the consolidated HTTP surface
- deploy assumptions about internal ports need updating
- smoke routing and boot expectations should match the single-surface design
- core deployments should not require preview/public-site routing assumptions
- site-builder deployments must preserve existing preview/public web behavior

This means Kamal templates and related deploy scaffolding must be updated together with the runtime consolidation.

## Open questions

1. For site presets, should admin canonicalize on `/cms`, `/dashboard`, or support both with one canonical redirect?
2. Should `brain://cms-config` remain as an internal/debug MCP resource, or eventually go away?
3. How much of preview routing should be consolidated in the same pass versus kept separate initially?
4. Does `interfaces/webserver` need a formally documented minimal core mode in config, or can that emerge from implementation defaults?

## Verification

1. Core brains can expose admin + CMS without site-builder
2. `shell/core` no longer owns repo-aware CMS logic
3. `/cms-config` is served by the shared HTTP surface, not MCP-specific HTTP code
4. MCP still works at `/mcp` on the same port
5. Base-note CMS round-trips preserve bare `---` content verbatim
6. Site presets keep `/` public and mount admin under `/cms` or `/dashboard`
7. Core deploys work without preview/public-site split assumptions
8. Site-builder deploys preserve existing preview/public web behavior while adding admin routes
9. The canonical public `/health` endpoint is served by the shared HTTP surface
10. Deploy scaffolding (Caddy/Kamal) matches the consolidated routing model

## Related

- `docs/plans/unified-http-surface.md`
- `shared/cms-config/src/index.ts`
- `plugins/admin/`
