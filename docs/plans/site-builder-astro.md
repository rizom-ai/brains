# Implementation Plan: site-builder-astro Plugin

## Overview

Create `@brains/site-builder-astro` as a parallel alternative to `@brains/site-builder-plugin`. Uses Astro as the SSG engine while maintaining API compatibility, allowing brains to choose which to use.

**Target:** collective-brain (simpler than professional-brain)
**Template Strategy:** Keep Preact via `@astrojs/preact` (no migration needed)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  site-builder-astro plugin                                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Same Public API as site-builder:                   │   │
│  │  - RouteRegistry (routes, entityRouteConfig)        │   │
│  │  - Template registration                            │   │
│  │  - DataSource resolution                            │   │
│  │  - site-build job handler                           │   │
│  │  - site:build:completed event                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Astro Build Adapter                                │   │
│  │  1. Generate Astro project in .astro-work/          │   │
│  │  2. Create content collections from entities        │   │
│  │  3. Generate pages from RouteRegistry               │   │
│  │  4. Run `astro build`                               │   │
│  │  5. Copy output to outputDir                        │   │
│  │  6. Emit site:build:completed                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Plugin Scaffold

**Goal:** Create basic plugin structure with same config interface

**Files to create:**

```
plugins/site-builder-astro/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Plugin export
│   ├── plugin.ts             # ServicePlugin implementation
│   ├── config.ts             # Config schema (same as site-builder)
│   ├── types/
│   │   └── routes.ts         # Re-export RouteDefinition types
│   └── lib/
│       └── route-registry.ts # Copy from site-builder
```

**Key implementation:**

```typescript
// src/plugin.ts
export class SiteBuilderAstroPlugin extends ServicePlugin<SiteBuilderConfig> {
  constructor(config: Partial<SiteBuilderConfig>) {
    super("site-builder-astro", packageJson, config, configSchema);
  }

  async onRegister(context: ServicePluginContext): Promise<void> {
    // Register same job handlers, templates, etc.
    context.jobs.registerHandler("site-build", new AstroBuildHandler(...));
  }
}

// Export factory function with same signature
export function siteBuilderAstroPlugin(config: SiteBuilderConfig) {
  return new SiteBuilderAstroPlugin(config);
}
```

### Phase 2: Content Collection Bridge

**Goal:** Create brain loaders that fetch from EntityService

**Files to create:**

```
plugins/site-builder-astro/
└── src/
    └── astro/
        ├── loaders/
        │   └── brain-loader.ts    # Generic entity loader
        └── content-config.ts      # Collection generator
```

**Key implementation:**

```typescript
// src/astro/loaders/brain-loader.ts
export function createBrainLoader(
  entityService: EntityService,
  entityType: string,
  schema: ZodSchema,
): Loader {
  return {
    name: `brain-${entityType}`,
    async load({ store, logger }) {
      const entities = await entityService.listEntities(entityType);
      for (const entity of entities) {
        store.set({
          id: entity.id,
          data: entity.metadata,
          body: entity.content,
        });
      }
    },
  };
}
```

### Phase 3: Astro Project Generator

**Goal:** Generate Astro project structure at build time

**Files to create:**

```
plugins/site-builder-astro/
└── src/
    └── lib/
        ├── astro-generator.ts     # Generate project structure
        ├── page-generator.ts      # Generate pages from routes
        └── layout-adapter.ts      # Adapt Preact layouts
```

**Generated structure:**

```
.astro-work/
├── astro.config.mjs
├── src/
│   ├── content/
│   │   └── config.ts          # Generated collections
│   ├── layouts/
│   │   └── BaseLayout.astro   # Wrapper for Preact layouts
│   ├── pages/
│   │   ├── index.astro        # Generated from routes
│   │   ├── about.astro
│   │   └── [entityType]/
│   │       └── [slug].astro   # Dynamic entity pages
│   └── components/            # Symlink to Preact templates
└── public/
    └── styles/                # Theme CSS
```

### Phase 4: Build Handler

**Goal:** Orchestrate Astro build process

**Files to create:**

```
plugins/site-builder-astro/
└── src/
    └── handlers/
        └── astro-build-handler.ts
```

**Key implementation:**

