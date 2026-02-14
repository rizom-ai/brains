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

### 0. ~~Prerequisite: Normalize frontmatter schemas~~ Done

All 9 adapters now follow the consistent frontmatter schema pattern. See `docs/plans/frontmatter-normalization.md` and `docs/plans/newsletter-cleanup.md`.

### 1. Add `frontmatterSchema` to EntityAdapter interface

**File**: `shell/entity-service/src/types.ts` (line ~104, before closing `}`)

```typescript
/** Optional: Zod schema for frontmatter fields. Used by CMS config generation. */
frontmatterSchema?: z.ZodObject<z.ZodRawShape>;
```

Uses `z.ZodObject<z.ZodRawShape>` (not `z.ZodSchema`) because the CMS generator needs `.shape` to iterate over fields and inspect each field's type. Optional = backward-compatible.

### 2. Expose `frontmatterSchema` on 9 adapters

One line each — all already import their frontmatter schema but don't expose it as a property:

| Adapter file                                               | Property to add                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `plugins/blog/src/adapters/blog-post-adapter.ts`           | `public readonly frontmatterSchema = blogPostFrontmatterSchema;`   |
| `plugins/blog/src/adapters/series-adapter.ts`              | `public readonly frontmatterSchema = seriesFrontmatterSchema;`     |
| `plugins/note/src/adapters/note-adapter.ts`                | `public readonly frontmatterSchema = noteFrontmatterSchema;`       |
| `plugins/link/src/adapters/link-adapter.ts`                | `public readonly frontmatterSchema = linkFrontmatterSchema;`       |
| `plugins/portfolio/src/adapters/project-adapter.ts`        | `public readonly frontmatterSchema = projectFrontmatterSchema;`    |
| `plugins/decks/src/formatters/deck-formatter.ts`           | `public readonly frontmatterSchema = deckFrontmatterSchema;`       |
| `plugins/social-media/src/adapters/social-post-adapter.ts` | `public readonly frontmatterSchema = socialPostFrontmatterSchema;` |
| `plugins/newsletter/src/adapters/newsletter-adapter.ts`    | `public readonly frontmatterSchema = newsletterFrontmatterSchema;` |
| `plugins/products/src/adapters/product-adapter.ts`         | `public readonly frontmatterSchema = productFrontmatterSchema;`    |

**Skipped** (no CMS collection): image, topic, site-info, site-content, summary, overview, base.

### 3. CMS config generator (test-first)

**Test file**: `plugins/site-builder/test/lib/cms-config.test.ts`

Tests for `zodFieldToCmsWidget`:

- `z.string()` → `{ widget: "string" }`
- `z.string().datetime()` → `{ widget: "datetime" }` (via `_def.checks`)
- `z.number()` → `{ widget: "number" }`
- `z.boolean()` → `{ widget: "boolean" }`
- `z.enum([...])` → `{ widget: "select", options: [...] }` (via `_def.values`)
- `z.array(z.string())` → `{ widget: "list" }`
- `z.object({...})` → `{ widget: "object", fields: [...] }` (recursive)
- `.optional()` unwraps → `required: false`
- `.default(val)` unwraps → `default: val`
- Named long-text fields (`description`, `excerpt`) → `{ widget: "text" }`

Tests for `generateCmsConfig`:

- Generates correct backend config (`name: "github"`, repo, branch)
- One collection per entity type with `frontmatterSchema`
- Skips adapters without `frontmatterSchema`
- Uses `entityRouteConfig` labels when available
- Sets folder to `entities/{entityType}`, `extension: "md"`, `format: "frontmatter"`
- Adds body field as `{ widget: "markdown" }` at end

**Implementation file**: `plugins/site-builder/src/lib/cms-config.ts`

Zod introspection approach — unwrap `.optional()`/`.default()` wrappers via `_def.typeName`, then map inner type:

```typescript
function unwrapZodType(schema: z.ZodTypeAny): {
  inner: z.ZodTypeAny;
  isOptional: boolean;
  defaultValue?: unknown;
} {
  // Loop unwrapping ZodOptional, ZodDefault, ZodNullable layers
}

function zodFieldToCmsWidget(
  name: string,
  field: z.ZodTypeAny,
): CmsFieldWidget {
  // Unwrap → switch on inner._def.typeName → map to widget
  // ZodString: check _def.checks for { kind: "datetime" }
  // ZodEnum: read _def.values as string[]
  // ZodArray: recurse on _def.type (element schema)
  // ZodObject: recurse on .shape entries
  // Long text heuristic: field names like "description", "excerpt" → text widget
}

function generateCmsConfig(options: CmsConfigOptions): CmsConfig {
  // Iterate entity types → skip if no frontmatterSchema
  // → map .shape entries to widgets → append body field → build collections
}
```

