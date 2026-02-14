# Plan: Sveltia CMS — Git-Based Content Management

## Context

Currently, content in the brain can only be created and edited through the agent (via Matrix, MCP, CLI) or by manually editing markdown files. There's no web-based content management UI. Adding a CMS would let editors browse, create, edit, and delete all entity types through a friendly web interface — without needing to use the agent or know git.

**Sveltia CMS** is a lightweight (~300 KB), open-source, git-based CMS that commits directly to GitHub. It's a drop-in replacement for Decap CMS (formerly Netlify CMS) with better UI, faster loading (GraphQL API), and active development.

### How it works

```
Editor visits yeehaa.io/admin/
    → Sveltia CMS loads (client-side SPA)
    → Authenticates via GitHub (PAT or OAuth)
    → Shows UI for all entity types (auto-generated from entity schemas)
    → On save, commits directly to GitHub via API
    → Git-sync pulls changes → directory-sync imports → entity DB updated
```

### Decisions

| Decision     | Choice                                                                                  |
| ------------ | --------------------------------------------------------------------------------------- |
| CMS          | Sveltia CMS                                                                             |
| Entity types | All — auto-discovered from registered entity adapters                                   |
| Auth         | GitHub PAT (quick/solo) + Cloudflare Workers OAuth (multi-user) — user chooses at login |
| Hosting      | Served as `/admin/` on the existing site                                                |
| Repo         | Points to `brain-data` repo (separate from main `brains` repo)                          |
| Config       | **Generated at build time** from entity adapter Zod schemas — never manually maintained |

## Architecture

### Admin page hosting

The site-builder copies `public/` to the dist output directory during build via `copyStaticAssets()` (preact-builder.ts line 320). The `index.html` is a static file in `public/admin/`. The `config.yml` is **generated during the build** via the `site:build:completed` event handler.

```
public/
└── admin/
    └── index.html          ← Static: Sveltia CMS loader (script tag)

dist/site-production/
└── admin/
    ├── index.html          ← Copied from public/
    └── config.yml          ← Generated at build time from entity schemas
```

The webserver (Hono + `serveStatic`) serves these automatically — no webserver changes needed.

### Config generation

Entity adapters expose their frontmatter schemas via an optional `frontmatterSchema` property on the `EntityAdapter` interface. At build time, the site-builder:

1. Gets all registered entity types via `context.entityService.getEntityTypes()`
2. Gets each adapter via `context.entities.getAdapter(type)`
3. Skips adapters without `frontmatterSchema` (internal/system entities)
4. Maps Zod schema fields to Sveltia CMS widget types
5. Generates `config.yml` with backend config + auto-discovered collections

**Zod → Sveltia widget mapping:**

| Zod type                                                      | Sveltia widget          |
| ------------------------------------------------------------- | ----------------------- |
| `z.string()`                                                  | `string`                |
| `z.string()` with `.datetime()`                               | `datetime`              |
| `z.number()`                                                  | `number`                |
| `z.boolean()`                                                 | `boolean`               |
| `z.enum([...])`                                               | `select` with `options` |
| `z.array(z.string())`                                         | `list`                  |
| `z.object({...})`                                             | `object` (recursive)    |
| `z.string()` (long text fields like `excerpt`, `description`) | `text`                  |
| body/content                                                  | `markdown`              |

The mapping function unwraps `.optional()` / `.default()` wrappers via `_def.typeName` and introspects field types.

### Data flow: CMS → Brain

```
CMS edit → GitHub commit (via API) → remote repo updated
    → git-sync periodic pull (autoSync) → local files updated
    → directory-sync detects file changes → entity DB updated
    → site rebuild triggered
```

**Important**: This requires `autoSync: true` in brain.config.ts so git-sync periodically pulls CMS changes from remote. The event-driven git-sync (now implemented) handles local→remote; `autoSync` handles remote→local.

### Data flow: Brain → CMS

