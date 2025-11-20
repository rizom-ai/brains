# SEO & Analytics Implementation Plan

> **Status**: Planning
> **Created**: 2025-11-20
> **Estimated Effort**: 6-8 hours

## Executive Summary

The Brains site-builder has **solid SEO fundamentals** (meta tags, RSS feeds) but is **missing critical features** like sitemap.xml and robots.txt. No analytics implementation exists. This document outlines what's implemented, what's missing, and the implementation approach.

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

### ❌ No Analytics Implementation

**What's Missing**:

- No analytics configuration in site-builder
- No script injection mechanism
- No environment variable support for analytics IDs
- No documentation

**Future Plans Reference**:
Mentioned in `docs/plans/site-info-entity-refactor.md` as potential enhancement but not implemented.

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

### Phase 3: Optional Analytics (Medium Priority)

#### 3.1 Add Analytics Config Schema

**Goal**: Support analytics configuration in site-builder

**Implementation** (`plugins/site-builder/src/config.ts`):

```typescript
export const siteBuilderConfigSchema = z.object({
  // ... existing fields
  analytics: z
    .object({
      umami: z
        .object({
          websiteId: z.string(),
          scriptUrl: z.string().url(),
        })
        .optional(),
    })
    .optional(),
});
```

#### 3.2 Modify HeadCollector

**Goal**: Inject analytics script if configured

**Implementation**:

```typescript
interface HeadCollectorOptions {
  defaultTitle: string;
  analytics?: {
    umami?: {
      websiteId: string;
      scriptUrl: string;
    };
  };
}

class HeadCollector {
  generateHeadHTML(): string {
    const tags: string[] = [];
    // ... existing meta tags ...

    // Add analytics script if configured
    if (this.options.analytics?.umami) {
      const { websiteId, scriptUrl } = this.options.analytics.umami;
      tags.push(
        `<script defer src="${this.escapeHtml(scriptUrl)}" ` +
          `data-website-id="${this.escapeHtml(websiteId)}"></script>`,
      );
    }

    return tags.join("\n    ");
  }
}
```

#### 3.3 Environment Variable Support

**Goal**: Configure analytics per app via .env

**Environment variables** (`.env.production`):

```bash
# Optional - Umami Analytics
UMAMI_WEBSITE_ID=abc123-def456-ghi789
UMAMI_SCRIPT_URL=https://analytics.example.com/script.js
```

**Usage in brain.config.ts**:

```typescript
siteBuilderPlugin({
  // ... existing config
  analytics: {
    umami: process.env.UMAMI_WEBSITE_ID
      ? {
          websiteId: process.env.UMAMI_WEBSITE_ID,
          scriptUrl:
            process.env.UMAMI_SCRIPT_URL ?? "https://cloud.umami.is/script.js",
        }
      : undefined,
  },
});
```

**Benefits**:

- No analytics by default
- Each app opts in via environment variables
- Works immediately (no site-info refactor needed)
- Supports both self-hosted and cloud Umami

---

### Phase 4: Self-Hosted Analytics (Optional, Low Priority)

#### 4.1 Docker Compose for Umami

**Goal**: Optional self-hosted analytics deployment

**Create** `deploy/docker/docker-compose.analytics.yml`:

```yaml
version: "3.8"

services:
  umami:
    image: ghcr.io/umami-software/umami:postgresql-latest
    container_name: brain-analytics
    environment:
      DATABASE_URL: postgresql://umami:${UMAMI_DB_PASSWORD}@umami-db:5432/umami
      DATABASE_TYPE: postgresql
      APP_SECRET: ${UMAMI_APP_SECRET}
    depends_on:
      - umami-db
    restart: unless-stopped
    ports:
      - "3001:3000"
    profiles:
      - analytics

  umami-db:
    image: postgres:15-alpine
    container_name: brain-analytics-db
    environment:
      POSTGRES_DB: umami
      POSTGRES_USER: umami
      POSTGRES_PASSWORD: ${UMAMI_DB_PASSWORD}
    volumes:
      - umami-data:/var/lib/postgresql/data
    restart: unless-stopped
    profiles:
      - analytics

volumes:
  umami-data:
```

#### 4.2 Usage

**Start with analytics**:

```bash
docker-compose \
  -f docker-compose.yml \
  -f docker-compose.analytics.yml \
  --profile analytics up -d
```

**Start without analytics**:

```bash
docker-compose up -d
```

#### 4.3 Caddy Configuration

**Add reverse proxy** for analytics subdomain:

```
analytics.example.com {
  reverse_proxy brain-analytics:3000
}
```

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

### Analytics

- [ ] Umami script loads when configured
- [ ] Umami script does NOT load when not configured
- [ ] Page views tracked in Umami dashboard
- [ ] No errors in browser console
- [ ] Script uses `defer` attribute for performance
- [ ] Website ID is correctly escaped in HTML
- [ ] Works in both preview and production environments

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

### Phase 4: Analytics (2-3 hours)

1. Add analytics config schema
2. Modify HeadCollector
3. Add environment variable support
4. Document Umami setup

**Why fourth**: Optional feature, can be done independently

### Phase 5: Self-Hosted Analytics (1 hour)

1. Create docker-compose.analytics.yml
2. Add Caddy config
3. Document deployment

**Why last**: Completely optional, only if self-hosting desired

---

## 6. Configuration Examples

### Environment Variables

```bash
# Core Configuration
DOMAIN=example.com
PREVIEW_DOMAIN=preview.example.com

# Analytics (Optional)
UMAMI_WEBSITE_ID=abc123-def456
UMAMI_SCRIPT_URL=https://analytics.example.com/script.js

# Self-Hosted Umami (Optional)
UMAMI_DB_PASSWORD=secure-random-password
UMAMI_APP_SECRET=another-secure-random-string
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
        umami: process.env.UMAMI_WEBSITE_ID
          ? {
              websiteId: process.env.UMAMI_WEBSITE_ID,
              scriptUrl:
                process.env.UMAMI_SCRIPT_URL ??
                "https://cloud.umami.is/script.js",
            }
          : undefined,
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

### Nice-to-Have Features

❌ Analytics support (Umami integration)
❌ Self-hosted analytics option
❌ OG images for social sharing

### Implementation Approach

- **Event-driven**: Subscribe to `site:build:completed` for sitemap/robots.txt (follows RSS pattern)
- **Environment variables**: For analytics (faster than waiting for site-info refactor)
- **HeadCollector injection**: Centralized, SSR-compatible analytics
- **Docker Compose profiles**: Clean separation for optional services

### Resources Required

- **Time**: 6-8 hours for complete implementation
- **RAM**: +100-150MB if self-hosting Umami (negligible on cx33)
- **Testing**: Both preview and production environments

---

## 8. References

- **HeadCollector**: `plugins/site-builder/src/lib/head-collector.ts`
- **RSS Generator**: `plugins/blog/src/rss/feed-generator.ts`
- **PreactBuilder**: `plugins/site-builder/src/lib/preact-builder.ts`
- **Site Build Handler**: `plugins/site-builder/src/jobs/site-build-job-handler.ts`
- **Blog Templates**: `plugins/blog/src/templates/`
- **Professional Site Templates**: `plugins/professional-site/src/templates/`

---

**Next Steps**: Begin Phase 1 implementation after approval.
