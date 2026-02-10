# Products Plugin — Brain Model Showcase for the Collective Brain

## Context

The collective brain needs a products overview page at `/products` to showcase the different brain models that Rizom builds. Each brain is a **model for a specific use case** — it has an identity (name, role, purpose, values), an audience, and capabilities (features/plugins). The overview page presents these brain models as products.

Instead of creating a separate brain app, we create a **products plugin** that manages Product entities and registers its own route with the existing site-builder.

## What is a Product?

A product is a **brain model** — a configuration of the Brains platform tailored to a use case. It mirrors the brain's own identity structure:

- **Identity**: name, role, purpose, values
- **Positioning**: tagline, audience
- **Capabilities**: features (the plugins/integrations it uses)
- **Maturity**: status (live/beta/alpha/concept)
- **Story**: rich markdown body — the narrative of what this brain enables

Example brain models:

- **Professional Brain** ("Rover") — personal knowledge manager for creators
- **Team Brain** ("Recall") — shared memory and collaboration hub for teams
- **Collective Brain** ("Ranger") — knowledge coordinator for organizations and collectives

## Content Format Principle

Both entity types use **frontmatter + markdown body** — consistent with all other plugin entities (blog posts, series, etc.). The split follows a simple rule:

- **Frontmatter**: compact structured data (simple strings, flat arrays, small object arrays)
- **Body**: free-form prose OR structured content sections (parsed by `StructuredContentFormatter`) for complex multi-section content

No icon fields in content — icons are a presentation concern handled by templates.

## Product Entity Schema

A product is a brain model. Only identity + metadata lives in frontmatter. All descriptive content is structured body content parsed by `ProductBodyFormatter` (extends `StructuredContentFormatter`).

**Frontmatter** (minimal — identity + metadata only):

```yaml
name: Rover
status: live
order: 1
```

**Body** (structured content sections):

```markdown
## Tagline

Your AI-powered personal knowledge hub

## Role

Personal knowledge manager and professional content curator

## Purpose

Help organize thoughts, capture knowledge, and showcase professional work

## Audience

Creators, writers, and independent professionals

## Values

- clarity
- organization
- professionalism
- continuous learning

## Capabilities

### Feature 1

#### Title

AI Blogging

#### Description

Generate and publish blog posts from your knowledge base

### Feature 2

#### Title

Social Publishing

#### Description

Share content across LinkedIn and other platforms

## Story

Rover is the professional brain — a personal knowledge operating system...
```

**Parsed body schema**: `{ tagline, role, purpose, audience, values[], features[{title, description}], story }` — headings are content-driven via `getLabels()` on formatter

**Metadata** (for DB queries): `name`, `slug`, `status`, `order`

## Products Overview Entity

A dedicated `products-overview` entity provides the platform introduction for the `/products` page. It has multiple structured sections with no single narrative body, so the body uses **structured content format** (parsed by `StructuredContentFormatter`).

**Frontmatter** (compact identity):

```yaml
headline: What We Build
tagline: Brain models for every use case
```

**Body** (structured content sections — headings are the display labels, driven by `getLabels()`):

```markdown
## Vision

We believe knowledge work deserves better tools...

## Core Principles

### Pillar 1

#### Title

AI-Native

#### Description

Built from the ground up with AI at the core...

## How It Works

### Step 1

#### Title

Pick Your Brain

#### Description

Choose a brain model matched to your context...

## Brain Models

Each brain model is a configuration of the Brains platform tailored to a specific use case...

## Built With

- TypeScript
- Preact
- Drizzle ORM
- Matrix Protocol
- MCP

## Why Brains

### Benefit 1

#### Title

Own Your Data

#### Description

All content is markdown files on disk...

## Ready to Build

### Text

Get Started

### Link

/about
```

**Schema:** `ProductsOverview` with headline, tagline (frontmatter) + vision, pillars, approach (NEW — how-it-works steps), productsIntro, technologies, benefits, CTA, and labels (Record<string, string> from formatter) parsed from body via `StructuredContentFormatter`. All section headings are content-driven — the formatter's `label` field serves as both markdown heading text and template display label via `getLabels()`.

## Overview Page

The `/products` page has two parts:

