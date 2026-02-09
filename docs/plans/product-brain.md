# Products Plugin — Product Showcase for the Collective Brain

## Context

The collective brain needs a products overview page at `/products` to showcase what Rizom builds. Instead of creating a separate brain app (over-engineered for a single page), we create a **products plugin** that manages Product entities and registers its own route with the existing site-builder — following the same pattern as the blog plugin.

The overview is a **showcase page**, not a listing. Products are few (3-6), curated, and each gets visual weight with rendered markdown body content. The overview template will be designed with the **frontend-design skill**.

## Architecture

Follows the blog plugin pattern (`plugins/blog/`):

- **ServicePlugin** managing a "product" entity type
- 3-tier schema: frontmatter → metadata → entity
- EntityAdapter for markdown serialization
- DataSource for querying products
- Template registered with site-builder
- Route registered dynamically via `plugin:site-builder:route:register` messaging
- No AI generation, no publish pipeline — products are manually curated markdown files

## Files to Create

### 1. Plugin: `plugins/products/`

| File                                     | Purpose                   | Based on                                          |
| ---------------------------------------- | ------------------------- | ------------------------------------------------- |
| `package.json`                           | Dependencies              | `plugins/blog/package.json` (fewer deps)          |
| `tsconfig.json`                          | TS config with Preact JSX | `plugins/blog/tsconfig.json`                      |
| `src/index.ts`                           | Public exports            | `plugins/blog/src/index.ts`                       |
| `src/plugin.ts`                          | ProductsPlugin class      | `plugins/blog/src/plugin.ts` (simplified)         |
| `src/config.ts`                          | Config schema             | —                                                 |
| `src/schemas/product.ts`                 | 3-tier entity schema      | `plugins/blog/src/schemas/blog-post.ts`           |
| `src/adapters/product-adapter.ts`        | Markdown adapter          | `plugins/blog/src/adapters/blog-post-adapter.ts`  |
| `src/datasources/products-datasource.ts` | Fetch & sort products     | `plugins/blog/src/datasources/blog-datasource.ts` |
| `src/templates/products-overview.tsx`    | Overview page component   | **frontend-design skill**                         |

### 2. Product Entity

**Frontmatter** (stored in markdown YAML):

```yaml
name: Brains
tagline: Your personal knowledge operating system
status: live # live | beta | alpha | concept
icon: Brain # Lucide icon name
link: https://... # optional
order: 1 # display order on overview
```

**Body**: Rich markdown content — the full product story. Rendered on the overview page via `markdownToHtml()` + `ProseContent`.

**Metadata** (for DB queries): `name`, `slug` (auto-generated), `status`, `order`

### 3. Plugin Config

```typescript
productsPlugin({
  headline: "What We Build",
  description: "Tools for knowledge workers, educators, and communities",
  route: "/products", // default
});
```

### 4. Overview Template

Designed with **frontend-design skill**. The page structure:

1. **Header** — Headline + description (from plugin config)
2. **Product sections** — Each product as a substantial `<section>`:
   - Icon + name + StatusBadge
   - Tagline as subtitle
   - Rendered markdown body (`ProseContent`)
   - Link button (if product has a link)
   - Generous spacing between products (`space-y-20 md:space-y-28`)

**Reused components**: `StatusBadge`, `ProseContent`, `LinkButton`, `Head` from `@brains/ui-library`

### 5. Route Registration

Via messaging in `onRegister()` (same as dashboard plugin):

```typescript
await context.messaging.send("plugin:site-builder:route:register", {
  pluginId: this.id,
  routes: [
    {
      id: "products-overview",
      path: "/products",
      title: "Our Products",
      navigation: {
        show: true,
        label: "Products",
        slot: "primary",
        priority: 30,
      },
      sections: [
        {
          id: "products",
          template: "products-overview",
          dataQuery: { entityType: "product" },
        },
      ],
    },
  ],
});
```

### 6. Seed Content: `apps/collective-brain/seed-content/product/`

| File           | Product                                                         |
| -------------- | --------------------------------------------------------------- |
| `brains.md`    | Brains — personal knowledge OS (status: live, order: 1)         |
| `offcourse.md` | Offcourse — open source learning paths (status: beta, order: 2) |
| `rizom.md`     | Rizom — collective knowledge networks (status: alpha, order: 3) |

Each file has YAML frontmatter + rich markdown body describing the product.

### 7. Collective Brain Integration

**`apps/collective-brain/brain.config.ts`** — add import + plugin:

```typescript
import { productsPlugin } from "@brains/products";
// ...
plugins: [
  // ... existing plugins ...
  productsPlugin({
    headline: "What We Build",
    description: "Tools for knowledge workers, educators, and communities",
  }),
];
```

**`apps/collective-brain/package.json`** — add dependency:

```json
"@brains/products": "workspace:*"
```

## Data Flow

```
seed-content/product/*.md
  → directory-sync → ProductAdapter.fromMarkdown()
  → Product entity in DB (metadata: name, slug, status, order)
  → site build triggers route "/products"
  → ProductsDataSource.fetch() queries entities sorted by order
  → parses frontmatter + body from each entity
  → ProductsOverviewTemplate renders sections
  → markdownToHtml() converts body → ProseContent
  → static HTML at /products/index.html
```

## What Stays Unchanged

- `shared/product-site-content/` — remains available for landing pages, not used by this plugin
- Collective brain's existing site-builder config — products plugin adds its route via messaging
- No new theme needed — uses the collective brain's existing theme

## Implementation Order

1. Create `plugins/products/` scaffold (package.json, tsconfig, config)
2. Define product schema (3-tier: frontmatter → metadata → entity)
3. Implement ProductAdapter (markdown serialization)
4. Implement ProductsDataSource (fetch + sort by order)
5. Design overview template with **frontend-design skill**
6. Implement ProductsPlugin class (entity registration, template, route, datasource)
7. Wire into collective brain (brain.config.ts, package.json)
8. Create seed content (3 product markdown files)
9. `bun install` + `bun run typecheck` + `bun run lint`

## Verification

```bash
bun install                                    # register new package
cd plugins/products && bun run typecheck       # plugin compiles
bun run typecheck                              # all packages pass
bun run lint                                   # no errors
cd apps/collective-brain && bun run dev        # start brain
# Verify: product entities synced from seed content
# Trigger site build, check /products/index.html
# Verify: Products link in site navigation
# Verify: both light and dark mode
```
