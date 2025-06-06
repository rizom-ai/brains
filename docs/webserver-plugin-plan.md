# Webserver Plugin Planning Document

## Overview

The Webserver plugin provides a read-only web interface for the Personal Brain, generating and serving a static website from brain content. It runs as an interface plugin within the brain process and uses Astro for static site generation.

## Architecture Decisions

### Core Technology Stack

- **Astro** - Static site generator with excellent Markdown support
- **Bun** - Runtime and package manager (Astro runs on Bun)
- **Tailwind CSS** - Utility-first CSS framework
- **Plain Astro Components** - No React/Vue/Svelte unless needed for interactivity

### Integration Model

- **Interface Plugin** - Runs inside the brain process
- **Direct Access** - Uses EntityService directly, no MCP overhead
- **Manual Builds** - Site generation triggered by user command
- **Static Output** - Generates static HTML files for serving
- **HTTP Only** - No HTTPS in plugin, use CDN/proxy for SSL

### Architecture Components

1. **ContentGenerator** - Queries brain entities, generates YAML/markdown files
2. **SiteBuilder** - Runs Astro build process
3. **ServerManager** - Manages preview/production HTTP servers using Hono

### Server Strategy

- **Preview Server** (port 4321) - For testing changes before publishing
- **Production Server** (port 8080) - For serving the live site
- **SSL via CDN/Proxy** - Use Cloudflare, Caddy, or tunnels for HTTPS

## Implementation Phases

### Phase 0: Simple Landing Page (Starting Point)

**Goal**: Get a working webserver plugin with minimal complexity while establishing the foundation for future growth.

**What it includes:**

- Single landing page showing brain statistics
- Astro setup with Content Collections from the start
- Basic plugin structure with MCP tools
- Minimal viable product that can be enhanced incrementally

**Why start here:**

- Immediate visual feedback
- Establishes the plugin architecture
- Tests the build/serve workflow
- Uses Astro properly from the beginning (no rewrites needed)

**Landing Page Content Collection:**

```typescript
// src/content/config.ts
const landing = defineCollection({
  type: "data",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    stats: z.object({
      noteCount: z.number(),
      tagCount: z.number(),
      lastUpdated: z.string(),
    }),
    recentNotes: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        created: z.string(),
      }),
    ),
  }),
});
```

**Minimal Directory Structure (Phase 0):**

```
packages/webserver-plugin/
├── src/
│   ├── index.ts            # Plugin registration
│   ├── builder.ts          # Generates landing.yaml
│   ├── tools.ts            # Just generate_landing_page tool
│   └── astro-site/
│       ├── src/
│       │   ├── content/
│       │   │   ├── config.ts
│       │   │   └── landing/
│       │   │       └── site.yaml  # Generated
│       │   └── pages/
│       │       └── index.astro
│       └── package.json    # Minimal: astro, tailwind
```

**Benefits of this approach:**

- Content Collections architecture established from day one
- Landing page data is version-controlled and typed
- Easy to add notes/articles collections later
- Astro dev server provides hot reload
- Can deploy just the landing page initially

### Phase 1: Full Implementation

(Everything from the original plan - articles, notes, multiple pages, etc.)

## Plugin Architecture

### High-Level Flow

```
1. User triggers build via MCP tool
2. Plugin queries entities from brain
3. Writes content to Astro content collections
4. Runs Astro build process
5. Serves static files via Bun HTTP server
```

### Directory Structure

```
packages/webserver-plugin/
├── src/
│   ├── index.ts            # Plugin registration
│   ├── builder.ts          # Site building orchestration
│   ├── server.ts           # Static file server
│   ├── tools.ts            # MCP tool definitions
│   └── astro-site/         # Astro project
│       ├── src/
│       │   ├── content/
│       │   │   └── config.ts
│       │   ├── components/
│       │   │   ├── Layout.astro
│       │   │   ├── ArticleCard.astro
│       │   │   └── Navigation.astro
│       │   ├── pages/
│       │   │   ├── index.astro
│       │   │   ├── articles/
│       │   │   │   └── [...slug].astro
│       │   │   └── notes/
│       │   │       └── [...slug].astro
│       │   └── styles/
│       │       └── global.css
│       ├── astro.config.mjs
│       ├── tailwind.config.mjs
│       └── package.json
├── test/
├── package.json
└── README.md
```

## Content Mapping

### Entity to Astro Collections

```typescript
// Brain Entity → Astro Collection
Article → src/content/articles/
Note → src/content/notes/
```

### Frontmatter Preservation

All entity metadata is preserved in Astro frontmatter:

- Standard fields: id, title, tags, created, updated
- Article fields: publishedAt, series, seriesPart
- Used for sorting, filtering, and display

### URL Structure

- `/` - Homepage with recent articles
- `/articles/[slug]` - Individual article pages
- `/articles` - Article listing page
- `/notes` - Public notes listing
- `/tags/[tag]` - Content by tag
- `/series/[series]` - Article series pages

## MCP Tools

### Site Management

1. `build_site` - Generate static site

   - Options: `clean` (force full rebuild)
   - Returns: Build status and statistics

2. `start_webserver` - Start serving the site

   - Options: `port` (default: 3000)
   - Returns: Server URL

3. `stop_webserver` - Stop the web server

   - Returns: Confirmation

4. `get_site_status` - Check server and build status
   - Returns: Server state, last build time, content stats

### Content Control

5. `set_content_visibility` - Control what's public

   - Parameters: `entityType`, `visibility` (public/private)
   - Default: Articles public, Notes private

