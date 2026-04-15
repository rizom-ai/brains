# Plan: Unified HTTP surface

## Status

Proposed.

## Context

Today, brain HTTP-facing interfaces are split across separate servers/ports:

- MCP HTTP serves `/mcp`
- A2A serves `/.well-known/agent-card.json` and `/a2a`
- future admin/dashboard/CMS routes would otherwise introduce yet another surface

This is workable, but not elegant. It complicates:

- deploy/proxy/TLS configuration
- operator mental model
- URL design
- future browser-facing admin features

## Goal

Each brain should prefer one HTTP surface, on one port, with routes such as:

- `/mcp`
- `/.well-known/agent-card.json`
- `/a2a`
- `/cms-config`
- `/` or `/cms`

The user/operator should think: “go to the brain URL,” not “which port/protocol does this feature live on?”

## Non-goals

- Rewriting all HTTP interfaces in one step
- Changing A2A protocol semantics
- Changing MCP protocol semantics
- Forcing site-builder into `preset: core`

## Current state

- `interfaces/mcp` owns its own HTTP server
- `interfaces/a2a` owns its own HTTP server
- browser/admin features are being planned separately

This separation came mostly from implementation simplicity, not because multiple ports are a product requirement.

## Preferred direction

Move toward a shared HTTP host/router per brain.

That shared HTTP surface should be able to mount:

- MCP routes
- A2A routes
- admin/dashboard/CMS routes
- health/status routes
- optional public web routes where applicable

## Rollout

### Phase 1

Do not block current CMS work on full unification.

Use the existing brain HTTP surface for:

- `GET /cms-config`
- `/` or `/cms` for the admin shell

Keep A2A as-is for now if necessary.

### Phase 2

Refactor MCP and A2A to mount onto a shared HTTP server/router.

### Phase 3

Standardize preset behavior:

- `core`: admin/dashboard at `/`
- site presets: public site at `/`, admin at `/cms` or `/dashboard`

## Tradeoff

### Separate ports

Pros:

- simpler initial implementation
- easier isolation

Cons:

- worse UX
- more config/proxy complexity
- harder to grow into a coherent admin surface

### Unified HTTP surface

Pros:

- one port
- cleaner URLs
- easier deploy story
- better fit for CMS/dashboard/admin

Cons:

- requires interface consolidation work
- slightly tighter coupling at the HTTP hosting layer

## Recommendation

Treat one shared HTTP surface as the target architecture.

For now:

- proceed incrementally
- do not revert existing A2A work just to get there
- ensure new browser/admin features align with the unified-surface direction

## Related

- `docs/plans/cms-on-core.md`
- `interfaces/a2a/src/a2a-interface.ts`
- `interfaces/mcp/src/transports/http-server.ts`
