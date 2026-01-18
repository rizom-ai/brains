# SEO & Analytics Implementation Plan

> **Status**: Partially Implemented
> **Created**: 2025-11-20
> **Updated**: 2026-01-18
> **Estimated Effort**: 6-8 hours (SEO features remaining)

## Executive Summary

The Brains site-builder has **solid SEO fundamentals** (meta tags, RSS feeds) but is **missing critical features** like sitemap.xml and robots.txt. ~~No analytics implementation exists.~~ **Analytics has been implemented** via a dedicated `analytics` plugin using Cloudflare Web Analytics (see `docs/plans/analytics-plugin.md`). This document outlines what's implemented, what's missing, and the implementation approach for the remaining SEO features.

---

## 1. Current SEO Implementation

### ✅ What Already Exists

#### Meta Tags System (HeadCollector + Head Component)

**Location**: `plugins/site-builder/src/lib/head-collector.ts`

**Features**:

- Title tags
- Meta descriptions
- Open Graph tags (og:title, og:description, og:type, og:image)
- Twitter Card tags
- Canonical URLs
- Favicon references
- Proper HTML escaping for security

**Example output**:

```html
<title>Essays</title>
<meta name="description" content="Browse all essays" />
<meta property="og:title" content="Essays" />
<meta property="og:description" content="Browse all essays" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="canonical" href="/essays" />
```

#### RSS Feed Generation

**Location**: `plugins/blog/src/rss/feed-generator.ts`

**Features**:

- Auto-generates on `site:build:completed` event
- RSS 2.0 format
- Different behavior for preview vs production
- Full content via `<content:encoded>` CDATA
- Series support via `<category>` tags
- Outputs to `/feed.xml`

**Current limitation**: Uses default URL `https://example.com` instead of actual domain

---

### ❌ Critical SEO Features MISSING

#### 1. No Sitemap.xml Generation

- **Impact**: Search engines must crawl manually to discover pages
- **Required**: Essential for SEO, especially with many blog posts/decks
- **Status**: Not implemented

#### 2. No robots.txt File

- **Impact**: Cannot control crawler behavior or reference sitemap
- **Required**: Standard SEO best practice
- **Status**: Not implemented

#### 3. Templates Don't Use Head Component

- **Impact**: Pages rely on default meta tags from route definitions
- **Current behavior**: Works but templates can't customize per page
- **Files affected**:
  - `plugins/blog/src/templates/blog-post.tsx`
  - `plugins/blog/src/templates/blog-list.tsx`
  - `plugins/professional-site/src/templates/homepage-list.tsx`

#### 4. No Static Asset Pipeline

- **Impact**: 404 errors for favicons referenced in HTML
- **Current behavior**: HTML references `/favicon.svg` and `/favicon.png` but files aren't copied
- **Status**: CSS works (Tailwind generates it), but static assets don't

---

## 2. Analytics - Current State

### ✅ Analytics Implemented (via dedicated plugin)

**What's Been Implemented**:

- Dedicated `analytics` plugin created (see `docs/plans/analytics-plugin.md`)
- Cloudflare Web Analytics integration (privacy-focused, GDPR compliant, free)
- Terraform module for provisioning (`modules/cloudflare-analytics`)
- Tracking script injection via site-builder
- LinkedIn social metrics via messaging to social-media plugin
- MCP tools: `analytics_fetch_website`, `analytics_get_website_trends`, `analytics_fetch_social`, `analytics_get_social_summary`

**Note**: The original Umami-based approach in this document was superseded by the Cloudflare Web Analytics implementation. See `docs/plans/analytics-plugin.md` for the current architecture.

---

## 3. Implementation Approach

### Phase 1: Core SEO Fixes (High Priority)

#### 1.1 Static Asset Pipeline

**Goal**: Copy files from `public/` directory to dist

**Implementation**:

- Add `copyStaticAssets()` method to PreactBuilder
- Check for `public/` directory in app root
- Copy all files recursively to output directory
- Log files copied for debugging

**Directory structure**:

```
apps/professional-brain/
  public/
    favicon.svg
    favicon.png
    images/
      og-image.png
```

#### 1.2 Sitemap.xml Generation

**Goal**: Auto-generate sitemap from all routes

**Implementation**:

- Create `plugins/site-builder/src/lib/sitemap-generator.ts`
- Subscribe to `site:build:completed` event
- Generate sitemap XML from routes array
- Write to `{outputDir}/sitemap.xml`
- Include lastmod, changefreq, priority