1. **Platform overview** — Hero (gradient + animated blobs), vision, core principles, how it works, technologies, benefits, CTA (from overview entity). All section headings content-driven via `labels["key"]`.
2. **Brain model cards** — 3-column card grid, each product showing:
   - **Identity**: Name + status badge
   - **Pitch**: Tagline (in brand color)
   - **Purpose**: What it does for you (1 sentence)
   - Hover lift effect (`-translate-y-1`) with border accent
   - Detailed fields (role, audience, values, features, story) available for future detail pages

Designed with **frontend-design skill**.

**Reused components**: `StatusBadge`, `LinkButton`, `Head`, `Card`, `TagsList` from `@brains/ui-library`

## Generate Tools

Following the blog plugin pattern: tools enqueue async jobs, job handlers use AI templates for generation.

### `products:generate` — Generate a product entity

Generates a brain model product description using AI.

**Input schema:**

```typescript
z.object({
  prompt: z.string().optional(), // Topic/guidance for AI generation
  name: z.string().optional(), // Brain model name (AI-generated if not provided)
  role: z.string().optional(), // Brain model role
  purpose: z.string().optional(), // Brain model purpose
  skipAi: z.boolean().optional(), // Create skeleton with placeholders
});
```

**Three modes** (same as blog):

1. **Full AI generation** — provide a prompt, AI generates all fields (name, tagline, role, purpose, audience, values, features, story)
2. **Partial** — provide some fields (e.g. name + role), AI fills the rest
3. **Skip AI** — create a skeleton product with placeholder content (requires name)

**Job handler:** `ProductGenerationJobHandler` enqueues via `context.jobs.enqueue("product-generation", ...)`

**AI template:** `products:generation` — generates structured product data matching the frontmatter schema + story body

### `products:generate-overview` — Generate the overview entity

Generates the platform overview content using AI.

**Input schema:**

```typescript
z.object({
  prompt: z.string().optional(), // Guidance for AI generation
  headline: z.string().optional(), // Override headline
  tagline: z.string().optional(), // Override tagline
  skipAi: z.boolean().optional(), // Create skeleton with placeholders
});
```

**Job handler:** `OverviewGenerationJobHandler` — generates vision, pillars, technologies, benefits, CTA as structured content

**AI template:** `products:overview-generation` — generates overview data, serialized to frontmatter + structured content body

## Files Created

### Plugin: `plugins/products/src/`

| File                                 | Purpose                                                |
| ------------------------------------ | ------------------------------------------------------ |
| `index.ts`                           | Public exports                                         |
| `plugin.ts`                          | ProductsPlugin class (follows portfolio pattern)       |
| `config.ts`                          | Config schema with optional route override             |
| `schemas/product.ts`                 | 3-tier entity schema with enriched variant             |
| `schemas/overview.ts`                | Overview entity schema (frontmatter + structured body) |
| `adapters/product-adapter.ts`        | Markdown adapter (minimal frontmatter + body)          |
| `adapters/overview-adapter.ts`       | Overview adapter (frontmatter + structured content)    |
| `formatters/product-formatter.ts`    | StructuredContentFormatter for product body            |
| `formatters/overview-formatter.ts`   | StructuredContentFormatter for overview body           |
| `datasources/products-datasource.ts` | Fetch + sort products, combined with overview          |
| `templates/products-page.tsx`        | Combined page component (overview + brain models)      |

### Seed Content

| File                                                               | Content            |
| ------------------------------------------------------------------ | ------------------ |
| `apps/collective-brain/seed-content/product/rover.md`              | Professional Brain |
| `apps/collective-brain/seed-content/product/recall.md`             | Team Brain         |
| `apps/collective-brain/seed-content/product/ranger.md`             | Collective Brain   |
| `apps/collective-brain/seed-content/products-overview/overview.md` | Platform overview  |

### Tests: `plugins/products/test/`

| File                          | Purpose                   |
| ----------------------------- | ------------------------- |
| `product-adapter.test.ts`     | Adapter tests             |
| `plugin-registration.test.ts` | Plugin registration tests |

### Integration

- `apps/collective-brain/brain.config.ts` — `productsPlugin()` added
- `apps/collective-brain/package.json` — `"@brains/products": "workspace:*"` added

### Pending Files (generate tools — future work)

