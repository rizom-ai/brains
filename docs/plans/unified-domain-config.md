# Plan: Unified Domain Configuration

## Context

The same domain is configured 3-4 times per brain instance across different plugin configs:

| Config key                        | Where               | Actually used for                     |
| --------------------------------- | ------------------- | ------------------------------------- |
| `domain` (top-level, deploy only) | `deploy/brain.yaml` | Caddy routing                         |
| `webserver.productionDomain`      | `brain.yaml`        | Health check display only             |
| `webserver.previewDomain`         | `brain.yaml`        | Health check display only             |
| `site-builder.productionUrl`      | Not in brain.yaml   | SEO, RSS, sitemap                     |
| `site-builder.previewUrl`         | Not in brain.yaml   | Preview builds                        |
| `a2a.domain`                      | `brain.yaml`        | Agent Card URL                        |
| `site-builder.cms.baseUrl`        | Not in brain.yaml   | Sveltia CMS GitHub backend `base_url` |

This means adding a new instance requires configuring the domain in multiple places with slightly different formats (`https://...` vs bare domain). Some aren't even configured — `site-builder.productionUrl` is missing from most brain.yaml files, so RSS/sitemap fall back to "https://example.com".

## Design

Single top-level `domain` in brain.yaml. Everything else derives from it.

```yaml
# brain.yaml — single source of truth
domain: yeehaa.io

plugins:
  site-builder:
    cms:
      repo: rizom-ai/yeehaa-brain-content
      branch: main
```

### Derivation rules

| Derived value     | Formula                    | Example                     |
| ----------------- | -------------------------- | --------------------------- |
| `productionUrl`   | `https://{domain}`         | `https://yeehaa.io`         |
| `previewUrl`      | `https://preview.{domain}` | `https://preview.yeehaa.io` |
| A2A endpoint      | `https://{domain}/a2a`     | `https://yeehaa.io/a2a`     |
| CMS `base_url`    | `https://{domain}`         | `https://yeehaa.io`         |
| Webserver display | derived from domain        | —                           |

### What changes in brain.yaml

```yaml
# Before (professional-brain)
plugins:
  webserver:
    productionDomain: https://yeehaa.io
  a2a:
    domain: yeehaa.io

# After
domain: yeehaa.io
```

### What gets removed from plugin configs

- `webserver.productionDomain` and `webserver.previewDomain` — derive from domain
- `site-builder.productionUrl` and `site-builder.previewUrl` — derive from domain
- `site-builder.cms.baseUrl` — derive from domain
- `a2a.domain` — derive from domain

### What stays

- `site-builder.cms.repo` and `site-builder.cms.branch` — genuinely separate config
- Plugin-specific config that isn't domain-related

### How plugins receive the URL

Brain resolver populates a shared `siteUrl` and `previewUrl` on the resolved config, accessible via context. Plugins read from context instead of their own config:

```typescript
// Before (in site-builder)
const url = this.config.productionUrl;

// After
const url = context.identity.getSiteUrl(); // https://yeehaa.io
const preview = context.identity.getPreviewUrl(); // https://preview.yeehaa.io
```

Identity service already provides brain character and profile — site URLs are a natural fit.

### Local development (no domain)

When `domain` is not set, URLs fall back to `http://localhost:{port}`. This is the dev default — no domain required for local instances.

## Steps

1. Add `domain: z.string().optional()` to instance overrides schema
2. Add `getSiteUrl()` and `getPreviewUrl()` to identity service (derives from domain)
3. Update site-builder to read URLs from identity instead of its own config
4. Update webserver to read domain from identity instead of its own config
5. Update A2A to read domain from identity instead of its own config
6. Update CMS config generation to derive `base_url` from identity
7. Remove deprecated config fields from plugin schemas (keep parsing but warn)
8. Update all brain.yaml files: collapse domain configs into top-level `domain`
9. Update deploy/brain.yaml files

## Key files

| File                                                       | Change                                                |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| `shell/app/src/instance-overrides.ts`                      | Add `domain` field                                    |
| `shell/identity-service/src/*`                             | Add `getSiteUrl()`, `getPreviewUrl()`                 |
| `plugins/site-builder/src/config.ts`                       | Deprecate `productionUrl`, `previewUrl`               |
| `plugins/site-builder/src/handlers/siteBuildJobHandler.ts` | Read URL from identity                                |
| `plugins/site-builder/src/lib/cms-config.ts`               | Derive `base_url` from identity                       |
| `interfaces/webserver/src/config.ts`                       | Deprecate `productionDomain`, `previewDomain`         |
| `interfaces/webserver/src/webserver-interface.ts`          | Read from identity                                    |
| `interfaces/a2a/src/config.ts`                             | Deprecate `domain`                                    |
| `interfaces/a2a/src/agent-card.ts`                         | Read from identity                                    |
| `plugins/blog/src/lib/rss-handler.ts`                      | Already uses message payload — no change              |
| `apps/*/brain.yaml`                                        | Collapse to top-level `domain`                        |
| `apps/*/deploy/brain.yaml`                                 | Already has `domain` — remove plugin-level duplicates |

## Verification

1. `bun run typecheck` / `bun test` / `bun run lint`
2. Site build produces correct URLs in sitemap.xml and robots.txt
3. RSS feed has correct `<link>` URLs
4. A2A Agent Card returns correct endpoint URL
5. CMS config has correct `base_url`
6. Health check displays correct domain
7. Local dev (no domain) falls back to localhost