**XML structure**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2025-11-20T00:00:00.000Z</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <!-- ... more URLs -->
</urlset>
```

#### 1.3 robots.txt Generation

**Goal**: Control crawler behavior, reference sitemap

**Implementation**:

- Generate on `site:build:completed` event
- Preview environment: Disallow all crawling
- Production environment: Allow all, reference sitemap
- Write to `{outputDir}/robots.txt`

**Content (production)**:

```
User-agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml
```

**Content (preview)**:

```
User-agent: *
Disallow: /

Sitemap: https://preview.example.com/sitemap.xml
```

#### 1.4 Fix RSS Feed URL

**Goal**: Use actual domain from config

**Implementation**:

- Pass siteConfig to RSS feed generator via event payload
- Use `siteConfig.url` instead of hardcoded default
- Fall back to `https://example.com` if not configured

---

### Phase 2: Enhanced Meta Tags (Medium Priority)

#### 2.1 Export Head Component

**Goal**: Make Head component available to templates

**Implementation**:

- Add exports to `plugins/site-builder/src/index.ts`:
  ```typescript
  export { Head } from "./lib/head-context";
  export type { HeadProps } from "./lib/head-collector";
  ```

#### 2.2 Update Blog Templates

**Goal**: Customize meta tags per blog post

**Implementation** (`blog-post.tsx`):

```typescript
import { Head } from "@brains/site-builder-plugin";

export const BlogPostTemplate = ({ post, ... }) => {
  return (
    <>
      <Head
        title={post.frontmatter.title}
        description={post.frontmatter.excerpt}
        ogImage={post.frontmatter.coverImage}
        ogType="article"
        canonicalUrl={post.url}
      />
      <section className="blog-post-section">
        {/* existing content */}
      </section>
    </>
  );
};
```

Repeat for:

- `blog-list.tsx`
- `deck-detail.tsx` (if exists)
- `deck-list.tsx` (if exists)

#### 2.3 Update Professional Site Templates

**Goal**: Customize homepage meta tags

**Implementation** (`homepage-list.tsx`):

```typescript
import { Head } from "@brains/site-builder-plugin";

export const HomepageListLayout = ({ profile, ... }) => {
  return (
    <>
      <Head
        title={`${profile.name} - ${profile.tagline}`}
        description={profile.intro}
        ogType="website"
      />
      <div>
        {/* existing content */}
      </div>
    </>
  );
};
```

---

### Phase 3: Analytics ✅ COMPLETE

> **Note**: This phase was implemented differently than originally planned. Instead of Umami integration in site-builder, a dedicated `analytics` plugin was created using Cloudflare Web Analytics.

**What was implemented**:

- Dedicated `analytics` plugin with entity storage
- Cloudflare Web Analytics (free, privacy-focused, GDPR compliant)
- Terraform module (`modules/cloudflare-analytics`) for provisioning
- Tracking script injection via site-builder config
- LinkedIn social metrics via messaging to social-media plugin
- Scheduled data collection via cron daemon

**See**: `docs/plans/analytics-plugin.md` for full implementation details.

---

### Phase 4: Self-Hosted Analytics (Superseded)

> **Note**: This phase is no longer needed. Cloudflare Web Analytics is free with unlimited usage and requires no self-hosting infrastructure.

---

## 4. Testing Checklist

### SEO Features

- [ ] sitemap.xml exists at `/sitemap.xml` after build
- [ ] sitemap.xml includes all routes (static + entity pages)
- [ ] robots.txt exists at `/robots.txt`
- [ ] robots.txt references sitemap URL
- [ ] Preview environment robots.txt disallows crawling
- [ ] Production robots.txt allows crawling
- [ ] Favicons load without 404 errors
- [ ] RSS feed uses actual domain from config
- [ ] Blog posts have custom meta tags (title, description, og:image)
- [ ] Canonical URLs are set correctly

### Analytics ✅ COMPLETE

- [x] Cloudflare tracking script loads when configured
- [x] Tracking script does NOT load when not configured
- [x] Page views tracked in Cloudflare Web Analytics dashboard
- [x] No errors in browser console
- [x] Script uses `defer` attribute for performance
- [x] Works in both preview and production environments
- [x] `analytics_fetch_website` tool fetches data from Cloudflare GraphQL API
- [x] `analytics_fetch_social` tool fetches LinkedIn metrics via messaging

---

## 5. Implementation Order

### Phase 1: Core SEO (1-2 hours)

1. Add static asset pipeline
2. Generate robots.txt
3. Fix RSS feed URL
4. Test favicon loading

