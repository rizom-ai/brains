---
title: "Customization Guide"
section: "Customization"
order: 100
sourcePath: "docs/customization-guide.md"
slug: "customization-guide"
description: "brains is customized in layers. Prefer the smallest layer that solves the problem:"
---

# Customization Guide

`brains` is customized in layers. Prefer the smallest layer that solves the problem:

1. configure the instance in `brain.yaml`
2. edit content in `brain-data/`
3. layer CSS in `src/theme.css`
4. customize site structure in `src/site.ts`
5. write or enable plugins only when behavior or data models need to change

## Instance configuration

Use `brain.yaml` for model, preset, plugin, interface, permission, domain, and deployment settings.

```yaml
brain: rover
domain: mybrain.example.com
preset: default

add:
  - stock-photo
remove:
  - discord

site:
  package: "@brains/site-default"
  theme: "@brains/theme-default"

plugins:
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
```

Use `add` and `remove` before writing code. Many changes are just capability selection.

See [brain.yaml Reference](/docs/brain-yaml-reference).

## Content customization

Use `brain-data/` for site copy, posts, decks, products, profile data, prompt overrides, and other durable content.

Common singleton content:

- `brain-character/brain-character.md`
- `anchor-profile/anchor-profile.md`
- `site-info/site-info.md`

Prompt customization uses `prompt` entities:

```markdown
---
title: Blog generation prompt
target: blog:generation
---

Write with short sections and concrete examples.
```

See [Content Management Guide](/docs/content-management) and [Entity Types Reference](/docs/entity-types-reference).

## Theme customization

Theme CSS controls visual design. Generated standalone instances can include:

```text
src/theme.css
```

Local `src/theme.css` is treated as an additive theme override. It layers after the selected base theme.

Example:

```css
@theme inline {
  --color-brand: #2f5cff;
  --color-accent: #ff7a30;
  --font-sans: "Inter", system-ui, sans-serif;
}

.hero-title {
  letter-spacing: -0.04em;
}
```

Use semantic tokens instead of hard-coded colors in components whenever possible:

```css
.card {
  color: var(--color-text);
  background: var(--color-surface);
  border-color: var(--color-border);
}
```

For a reusable theme package, export CSS text:

```ts
import themeCSS from "./theme.css" with { type: "text" };

export default themeCSS;
export { themeCSS };
```

If you need to compose a full standalone theme CSS string, use the public theme export:

```ts
import { composeTheme } from "@rizom/brain/themes";
import themeCSS from "./theme.css" with { type: "text" };

export default composeTheme(themeCSS);
```

Read next: [Theming Guide](/docs/theming-guide).

## Site and layout customization

A site package is structural. It provides layouts, hand-written routes, a site plugin, entity display metadata, and optional static assets. Themes stay separate.

Generated standalone instances can include:

```text
src/site.ts
```

When `brain.yaml` omits `site.package`, the runtime can discover local `src/site.ts` by convention. Local `src/theme.css` still layers as a theme override.

### Start from a shipped site

Example local `src/site.ts` using the public site API:

```ts
import {
  professionalSitePlugin,
  ProfessionalLayout,
  professionalRoutes,
  type SitePackage,
} from "@rizom/brain/site";

const site: SitePackage = {
  layouts: {
    default: ProfessionalLayout,
  },
  routes: professionalRoutes,
  plugin: (config) => professionalSitePlugin(config ?? {}),
  entityDisplay: {
    post: { label: "Essay", pluralName: "essays" },
    deck: { label: "Talk", pluralName: "talks" },
    base: { label: "Note", navigation: { show: false } },
  },
};

export default site;
```

Then remove an explicit `site.package` override from `brain.yaml` when you want the local site convention to win.

### Entity display metadata

`entityDisplay` controls generated list/detail routes for active entity plugins.

```ts
entityDisplay: {
  post: {
    label: "Essay",
    pluralName: "essays",
    paginate: true,
    pageSize: 12,
    navigation: {
      show: true,
      slot: "primary",
      priority: 20,
    },
  },
}
```

Supported fields:

- `label`: singular display label
- `pluralName`: URL/list label override
- `layout`: layout key for generated routes
- `paginate`
- `pageSize`
- `navigation.show`
- `navigation.slot`: `primary` or `secondary`
- `navigation.priority`