```
Agent creates entity → entity DB updated
    → directory-sync writes .md file
    → git-sync commits + pushes (event-driven, now implemented)
    → remote repo updated → CMS sees changes on next load
```

## Changes

### 0. Prerequisite: Normalize frontmatter schemas

Normalize all 9 adapter frontmatter schemas to follow a consistent pattern before adding `frontmatterSchema` to the EntityAdapter interface. See `docs/plans/frontmatter-normalization.md` for details. Covers: deck (status enum fix + move schema), newsletter (add frontmatter schema), project (extract status enum), link (extend baseEntitySchema).

### 1. Add `frontmatterSchema` to EntityAdapter interface

**File**: `shell/entity-service/src/types.ts` (line ~98)

```typescript
/** Optional: Zod schema for frontmatter fields. Used by CMS config generation. */
frontmatterSchema?: z.ZodObject<z.ZodRawShape>;
```

Optional = backward-compatible. Adapters without it are skipped by the CMS generator.

### 2. Expose `frontmatterSchema` on 9 adapters

One line each — `public readonly frontmatterSchema = theSchema;`:

| Adapter file                                               | Schema                                           |
| ---------------------------------------------------------- | ------------------------------------------------ |
| `plugins/blog/src/adapters/blog-post-adapter.ts`           | `blogPostFrontmatterSchema` (already imported)   |
| `plugins/blog/src/adapters/series-adapter.ts`              | `seriesFrontmatterSchema`                        |
| `plugins/note/src/adapters/note-adapter.ts`                | `noteFrontmatterSchema`                          |
| `plugins/link/src/adapters/link-adapter.ts`                | `linkFrontmatterSchema`                          |
| `plugins/portfolio/src/adapters/project-adapter.ts`        | `projectFrontmatterSchema`                       |
| `plugins/decks/src/formatters/deck-formatter.ts`           | `deckFrontmatterSchema` (after prerequisite fix) |
| `plugins/social-media/src/adapters/social-post-adapter.ts` | `socialPostFrontmatterSchema`                    |
| `plugins/newsletter/src/adapters/newsletter-adapter.ts`    | `newsletterMetadataSchema` (used as frontmatter) |
| `plugins/products/src/adapters/product-adapter.ts`         | `productFrontmatterSchema`                       |

**Skipped** (no CMS collection): image, topic, site-info, site-content, summary, overview.

### 3. CMS config generator (new file)

**File**: `plugins/site-builder/src/lib/cms-config.ts`

Two main functions:

**`zodFieldToCmsWidget(name, fieldSchema)`** — Maps a single Zod field to a Sveltia CMS widget descriptor. Unwraps `.optional()` / `.default()` wrappers, then maps based on inner type.

**`generateCmsConfig(options)`** — Iterates entity types, skips adapters without `frontmatterSchema`, maps fields, appends body field, builds collections. Uses `entityRouteConfig` for labels when available.

```typescript
interface CmsConfigOptions {
  repo: string;
  branch: string;
  baseUrl?: string;
  entityTypes: string[];
  getAdapter: (type: string) => EntityAdapter<BaseEntity>;
  entityRouteConfig?: EntityRouteConfig;
}
```

### 4. Add `cms` config to site-builder schema

**File**: `plugins/site-builder/src/config.ts`

```typescript
cms: z.object({
  repo: z.string(),
  branch: z.string().default("main"),
  baseUrl: z.string().url().optional(),
}).optional(),
```

Opt-in: brains without `cms` config get no CMS files generated.

### 5. Integrate into build pipeline

**File**: `plugins/site-builder/src/plugin.ts` (in `site:build:completed` handler, after sitemap generation ~line 279)