**Why first**: Fixes immediate issues (404s), adds basic SEO

### Phase 2: Sitemap Generation (2-3 hours)

1. Implement sitemap generator
2. Subscribe to `site:build:completed`
3. Test with real routes + entity pages
4. Verify XML is valid

**Why second**: Most important SEO feature for discoverability

### Phase 3: Template Enhancements (1-2 hours)

1. Export Head component
2. Update blog templates
3. Update professional-site templates
4. Test per-page meta customization

**Why third**: Enhances existing functionality, lower priority

### Phase 4: Analytics ✅ COMPLETE

Implemented via dedicated `analytics` plugin with Cloudflare Web Analytics.
See `docs/plans/analytics-plugin.md` for details.

### Phase 5: Self-Hosted Analytics (Superseded)

No longer needed - Cloudflare Web Analytics is free with unlimited usage.

---

## 6. Configuration Examples

### Environment Variables

```bash
# Core Configuration
DOMAIN=example.com
PREVIEW_DOMAIN=preview.example.com

# Analytics (Cloudflare Web Analytics - via Terraform outputs)
CLOUDFLARE_ACCOUNT_ID=xxx
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_ANALYTICS_SITE_TAG=xxx
CLOUDFLARE_TRACKING_SCRIPT='<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token": "xxx"}\'></script>'
```

### Brain Config

```typescript
// apps/professional-brain/brain.config.ts
export default brainAppConfig({
  plugins: [
    siteBuilderPlugin({
      routes,
      entityRouteConfig,
      layouts,
      themeCSS: yeehaaTheme,
      siteInfo: {
        title: "Yeehaa",
        description: "Building tools for thought",
        url: process.env.DOMAIN ? `https://${process.env.DOMAIN}` : undefined,
      },
      analytics: {
        trackingScript: process.env["CLOUDFLARE_TRACKING_SCRIPT"],
      },
    }),
    analyticsPlugin({
      cloudflare: {
        enabled: true,
        accountId: process.env["CLOUDFLARE_ACCOUNT_ID"]!,
        apiToken: process.env["CLOUDFLARE_API_TOKEN"]!,
        siteTag: process.env["CLOUDFLARE_ANALYTICS_SITE_TAG"]!,
      },
      social: {
        enabled: true,
      },
    }),
    blogPlugin(/* ... */),
  ],
});
```

---

## 7. Summary

### What Works Well

✅ Meta tags (title, description, Open Graph, Twitter Card)
✅ RSS feed generation (auto-generated on build)
✅ Canonical URLs
✅ Clean HTML structure
✅ Theme toggle (prevents FOUC)

### Critical Missing Features

❌ sitemap.xml generation
❌ robots.txt generation
❌ Static asset pipeline (favicons 404)
❌ Templates don't use Head component

### Implemented Features

✅ Analytics support (Cloudflare Web Analytics via dedicated plugin)
✅ LinkedIn social metrics (via messaging to social-media plugin)
✅ Terraform infrastructure for analytics provisioning

### Nice-to-Have Features

❌ OG images for social sharing

### Implementation Approach

- **Event-driven**: Subscribe to `site:build:completed` for sitemap/robots.txt (follows RSS pattern)
- **Terraform**: Infrastructure as code for Cloudflare Web Analytics provisioning
- **HeadCollector injection**: Centralized, SSR-compatible analytics tracking script
- **Dedicated plugin**: Analytics collected and stored as entities for querying

### Resources Required

- **Time**: 3-4 hours for remaining SEO features (Phases 1-3)
- **RAM**: No additional resources (Cloudflare handles analytics infrastructure)
- **Testing**: Both preview and production environments

---

## 8. References

- **HeadCollector**: `plugins/site-builder/src/lib/head-collector.ts`
- **RSS Generator**: `plugins/blog/src/rss/feed-generator.ts`
- **PreactBuilder**: `plugins/site-builder/src/lib/preact-builder.ts`
- **Site Build Handler**: `plugins/site-builder/src/jobs/site-build-job-handler.ts`
- **Blog Templates**: `plugins/blog/src/templates/`
- **Professional Site Templates**: `plugins/professional-site/src/templates/`
- **Analytics Plugin**: `plugins/analytics/`
- **Analytics Plugin Plan**: `docs/plans/analytics-plugin.md`
- **Cloudflare Analytics Terraform**: `apps/professional-brain/deploy/terraform-state/modules/cloudflare-analytics/`

---

**Next Steps**: Begin Phase 1 SEO implementation (static asset pipeline, robots.txt, sitemap.xml).
