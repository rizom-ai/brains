# Plan: Unified HTTP surface

## Status

Proposed.

## Summary

The brain should converge on one HTTP surface per instance.

Not:

- one MCP HTTP server
- one A2A HTTP server
- one browser/admin server
- one plugin API server

But:

- one HTTP app
- one externally visible port
- multiple mounted protocol and capability routes

## Why

Today the split mostly reflects implementation history, not product intent.

Multiple HTTP servers/ports increase complexity in:

- deploy setup
- proxy configuration
- TLS termination
- health checks
- smoke tests
- operator mental model
- browser-facing dashboard/CMS work

The desired mental model is simple:

> go to the brain URL

## Goal

Each brain should expose one shared HTTP surface that can mount:

- `/` or `/dashboard`
- `/cms`
- `/mcp`
- `/.well-known/agent-card.json`
- `/a2a`
- `/api/*`
- canonical public `/health`
- public site routes where applicable

## Non-goals

- Rewriting every transport in a single PR
- Changing MCP protocol semantics
- Changing A2A protocol semantics
- Forcing site-builder onto `preset: core`
- Eliminating every secondary internal port immediately if keeping one temporarily simplifies migration

## Ownership model

This consolidation should not blur responsibilities.

### Shared HTTP surface owner

A shared HTTP host should own:

- the HTTP app/router
- listener lifecycle
- route mounting
- same-port composition
- shared middleware where appropriate
- the canonical public `/health` endpoint

Chosen direction:

- evolve `interfaces/webserver` into the shared HTTP host
- do not introduce a new generic HTTP interface for now

Compatibility requirement:

- existing `webserver` site-serving behavior must continue to work during the transition
- preview/public-site behavior must remain intact for site-builder-enabled presets
- `core` must be able to run the shared host without preview/static-site assumptions

### `plugins/admin`

`plugins/admin` should own:

- CMS capability
- CMS page/assets
- CMS config orchestration
- admin-specific data contracts

It should not need to own the listening socket.

### `plugins/dashboard`

`plugins/dashboard` should remain the source of truth for the dashboard UI.

The shared HTTP surface should mount that existing dashboard directly:

- at `/` for `preset: core`
- at `/dashboard` for site presets

It should not be reimplemented inside `plugins/admin`.

### `interfaces/mcp`

`interfaces/mcp` should own:

- MCP transport/protocol semantics
- mounted `/mcp` behavior
- auth behavior specific to MCP

It should not be the long-term owner of arbitrary browser/admin routes.

### `interfaces/a2a`

`interfaces/a2a` should own:

- agent-card and A2A protocol behavior
- mounted `/.well-known/agent-card.json` and `/a2a`

It should not need to own a separate general-purpose HTTP server once consolidation lands.

## Current state

Today the stack is effectively split like this:

- `interfaces/mcp` owns its own HTTP server
- `interfaces/a2a` owns its own HTTP server
- `interfaces/webserver` owns browser/public-site traffic
- deploy routing glues them together by path and port

That works, but it bakes transport fragmentation into runtime and deploy layers.

## Target state

A single in-process HTTP surface hosts everything.

Conceptually:

- the shared HTTP host starts one server
- interfaces/plugins contribute mounted handlers or route groups
- product paths are decided centrally
- protocols stay owned by their own modules

### Core preset

- `/` → existing dashboard surface
- `/cms` → CMS page with inline config
- `/mcp` → MCP
- `/.well-known/agent-card.json` + `/a2a` → A2A
- `/health` → health
- no preview/production site split required

Core should be the simplest shape: one operator-oriented HTTP surface.

### Site presets

- `/` → public site
- `/dashboard` → existing dashboard surface
- `/cms` → CMS page with inline config
- `/mcp` → MCP
- `/.well-known/agent-card.json` + `/a2a` → A2A
- `/api/*` → plugin APIs
- `/health` → health
- existing preview/public web behavior should continue to work when site-builder is enabled

## Deployment implications

This consolidation affects deploy tooling, not just runtime interfaces.

### Current deploy shape

The generated internal Caddy config currently routes to different internal ports, for example:

- `/mcp` → one port
- `/a2a` / agent-card → another
- `/api/*` → another
- public site/webserver → another
- preview traffic → separate preview path/server

That mirrors the current fragmented runtime.

### Target deploy shape

Once the shared HTTP surface exists, deploy routing should simplify to:

- one primary internal HTTP port for production traffic
- path-based routing handled mostly inside the shared app
- Caddy doing far less internal fan-out

Important distinction:

- core does not need preview/public-site split behavior
- site-builder-enabled presets should keep preview/public web behavior, even if preview remains a partially separate concern during migration

Preview traffic may remain separate at first if that keeps rollout small, but the default production path should converge on one internal surface.