```typescript
// src/handlers/astro-build-handler.ts
export class AstroBuildHandler extends BaseJobHandler<
  "site-build",
  BuildData,
  BuildResult
> {
  async process(data: BuildData): Promise<BuildResult> {
    // 1. Generate Astro project
    await this.generator.generateProject(data.routes, data.entities);

    // 2. Run astro build
    const result = await $`cd ${workDir} && npx astro build`;

    // 3. Copy output
    await fs.cp(`${workDir}/dist`, data.outputDir, { recursive: true });

    // 4. Emit event
    await this.context.messaging.send("site:build:completed", {
      outputDir: data.outputDir,
      environment: data.environment,
      routesBuilt: data.routes.length,
    });

    return { success: true, routesBuilt: data.routes.length };
  }
}
```

### Phase 5: Preact Integration

**Goal:** Use existing templates via @astrojs/preact

**astro.config.mjs:**

```javascript
import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";

export default defineConfig({
  integrations: [preact({ compat: true })],
  output: "static",
});
```

**Layout wrapper (.astro):**

```astro
---
import { Layout } from '@brains/default-site-content';
const { title, children } = Astro.props;
---
<Layout title={title} client:load>
  <slot />
</Layout>
```

### Phase 6: Test with collective-brain

**Goal:** Verify compatibility with real brain

**Changes to collective-brain:**

```typescript
// brain.config.ts
import { siteBuilderAstroPlugin } from "@brains/site-builder-astro";

// Replace:
// siteBuilderPlugin({...})
// With:
siteBuilderAstroPlugin({
  routes,
  previewOutputDir: "./dist/site-preview",
  productionOutputDir: "./dist/site-production",
});
```

---

## Files to Create/Modify

### New Package: `plugins/site-builder-astro/`

| File                                  | Purpose                    |
| ------------------------------------- | -------------------------- |
| `package.json`                        | Package config, Astro deps |
| `src/index.ts`                        | Public exports             |
| `src/plugin.ts`                       | ServicePlugin impl         |
| `src/config.ts`                       | Config schema              |
| `src/types/routes.ts`                 | Route types (re-export)    |
| `src/lib/route-registry.ts`           | Route management           |
| `src/lib/astro-generator.ts`          | Project generator          |
| `src/lib/page-generator.ts`           | Page file generator        |
| `src/astro/loaders/brain-loader.ts`   | Content loader             |
| `src/astro/content-config.ts`         | Collection config          |
| `src/handlers/astro-build-handler.ts` | Build job handler          |
| `test/plugin.test.ts`                 | Unit tests                 |

### Modifications

| File                                    | Change                 |
| --------------------------------------- | ---------------------- |
| `apps/collective-brain/brain.config.ts` | Switch to astro plugin |
| `turbo.json`                            | Add package to build   |

---

## Dependencies

```json
{
  "dependencies": {
    "astro": "^4.16",
    "@astrojs/preact": "^3.5",
    "@brains/plugins": "workspace:*",
    "@brains/utils": "workspace:*"
  },
  "devDependencies": {
    "@brains/typescript-config": "workspace:*"
  }
}
```

---

## Verification Plan

1. **Unit tests:** Plugin registration, route handling, build job
2. **Integration test:** Generate project, verify structure
3. **E2E test:** Build collective-brain site, compare output
4. **Manual verification:**
   - `cd apps/collective-brain && bun run brain.config.ts build preview`
   - Check `dist/site-preview/` has expected pages
   - Verify site renders correctly in browser

---

## Success Criteria

- [ ] `siteBuilderAstroPlugin()` has same config signature as `siteBuilderPlugin()`
- [ ] Routes registered the same way (messaging or config)
- [ ] DataSources work via content collection loaders
- [ ] Existing Preact templates render correctly
- [ ] `site:build:completed` event emitted with same payload
- [ ] collective-brain builds successfully with Astro
- [ ] Output matches current site-builder (same pages, styles work)

---

## Risks & Mitigations

| Risk                          | Mitigation                                   |
| ----------------------------- | -------------------------------------------- |
| Astro version incompatibility | Pin to stable 4.x, test upgrades             |
| Preact hydration differences  | Use `client:load` for interactive components |
| Build performance             | Astro is generally faster, monitor           |
| Missing features              | Start simple, add as needed                  |

---

## Estimated Effort

| Phase                    | Effort    |
| ------------------------ | --------- |
| 1. Plugin scaffold       | 2-3 hours |
| 2. Content bridge        | 3-4 hours |
| 3. Project generator     | 4-6 hours |
| 4. Build handler         | 2-3 hours |
| 5. Preact integration    | 2-3 hours |
| 6. collective-brain test | 2-3 hours |

**Total: ~2-3 days**
