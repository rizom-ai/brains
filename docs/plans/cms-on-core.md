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
- a browser-facing operator surface
- one HTTP endpoint the browser can visit

Core brains should be manageable without pulling in site-builder.

## Goal

Operators on `preset: core` can go to their brain URL and get the dashboard at `/` plus CMS at `/cms`, without requiring site-builder.

Target UX:

1. Visit the brain URL
2. Land on the dashboard surface
3. Open `/cms`
4. The CMS page bootstraps its config from the same brain
5. Sveltia talks directly to GitHub
6. Git commits flow back into the brain via directory-sync

## Product shape

### Core preset

- `/` → existing dashboard surface
- `/cms` → CMS
- `/mcp` → MCP
- `/a2a` → A2A later, on the same HTTP surface
- no preview/production site split is required

Core is an operator-facing surface, not a public-site deployment shape.

### Site presets

- `/` → public site
- `/dashboard` → existing dashboard surface
- `/cms` → CMS
- `/mcp` → MCP
- `/a2a` → A2A
- existing preview/public web behavior should continue to work when site-builder is enabled

## Non-goals

- Requiring site-builder on `preset: core`
- Keeping dashboard/CMS page ownership inside `interfaces/mcp`
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

### 2. CMS capability belongs in `plugins/admin`

The operator surface is broader than CMS, but the CMS-specific browser capability should live in `plugins/admin`.

`plugins/admin` should own:

- CMS config orchestration
- CMS page assets/page code
- admin-specific data contracts

`plugins/admin` should **not** grow a parallel dashboard implementation if `plugins/dashboard` already provides the dashboard surface we want.

This plugin may depend on:

- `git-sync:get-repo-info`
- entity registry/frontmatter callbacks
- site/entity display metadata

That is plugin-layer orchestration, not `shell/core` responsibility.

### 3. `shell/core` should not own CMS/admin repo-aware logic

`shell/core` should remain generic.

It should not own:

- repo/branch lookup for CMS
- CMS page composition

Those move to `plugins/admin`.

### 4. General web routes should not live in `interfaces/mcp`

`interfaces/mcp` should own MCP protocol behavior, not the whole browser/admin surface.

`/cms` and dashboard routes are not the responsibility of `interfaces/mcp`.

### 5. Dashboard/CMS routes belong on a shared HTTP surface

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
- the CMS page assets/source
- a minimal contract that the shared HTTP surface can mount
- inline config bootstrapping for `/cms`

`plugins/dashboard` should remain the source of truth for the dashboard UI. The shared HTTP surface should mount that existing dashboard at `/` for core and `/dashboard` for site presets, rather than wrapping it in a second admin page.

The admin plugin defines **what admin is**, not **which server owns the port**.

### Shared HTTP surface responsibilities

The shared HTTP surface should provide one HTTP app per brain and mount:

- `/` or `/dashboard` → existing dashboard UI
- `/cms` → CMS page with inlined config
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

For base notes, the shared CMS generator emits a `.md` collection using Sveltia's normal markdown/frontmatter file format, but only exposes a single body field:

- `format: "frontmatter"`
- one `body` field
- no frontmatter widgets
- note files still do **not** need actual frontmatter; Sveltia treats frontmatter as optional for `.md`

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

- serve `/cms` from the shared HTTP surface
- inline CMS config into that page instead of exposing a separate public `/cms-config` endpoint
- later mount MCP and A2A onto that same surface

### Phase 6 — preset-specific path policy

- `core`: dashboard at `/`, CMS at `/cms`
- site presets: dashboard at `/dashboard`, CMS at `/cms`

### Phase 7 — reuse `plugins/dashboard`

- make `plugins/dashboard` core-compatible without requiring `site-builder`
- mount the existing dashboard UI directly on the shared host
- do **not** wrap it in a second admin shell
- do **not** build a second dashboard implementation inside `plugins/admin`

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

1. Should legacy `/admin` requests redirect to `/cms`, or should we cut straight to `/cms` + `/dashboard`?
2. How much of preview routing should be consolidated in the same pass versus kept separate initially?
3. Does `interfaces/webserver` need a formally documented minimal core mode in config, or can that emerge from implementation defaults?

## Verification

1. Core brains can expose dashboard + CMS without site-builder
2. `shell/core` no longer owns repo-aware CMS logic
3. `/cms` is served by the shared HTTP surface with inline CMS config, not MCP-specific HTTP code
4. MCP still works at `/mcp` on the same port
5. Base-note CMS round-trips preserve bare `---` content verbatim
6. Site presets keep `/` public and mount dashboard under `/dashboard` and CMS under `/cms`
7. Core deploys work without preview/public-site split assumptions
8. Site-builder deploys preserve existing preview/public web behavior while adding admin routes
9. The canonical public `/health` endpoint is served by the shared HTTP surface
10. Deploy scaffolding (Caddy/Kamal) matches the consolidated routing model

## Related

- `docs/plans/unified-http-surface.md`
- `shared/cms-config/src/index.ts`
- `plugins/admin/`