6. `preview_site` - One-command build + serve
   - Combines build_site and start_webserver
   - Returns: Preview URL

## Build Process

### Step 1: Content Sync

```typescript
async syncContent() {
  // Query published articles
  const articles = await entityService.listEntities('article', {
    filter: { publishedAt: { $ne: null } }
  });

  // Write to Astro collections
  for (const article of articles) {
    await writeContentFile('articles', article);
  }
}
```

### Step 2: Astro Build

```typescript
async buildAstro() {
  // Run Astro build command
  const proc = Bun.spawn(['bun', 'run', 'build'], {
    cwd: './astro-site',
    env: { ...process.env }
  });

  await proc.exited;
}
```

### Step 3: Serve Static Files

```typescript
async startServer(port: number) {
  Bun.serve({
    port,
    async fetch(req) {
      // Serve files from astro-site/dist/
      return serveStaticFile(req);
    }
  });
}
```

## Astro Configuration

### Key Integrations

```javascript
// astro.config.mjs
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  integrations: [tailwind(), sitemap()],
  site: "https://yourdomain.com", // Configurable
  output: "static",
});
```

### Content Collections Schema

```typescript
// src/content/config.ts
import { z, defineCollection } from "astro:content";

const articles = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()),
    publishedAt: z.string(),
    series: z.string().optional(),
    seriesPart: z.number().optional(),
  }),
});
```

## Features

### Phase 1 (MVP)

- ✅ Static site generation from brain content
- ✅ Article and Note pages
- ✅ Homepage with recent articles
- ✅ Tag-based filtering
- ✅ Series navigation
- ✅ RSS feed
- ✅ Sitemap
- ✅ Responsive design with Tailwind

### Phase 2 (Enhancements)

- 🔄 Search functionality (client-side)
- 🔄 Dark mode toggle
- 🔄 Reading progress indicator
- 🔄 Table of contents for articles
- 🔄 Social sharing buttons
- 🔄 Analytics integration

### Phase 3 (Future)

- 🔮 Incremental builds
- 🔮 Hot reload during development
- 🔮 Admin interface
- 🔮 Comments system
- 🔮 Newsletter subscription

## Configuration

### Plugin Options

```typescript
interface WebserverPluginOptions {
  // Build settings
  outputDir?: string; // Default: "./dist"

  // Server settings
  defaultPort?: number; // Default: 3000
  hostname?: string; // Default: "localhost"

  // Site metadata
  siteUrl?: string; // For sitemap/RSS
  siteTitle?: string; // Site name
  siteDescription?: string; // Meta description

  // Content settings
  articlesPerPage?: number; // Default: 10
  showDrafts?: boolean; // Default: false
}
```

### Usage Example

```typescript
import { webserverPlugin } from "@brains/webserver-plugin";

const plugin = webserverPlugin({
  siteUrl: "https://mybrain.com",
  siteTitle: "My Digital Brain",
  defaultPort: 8080,
});
```

## Success Criteria

1. ✓ Can build static site from brain content
2. ✓ Serves site on configurable port
3. ✓ Only shows published articles
4. ✓ Respects content visibility settings
5. ✓ Generates valid RSS and sitemap
6. ✓ Mobile-responsive design
7. ✓ Fast page loads (static HTML)
8. ✓ SEO-friendly URLs and metadata

## Development Workflow

1. Make changes to brain content
2. Run `build_site` tool
3. Preview with `start_webserver`
4. Iterate until satisfied
5. Deploy dist/ folder to hosting

## Deployment Options

The generated static site can be deployed to:

- **Netlify** - Drop dist/ folder
- **Vercel** - Static export
- **GitHub Pages** - Push to gh-pages branch
- **Cloudflare Pages** - Direct upload
- **Self-hosted** - Nginx/Caddy serving dist/

## Technical Considerations

### Performance

- Pre-render all pages at build time
- Optimize images during build
- Minimal JavaScript (Astro islands only where needed)
- Efficient static file serving

### Security

- No dynamic server-side code
- No database connections in production
- Static files only
- Optional HTTP auth for preview server

### Scalability

- Static files scale infinitely
- CDN-friendly output
- No server-side processing
- Build time grows with content (mitigated by incremental builds later)

## Content Enhancement Workflow

### AI-Generated Content Management

The webserver plugin integrates with the shell's content generation system to provide a fluent workflow for managing AI-generated content. See [Content Generation Integration Plan](./content-generation-integration-plan.md) for full details.

**Key Points:**

1. **Two Entity Types**:
   - `generated-content` (shell): Stores all AI-generated content with context
   - `site-content` (plugin): Stores human-reviewed/edited website content

2. **Content Priority**:
   - Check site-content first (human edits)
   - Check generated-content second (AI cache)
   - Generate new only if neither exists

3. **Promotion Workflow**:
   - All generated content is saved with an entity ID
   - Users can list, preview, and selectively promote content
   - Promoted content becomes site-content entities

4. **Entity Structure for Site Content**:

```typescript
// Entity type: site-content
{
  entityType: "site-content",
  page: "landing",
  section: "hero",
  data: {
    valueProp: "Your digital brain, always learning",
    heroTitle: "Personal Knowledge OS",
    features: [
      "Never forget anything",
      "AI-powered insights",
      "Connect ideas naturally"
    ]
  }
}
```

**Benefits:**

- Every generation is referenceable by ID
- Clear separation between generated and curated content
- Enables iterative improvement of site content
- Full traceability of what prompt created what content
- No lost work - all generations are saved