```typescript
if (this.config.cms) {
  const entityTypes = context.entityService.getEntityTypes();
  const cmsConfig = generateCmsConfig({
    repo: this.config.cms.repo,
    branch: this.config.cms.branch,
    baseUrl: this.config.cms.baseUrl,
    entityTypes,
    getAdapter: (type) => context.entities.getAdapter(type),
    entityRouteConfig: this.config.entityRouteConfig,
  });
  const adminDir = join(payload.outputDir, "admin");
  await fs.mkdir(adminDir, { recursive: true });
  await fs.writeFile(join(adminDir, "config.yml"), toYaml(cmsConfig));
}
```

### 6. Static admin page (new file)

**File**: `apps/professional-brain/public/admin/index.html`

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Content Manager</title>
  </head>
  <body>
    <script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>
  </body>
</html>
```

### 7. Update brain.config.ts

**File**: `apps/professional-brain/brain.config.ts`

Add CMS config to site-builder:

```typescript
siteBuilderPlugin({
  // ...existing config...
  cms: {
    repo: "rizom-ai/brain-data",
    branch: "main",
    baseUrl: process.env["CMS_AUTH_URL"],
  },
}),
```

Enable autoSync on git-sync (for CMS → brain pull):

```typescript
new GitSyncPlugin({
  // ...existing config...
  autoSync: true,
  syncInterval: 1,
}),
```

### 8. Cloudflare Workers OAuth (deployment task)

Deploy [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) to Cloudflare Workers:

- Create GitHub OAuth App (Settings → Developer settings → OAuth Apps)
  - Callback URL: `https://cms-auth.yeehaa.workers.dev/callback`
- Deploy the Worker with `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` secrets
- Set `CMS_AUTH_URL` environment variable to the Worker URL

Single users can also use a GitHub PAT directly in the Sveltia login screen — both options available simultaneously.

## Interaction with other plans

| Plan                      | Interaction                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Git-sync event-driven** | ✅ Done. Handles agent→CMS direction (local entity changes push to remote). CMS plan adds `autoSync: true` for reverse direction. |
| **Image multi-provider**  | Images generated by agent appear in CMS after git-sync pushes. CMS-uploaded images handled by image adapter on import.            |
| **Discord interface**     | Independent — Discord and CMS are parallel interfaces to the same brain.                                                          |

## Implementation order

1. Normalize frontmatter schemas (see `docs/plans/frontmatter-normalization.md`)
2. Write tests (`plugins/site-builder/test/cms-config.test.ts`)
3. Create CMS config generator (`plugins/site-builder/src/lib/cms-config.ts`)
4. Add `frontmatterSchema` to EntityAdapter interface
5. Add `frontmatterSchema` to 9 adapters
6. Add `cms` to site-builder config schema
7. Integrate into build pipeline (`plugin.ts`)
8. Create `admin/index.html`
9. Update `brain.config.ts`
10. Full typecheck + tests

## Key files

| File                                              | Change                                        |
| ------------------------------------------------- | --------------------------------------------- |
| `shell/entity-service/src/types.ts`               | Add `frontmatterSchema?` to EntityAdapter     |
| `plugins/site-builder/src/lib/cms-config.ts`      | New: Zod→widget mapping + config generator    |
| `plugins/site-builder/test/cms-config.test.ts`    | New: unit tests                               |
| `plugins/site-builder/src/config.ts`              | Add optional `cms` field                      |
| `plugins/site-builder/src/plugin.ts`              | Generate config.yml in `site:build:completed` |
| `apps/professional-brain/public/admin/index.html` | New: Sveltia CMS loader                       |
| `apps/professional-brain/brain.config.ts`         | Add cms config + enable autoSync              |
| See `docs/plans/frontmatter-normalization.md`     | Deck, newsletter, project, link schema fixes  |
| 9 adapter files                                   | Add `frontmatterSchema` property              |

## Verification

1. `bun run typecheck` — no errors
2. `bun test` in `plugins/site-builder` — cms-config tests pass
3. `bun test` across all plugins — no regressions
4. Build site → verify `admin/config.yml` in output
5. Visit `/admin/` → Sveltia CMS loads with auto-discovered collections
6. Log in with GitHub PAT → see all entity types as collections