Exports: `zodFieldToCmsWidget` (for testing), `generateCmsConfig`.

### 4. Add `cms` config to site-builder schema

**File**: `plugins/site-builder/src/config.ts` (after `entityRouteConfig`)

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
  const entityTypes = this.pluginContext!.entityService.getEntityTypes();
  const cmsConfig = generateCmsConfig({
    repo: this.config.cms.repo,
    branch: this.config.cms.branch,
    baseUrl: this.config.cms.baseUrl,
    entityTypes,
    getAdapter: (type) => this.pluginContext!.entities.getAdapter(type),
    entityRouteConfig: this.config.entityRouteConfig,
  });
  const adminDir = join(payload.outputDir, "admin");
  await fs.mkdir(adminDir, { recursive: true });
  await fs.writeFile(join(adminDir, "config.yml"), toYaml(cmsConfig), "utf-8");
  this.logger.info("Generated CMS config.yml");
}
```

Imports: `generateCmsConfig` from `./lib/cms-config`, `toYaml` from `@brains/utils`.

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

Copied to output by existing `copyStaticAssets()`. The `config.yml` is generated post-copy in `site:build:completed`.

### 7. Update brain.config.ts

**File**: `apps/professional-brain/brain.config.ts`

Add CMS config to site-builder:

```typescript
cms: {
  repo: "rizom-ai/brain-data",
  branch: "main",
  baseUrl: process.env["CMS_AUTH_URL"],
},
```

Enable autoSync on git-sync (for CMS → brain pull):

```typescript
autoSync: true,
syncInterval: 1,
```

### 8. Cloudflare Workers OAuth (deployment, out of scope for this PR)

Deploy [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) to Cloudflare Workers with GitHub OAuth App credentials. Single users can use GitHub PAT directly without this.

## Interaction with other plans

| Plan                      | Interaction                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Git-sync event-driven** | ✅ Done. Handles agent→CMS direction (local entity changes push to remote). CMS plan adds `autoSync: true` for reverse direction. |
| **Image multi-provider**  | Images generated by agent appear in CMS after git-sync pushes. CMS-uploaded images handled by image adapter on import.            |
| **Discord interface**     | Independent — Discord and CMS are parallel interfaces to the same brain.                                                          |

## Implementation order

1. ~~Normalize frontmatter schemas~~ Done
2. Add `frontmatterSchema` to EntityAdapter interface + 9 adapters (typecheck after)
3. Write CMS config generator tests
4. Implement CMS config generator
5. Add `cms` to site-builder config schema
6. Integrate into build pipeline
7. Create `admin/index.html`
8. Update `brain.config.ts`
9. Full typecheck + tests

## Key files

| File                                               | Change                                        |
| -------------------------------------------------- | --------------------------------------------- |
| `shell/entity-service/src/types.ts`                | Add `frontmatterSchema?` to EntityAdapter     |
| 9 adapter files                                    | Add `frontmatterSchema` property (one line)   |
| `plugins/site-builder/src/lib/cms-config.ts`       | New: Zod→widget mapping + config generator    |
| `plugins/site-builder/test/lib/cms-config.test.ts` | New: unit tests                               |
| `plugins/site-builder/src/config.ts`               | Add optional `cms` field                      |
| `plugins/site-builder/src/plugin.ts`               | Generate config.yml in `site:build:completed` |
| `apps/professional-brain/public/admin/index.html`  | New: Sveltia CMS loader                       |
| `apps/professional-brain/brain.config.ts`          | Add cms config + enable autoSync              |

## Verification

1. `bun run typecheck` — no errors
2. `bun test` in `plugins/site-builder` — cms-config tests pass
3. `bun test` across all plugins — no regressions
4. Build site → verify `admin/config.yml` in output
5. Visit `/admin/` → Sveltia CMS loads with auto-discovered collections
6. Log in with GitHub PAT → see all entity types as collections