### Routes

Routes are consumed by the site builder. Prefer reusing shipped route exports unless you need app-specific pages.

A route usually includes:

- `id`
- `path`
- `title`
- `description`
- `layout`
- `navigation`
- `sections`

Each section references a registered template and optional data query/content.

### Layouts

Layouts are Preact components. They receive rendered sections and site metadata.

Conceptual shape:

```tsx
import type { ComponentChildren, JSX } from "preact";

type LayoutProps = {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: unknown;
  slots?: unknown;
};

export function MyLayout({ sections }: LayoutProps): JSX.Element {
  return (
    <div class="min-h-screen bg-theme text-theme">
      <main>{sections}</main>
    </div>
  );
}
```

Use existing layouts as references:

- `sites/professional/src/layouts/ProfessionalLayout.tsx`
- `sites/rizom/src/runtime/default-layout.tsx`

### Static assets

A site package can include static assets that the site builder writes during builds:

```ts
const site: SitePackage = {
  // ...
  staticAssets: {
    "/canvases/tree.js": treeScript,
  },
};
```

Use this for package-owned scripts, fonts, or small static files that should ship with the site structure.

## Plugin customization

Write a plugin when you need new behavior, new durable content types, or a new interface.

### Entity plugins

Use an entity plugin when you need a new markdown-backed content type.

Entity packages usually provide:

- Zod schemas
- a markdown adapter
- optional generation handlers
- optional derivation logic
- optional templates and data sources

Rules of thumb:

- entity plugins define schemas and adapters
- entity plugins do not expose CRUD tools
- all CRUD flows through shared system tools
- metadata should stay small and query-friendly

Start with:

- [Entity Types Reference](/docs/entity-types-reference)
- [Entity Model](/docs/entity-model)
- [`entities/AGENTS.md`](https://github.com/rizom-ai/brains/blob/main/entities/AGENTS.md)
- examples in `entities/*/src/`

### Service plugins

Use a service plugin for tools, integrations, jobs, background behavior, API routes, syncing, publishing, analytics, or orchestration.

Rules of thumb:

- keep tool definitions explicit and narrow
- validate config and tool inputs with Zod
- avoid defining entity schemas or markdown adapters here
- isolate external APIs behind small boundaries

Start with:

- [Plugin System](/docs/plugin-system)
- [`plugins/AGENTS.md`](https://github.com/rizom-ai/brains/blob/main/plugins/AGENTS.md)
- examples in `plugins/*/src/`

### Interface plugins

Use an interface plugin for transports: MCP, Discord, A2A, webserver, or future chat platforms.

Rules of thumb:

- use `InterfacePlugin` for HTTP/API-style transports
- use `MessageInterfacePlugin` for conversational transports
- track conversations for message-based interfaces
- check permissions before sensitive actions

Start with:

- [Interface Setup Guide](/docs/interface-setup)
- [`interfaces/AGENTS.md`](https://github.com/rizom-ai/brains/blob/main/interfaces/AGENTS.md)
- examples in `interfaces/*/src/`

## Public API caution

The project is still pre-stable in the `0.x` series. Build against documented surfaces when possible:

- `brain.yaml`
- CLI commands
- system tool names
- entity markdown contracts
- public exports such as `@rizom/brain/site` and `@rizom/brain/themes`

Avoid deep imports into shell internals or package-private implementation files. See [STABILITY.md](https://github.com/rizom-ai/brains/blob/main/STABILITY.md).

## Verification checklist

For docs/content-only customization:

```bash
bun run docs:links
```

For local site/theme changes in a standalone app:

1. install dependencies
2. typecheck if TypeScript changed
3. start the app
4. trigger a preview rebuild on the running app, usually through MCP HTTP / `--remote`
5. inspect `dist/site-preview`

For plugin code changes:

```bash
bun run typecheck
bun run lint
bun test
```

Prefer targeted workspace checks first when the change is isolated.

## Related docs

- [Theming Guide](/docs/theming-guide)
- [Content Management Guide](/docs/content-management)
- [Entity Types Reference](/docs/entity-types-reference)
- [Plugin System](/docs/plugin-system)
- [Plugin Quick Reference](/docs/plugin-quick-reference)
- [Architecture Overview](/docs/architecture-overview)
