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

The site-builder copies `public/` to the dist output directory during build. The `index.html` is a static file in `public/admin/`. The `config.yml` is **generated during the build** from registered entity adapters.

```
public/
└── admin/
    └── index.html          ← Static: Sveltia CMS loader (script tag)

dist/site-production/
└── admin/
    ├── index.html          ← Copied from public/
    └── config.yml          ← Generated at build time from entity schemas
```

The webserver (Hono + `serveStatic`) serves these automatically.

### Config generation

Entity adapters already define their frontmatter schemas as Zod objects. At build time, the site-builder:

1. Iterates over all registered entity types via `entityService`
2. Gets each adapter's frontmatter schema
3. Maps Zod schema fields to Sveltia CMS widget types
4. Generates `config.yml` with backend config + auto-discovered collections

**Zod → Sveltia widget mapping:**

| Zod type                                                      | Sveltia widget          |
| ------------------------------------------------------------- | ----------------------- |
| `z.string()`                                                  | `string`                |
| `z.string()` with `.url()`                                    | `string`                |
| `z.number()`                                                  | `number`                |
| `z.boolean()`                                                 | `boolean`               |
| `z.enum([...])`                                               | `select` with `options` |
| `z.string().datetime()` / date-like                           | `datetime`              |
| `z.array(z.string())`                                         | `list`                  |
| `z.string()` (long text fields like `excerpt`, `description`) | `text`                  |
| body/content                                                  | `markdown`              |

The mapping function introspects Zod schemas via `schema.shape` (for `ZodObject`) and checks field types via `instanceof` or `_def.typeName`.

### Data flow: CMS → Brain

```
CMS edit → GitHub commit (via API) → remote repo updated
    → git-sync periodic pull (autoSync) → local files updated
    → directory-sync detects file changes → entity DB updated
    → site rebuild triggered
```

**Important**: This requires `autoSync: true` in brain.config.ts so git-sync periodically pulls CMS changes from remote. The event-driven git-sync plan handles local→remote; `autoSync` handles remote→local.

### Data flow: Brain → CMS

```
Agent creates entity → entity DB updated
    → directory-sync writes .md file
    → git-sync commits + pushes (event-driven)
    → remote repo updated → CMS sees changes on next load
```

## Changes

### 1. `apps/professional-brain/public/admin/index.html` (new)

Minimal static HTML that loads Sveltia CMS:

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

### 2. CMS config generator (new utility)

A function that takes registered entity adapters and produces a Sveltia CMS config object. Called during site build, output written to `dist/.../admin/config.yml`.

```typescript
// Pseudocode for the generator
function generateCmsConfig(
  entityService: EntityService,
  options: { repo: string; branch: string; baseUrl: string },
): CmsConfig {
  const collections = [];

  for (const [entityType, adapter] of entityService.getAdapters()) {
    const schema = adapter.frontmatterSchema;
    const fields = zodSchemaToWidgetFields(schema);

    // Add the markdown body field
    fields.push({ label: "Body", name: "body", widget: "markdown" });

    collections.push({
      name: entityType,
      label: humanize(entityType), // "social-post" → "Social Posts"
      folder: entityType, // Directory in brain-data
      create: true,
      extension: "md",
      slug: "{{title}}",
      fields,
    });
  }

  return {
    backend: {
      name: "github",
      repo: options.repo,
      branch: options.branch,
      base_url: options.baseUrl,
    },
    media_folder: "image",
    public_folder: "/images",
    collections,
  };
}
```

The `zodSchemaToWidgetFields()` function inspects each field in the Zod schema shape and maps it:

```typescript
function zodSchemaToWidgetFields(schema: z.ZodObject<any>): CmsField[] {
  const fields: CmsField[] = [];

  for (const [name, fieldSchema] of Object.entries(schema.shape)) {
    const unwrapped = unwrapOptional(fieldSchema); // Handle .optional()
    const required = !isOptional(fieldSchema);

    if (unwrapped instanceof z.ZodEnum) {
      fields.push({
        label: humanize(name),
        name,
        widget: "select",
        options: unwrapped.options,
        required,
      });
    } else if (unwrapped instanceof z.ZodNumber) {
      fields.push({ label: humanize(name), name, widget: "number", required });
    } else if (unwrapped instanceof z.ZodBoolean) {
      fields.push({ label: humanize(name), name, widget: "boolean", required });
    } else if (unwrapped instanceof z.ZodArray) {
      fields.push({ label: humanize(name), name, widget: "list", required });
    } else if (isDateTimeField(unwrapped)) {
      fields.push({
        label: humanize(name),
        name,
        widget: "datetime",
        required,
      });
    } else {
      // Default to string
      fields.push({ label: humanize(name), name, widget: "string", required });
    }
  }

  return fields;
}
```