| File                                            | Purpose                             |
| ----------------------------------------------- | ----------------------------------- |
| `src/tools/generate.ts`                         | Product generate tool               |
| `src/tools/generate-overview.ts`                | Overview generate tool              |
| `src/handlers/product-generation-handler.ts`    | Product generation job handler      |
| `src/handlers/overview-generation-handler.ts`   | Overview generation job handler     |
| `src/templates/generation-template.ts`          | AI template for product generation  |
| `src/templates/overview-generation-template.ts` | AI template for overview generation |

## Implementation Order

1. Create `plugins/products/` scaffold (package.json, tsconfig, config) ✅
2. Write tests for schema, adapter, plugin registration ✅
3. Define product schema (frontmatter with identity/purpose/values/features) ✅
4. Implement ProductAdapter ✅
5. Implement ProductsPlugin class ✅
6. Define overview schema + StructuredContentFormatter ✅
7. Implement OverviewAdapter (frontmatter + structured content body) ✅
8. Implement ProductsDataSource (fetch + sort by order) ✅
9. Wire into collective brain (brain.config.ts, package.json) ✅
10. Create seed content (product + overview markdown files) ✅
11. Design overview template with **frontend-design skill** ✅
12. **Redesign products page template (v2)** ✅
13. **Refactor product entities to structured content** ✅
14. **Content-driven labels** — `getLabels()` on StructuredContentFormatter, headings renamed, labels passed through datasource to template ✅
15. **Products page redesign (v3)** — hero gradient+blobs, "How It Works" section, compact product cards, deeper overview content
16. Implement generate tools + job handlers + AI templates
17. `bun install` + `bun run typecheck` + `bun run lint`

---

## Products Page Redesign (v3)

### Context

The v2 template is structurally sound but has three remaining issues:

1. **Too much detail per product**: Each product renders 7 body sections as a "magazine spread" — information overload
2. **Too little visual interest**: Flat hero, no gradients/blobs/hover effects despite theme support
3. **Overview content is too thin**: Vision is one paragraph, pillar/benefit descriptions are one-liners, no section explaining how the platform works

### Approach

Three parallel improvements:

1. **Visual**: Hero gradient + animated blobs, product cards with hover effects
2. **Content**: Deepen existing sections, add new "How It Works" section (`approach` field)
3. **Information architecture**: Simplify product display to name + status + tagline + purpose as compact cards

### Page Structure (before → after)

| #   | Before                          | After                                 |
| --- | ------------------------------- | ------------------------------------- |
| 1   | Hero (flat bg)                  | Hero (gradient + blobs)               |
| 2   | Vision (1 paragraph)            | Vision (richer, problem-framing)      |
| 3   | Core Principles (thin)          | Core Principles (deeper descriptions) |
| 4   | —                               | **How It Works** (NEW — 3 steps)      |
| 5   | Brain Models (magazine spreads) | Brain Models (compact 3-col cards)    |
| 6   | Why Brains (thin)               | Why Brains (richer descriptions)      |
| 7   | Built With                      | Built With (unchanged)                |
| 8   | CTA                             | CTA (unchanged)                       |

### Implementation

1. Add `approach` field to `overviewBodySchema` — `z.array({title, description}).min(1).max(6)`
2. Add `approach` mapping to `OverviewBodyFormatter` — label "How It Works"
3. Enhance hero with gradient background + 3 animated blobs (pattern from `shared/product-site-content/src/hero/layout.tsx`)
4. Add "How It Works" section to template — numbered 3-column grid with accent-colored numbers
5. Replace `ProductFeature` magazine spread with `ProductCard` — compact card showing name, status, tagline, purpose only
6. Update overview content — deepen vision/pillars/benefits descriptions, add "How It Works" steps
7. Update tests

### Files Modified

| File                                                               | Change                          |
| ------------------------------------------------------------------ | ------------------------------- |
| `plugins/products/src/schemas/overview.ts`                         | Add `approach` field            |
| `plugins/products/src/formatters/overview-formatter.ts`            | Add `approach` mapping          |
| `plugins/products/src/templates/products-page.tsx`                 | Hero, How It Works, ProductCard |
| `apps/collective-brain/seed-content/products-overview/overview.md` | Deepen + add content            |
| `apps/collective-brain/brain-data/products-overview/overview.md`   | Sync                            |
| `plugins/products/test/overview-schema.test.ts`                    | Add approach test data          |
