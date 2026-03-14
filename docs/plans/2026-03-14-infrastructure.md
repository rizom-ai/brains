# Infrastructure: Varlock + Cloudflare CDN + A2A Protocol

## Overview

Three infrastructure improvements that benefit all brain instances. These are prerequisites for new deployments (mylittlephoney.com) but also improve existing ones (yeehaa.io, rizom.ai, recall.rizom.ai).

## 1. Varlock Env Management

Replace raw `.env` files with [varlock](https://varlock.dev/) for schema-driven env var management across the monorepo.

### Why

- Multiple apps (`professional-brain`, `collective-brain`, `team-brain`, + new instances) each have their own `.env` with overlapping secrets
- No validation — typos or missing vars only discovered at runtime
- AI agents (Claude) can't see config context without exposing secrets
- No secret scanning in pre-commit hooks

### Tasks

- [ ] Install varlock (`bun add -d varlock` at root)
- [ ] Create `.env.schema` at repo root with `@env-spec` annotations for shared vars (`ANTHROPIC_API_KEY`, `GITHUB_TOKEN`)
- [ ] Create per-app `.env.schema` files for app-specific vars (bot tokens, CDN keys)
- [ ] Configure `turbo.json` `globalEnv`/`env` keys for strict mode compatibility
- [ ] Add `varlock scan` to pre-commit hooks
- [ ] Migrate existing `.env` files to use varlock
- [ ] Update `example.env` / docs

## 2. Cloudflare CDN/DNS Provider

Add Cloudflare as an alternative CDN/DNS provider alongside Bunny. See `docs/plans/cloudflare-migration.md` for detailed Terraform implementation.

### Why

- Free tier (CDN, DNS, SSL) vs Bunny's per-GB pricing
- Larger edge network (300+ PoPs)
- DDoS protection included
- Single dashboard for DNS + CDN + security

### Tasks

- [ ] Create `deploy/providers/hetzner/terraform/modules/cloudflare-cdn-dns/` module
  - DNS records (proxied for CDN)
  - SSL settings (full strict)
  - Transform rules (MCP redirect)
- [ ] Add `cdn_provider` variable to `variables.tf` (default: `cloudflare`)
- [ ] Update `main.tf` with conditional module selection (Cloudflare vs Bunny)
- [ ] Update deployment docs with Cloudflare setup instructions
- [ ] Test with mylittlephoney.com domain first, then optionally migrate existing sites

## 3. A2A Protocol (Agent-to-Agent Communication)

Add [A2A protocol](https://a2a-protocol.org/latest/specification/) support so brain instances can discover and collaborate with each other, and be discoverable by external agents.

### Why

- Brain instances are currently isolated — yeehaa.io can't ask rizom.ai for content or delegate tasks
- A2A is the emerging standard (Google → Linux Foundation, 50+ partners, ACP merged in)
- Complements MCP (already in use): MCP = model ↔ tools, A2A = agent ↔ agent
- Built on familiar stack: JSON-RPC 2.0 over HTTP(S), Agent Cards for discovery
- NIST AI Agent Standards Initiative is building around it

### How It Maps to Brains

- **Agent Card** (`/.well-known/agent-card.json`): machine-readable brain identity + capabilities — maps naturally to existing `brain-character` + MCP tool registry
- **Discovery**: brains find each other via Agent Cards (published at their domain)
- **Task exchange**: brains can request content, delegate generation, share topics across instances
- **Auth**: A2A supports authentication — maps to existing permission levels (anchor/public)

### Permission Model

The existing `PermissionService` (anchor/trusted/public, pattern-based rules) supports A2A natively by adding `a2a` as a new interface type. The calling agent is identified by its domain (from Agent Card).

| Scenario       | Pattern                  | Level     | Access                    |
| -------------- | ------------------------ | --------- | ------------------------- |
| Own brains     | `a2a:*.rizom.ai`         | `anchor`  | Full tool access          |
| Known partners | `a2a:mylittlephoney.com` | `trusted` | Restricted tools          |
| Unknown agents | `a2a:*`                  | `public`  | Read-only, public content |

Example brain config:

```typescript
permissions: {
  rules: [
    // ... existing rules ...
    { pattern: "a2a:*.rizom.ai", level: "anchor" },
    { pattern: "a2a:mylittlephoney.com", level: "trusted" },
    { pattern: "a2a:*", level: "public" },
  ],
}
```

The **Agent Card** advertises only `public`-level capabilities by default. Authenticated agents that match a higher-level pattern get access to more tools at runtime (same filtering logic as MCP/Matrix/Discord).

### Tasks

- [ ] Research: read the [A2A spec](https://a2a-protocol.org/latest/specification/) and [reference implementations](https://github.com/a2aproject/A2A)
- [ ] Design: map A2A concepts to brains architecture (Agent Card ↔ brain identity, Tasks ↔ MCP tools)
- [ ] Implement Agent Card generation from brain config + tool registry
- [ ] Add `a2a` as interface type in `PermissionService` (identify callers by domain)
- [ ] Agent Card serves public-level tools; authenticated agents get elevated access
- [ ] Add A2A server endpoint to webserver interface (JSON-RPC handler)
- [ ] Add A2A client capability to shell (discover + call remote agents)
- [ ] Test: two local brain instances communicating via A2A at different permission levels
- [ ] Deploy: publish Agent Cards on existing domains

## Suggested Order

1. **Varlock** first — improves DX for all subsequent work
2. **Cloudflare** second — needed before any new deployment
3. **A2A** third — can develop in parallel once basics are running, but needs working multi-instance setup to test properly