### 3. Site-builder integration

During `buildSite()`, after copying static assets, generate and write `admin/config.yml`:

```typescript
// In site-builder build process
const cmsConfig = generateCmsConfig(entityService, {
  repo: "rizom-ai/brain-data",
  branch: "main",
  baseUrl: "https://cms-auth.yeehaa.workers.dev",
});
writeFileSync(join(outputDir, "admin", "config.yml"), toYaml(cmsConfig));
```

The CMS repo/branch/baseUrl should come from configuration (brain.config.ts or environment variables), not be hardcoded.

### 4. Cloudflare Workers OAuth

Deploy [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) to Cloudflare Workers:

- Create GitHub OAuth App (Settings → Developer settings → OAuth Apps)
  - Callback URL: `https://cms-auth.yeehaa.workers.dev/callback`
- Deploy the Worker with `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` secrets
- Set `base_url` in the generated config to the Worker URL

This gives multi-user OAuth. Single users can also use a GitHub PAT directly in the Sveltia login screen — both options available simultaneously.

### 5. `apps/professional-brain/brain.config.ts` — Enable autoSync

For CMS changes (remote → local) to flow back, git-sync needs periodic pulls:

```typescript
new GitSyncPlugin({
  // ...existing config...
  autoSync: true,         // Enable periodic pull from remote
  syncInterval: 1,        // Pull every 1 minute
}),
```

This works alongside the event-driven commit/push (local → remote) from the git-sync plan.

## Interaction with other plans

| Plan                      | Interaction                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Git-sync event-driven** | Handles agent→CMS direction (local entity changes push to remote). CMS plan adds `autoSync: true` for the reverse direction (CMS→agent).    |
| **Image multi-provider**  | Images generated by the agent appear in the CMS after git-sync pushes. CMS-uploaded images need the image adapter to handle them on import. |
| **Discord interface**     | Independent — Discord and CMS are parallel interfaces to the same brain.                                                                    |

## Files

| File                                                                            | Change                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/professional-brain/public/admin/index.html`                               | New — Sveltia CMS loader                                     |
| New utility (location TBD, likely `shared/` or `plugins/site-builder/src/lib/`) | CMS config generator: Zod schema → Sveltia collections       |
| `plugins/site-builder/src/lib/preact-builder.ts` or `site-builder.ts`           | Call config generator during build, write `admin/config.yml` |
| `apps/professional-brain/brain.config.ts`                                       | Enable `autoSync: true` + set `syncInterval: 1`              |

## Verification

1. **Config generation test**: Unit test that generates config from known entity schemas and verifies correct widget mapping
2. **Local test**: Run the brain app, visit `http://localhost:8080/admin/` → Sveltia CMS loads with auto-discovered collections
3. **Auth test**: Log in with GitHub PAT → see all entity types as collections
4. **Edit test**: Edit a blog post in CMS → verify commit appears in GitHub → verify git-sync pulls it → verify entity DB updated
5. **Create test**: Create a new note in CMS → verify it appears in the brain after sync
6. **Reverse test**: Create an entity via agent → verify it appears in CMS after push
7. **New entity type test**: Register a new entity type → rebuild → verify it appears in CMS automatically
8. **Multi-user test**: Deploy Cloudflare Workers OAuth → verify OAuth login works

## Key reference files

- `plugins/site-builder/src/lib/preact-builder.ts` — `copyStaticAssets()` copies `public/` to dist (line 320-351)
- `interfaces/webserver/src/server-manager.ts` — Hono serves static files from dist
- `plugins/git-sync/src/plugin.ts` — event subscriptions and autoSync
- `plugins/directory-sync/src/plugin.ts` — entity file import on pull (lines 500-560)
- Entity adapters in `shared/` — frontmatter schemas for each entity type (e.g., `shared/blog/src/schemas/`, `shared/deck/src/schemas/`)