### Caddy changes

`deploy/Caddyfile` will need to change accordingly.

Expected direction:

- stop routing `/mcp`, `/a2a`, `/api/*`, dashboard/CMS, and public site to different internal services where unnecessary
- reverse proxy most production traffic to the consolidated HTTP host
- keep only truly separate concerns separate during migration

### Kamal changes

Kamal templates and assumptions also need updating.

In particular:

- healthchecks should target the canonical `/health` route on the consolidated HTTP host
- runtime expectations around internal ports should shrink
- deploy smoke behavior should match the unified path layout
- generated scaffolding should reflect the new single-surface architecture

This means consolidation work should include coordinated template updates for:

- `deploy/Caddyfile`
- Kamal deploy config/templates
- any related boot/health/smoke scripts

## Rollout

### Phase 1 — stop adding more HTTP ownership to MCP

Treat any non-MCP routes on `interfaces/mcp` as transitional.

Specifically:

- any MCP-hosted CMS config delivery or browser bootstrap is acceptable only as an interim step
- admin/browser routes should not continue to accumulate there

### Phase 2 — establish the shared HTTP host

Evolve `interfaces/webserver` into the shared HTTP host.

That means:

- keep the existing interface/package working
- preserve current production site, preview site, and API-route behavior
- refactor internals so one shared app can become the canonical public surface
- allow a minimal core-oriented mode that does not require preview or static-site output

That host becomes the place where shared routes are mounted.

### Phase 3 — canonical `/health` on the shared host

First consolidation slice:

- make `interfaces/webserver` own the canonical public `/health`
- keep current site/preview behavior working
- make Caddy/Kamal target that route

### Phase 4 — move admin routes there

Mount:

- the existing dashboard UI at `/` for core and `/dashboard` for site presets
- `/cms` with inline CMS config bootstrapping

with CMS page/assets owned by `plugins/admin` and dashboard UI owned by `plugins/dashboard`.

### Phase 5 — mount MCP onto the shared surface

Keep MCP ownership in `interfaces/mcp`, but make it a mounted protocol handler at `/mcp` on the shared HTTP app.

### Phase 6 — mount A2A onto the shared surface

Do the same for:

- `/.well-known/agent-card.json`
- `/a2a`

### Phase 7 — align deploy scaffolding

Update:

- Caddy
- Kamal templates
- health checks
- smoke routing
- operator docs

Explicitly:

- the canonical public `/health` endpoint should be served by the shared HTTP surface, not by a protocol-specific standalone server

Explicit acceptance criteria:

- core deploys do not depend on preview/public-site routing assumptions
- site-builder deploys keep existing preview/public web behavior while gaining the consolidated dashboard/CMS/MCP/A2A surface

## Design constraints

- preserve protocol ownership boundaries
- keep route ownership out of unrelated transports
- prefer one visible port per brain
- preserve `preset: core` without site-builder dependency
- do not require preview/public-site split behavior for core-only brains
- preserve preview/public web behavior when site-builder is enabled
- make the canonical public `/health` endpoint part of the shared HTTP surface
- keep rollout incremental and reversible

## Tradeoffs

### Fragmented HTTP servers

Pros:

- easier to build incrementally
- easier local isolation during early development

Cons:

- more deploy complexity
- more ports and routing assumptions
- harder admin/browser story
- harder long-term product coherence

### Shared HTTP surface

Pros:

- cleaner product model
- cleaner URLs
- simpler proxy/deploy setup once landed
- better fit for admin/dashboard/CMS
- better long-term place for MCP and A2A browser-adjacent behavior

Cons:

- requires interface consolidation work
- requires coordinated runtime + deploy changes
- needs careful ownership boundaries to avoid a giant god-interface

## Recommendation

Treat the shared HTTP surface as the target architecture and update new work to align with it.

Concretely:

- CMS page/config ownership belongs in `plugins/admin`
- dashboard ownership belongs in `plugins/dashboard`
- route mounting belongs to `interfaces/webserver` as the evolving shared HTTP host
- do not introduce a new generic HTTP interface unless `webserver` proves unable to carry this role cleanly
- preserve current `webserver` behavior while refactoring toward the shared-host model
- MCP belongs at `/mcp` on that same surface
- A2A belongs at `/a2a` on that same surface
- Caddy/Kamal should be updated to reflect that architecture, not preserve accidental multi-port fragmentation forever

## Related

- `docs/plans/cms-on-core.md`
- `interfaces/mcp/src/transports/http-server.ts`
- `interfaces/a2a/src/a2a-interface.ts`
- `interfaces/webserver/`
- `packages/brain-cli/templates/deploy/Caddyfile`
- `packages/brain-cli/templates/deploy/kamal-deploy.yml`
