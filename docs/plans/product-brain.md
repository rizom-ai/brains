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

## Features

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

**Parsed body schema**: `{ tagline, role, purpose, audience, values[], features[{title, description}], story }`

**Metadata** (for DB queries): `name`, `slug`, `status`, `order`

## Products Overview Entity

A dedicated `products-overview` entity provides the platform introduction for the `/products` page. It has multiple structured sections with no single narrative body, so the body uses **structured content format** (parsed by `StructuredContentFormatter`).

**Frontmatter** (compact identity):

```yaml
headline: What We Build
tagline: Brain models for every use case
```

**Body** (structured content sections):

```markdown
## Vision

We believe knowledge work deserves better tools...

## Pillars

### Pillar 1

#### Title

AI-Native

#### Description

Built from the ground up with AI at the core

### Pillar 2

#### Title

Plugin-Based

#### Description

Extensible architecture that adapts to your workflow

## Technologies

- TypeScript
- Preact
- Drizzle ORM
- Matrix Protocol
- MCP

## Benefits

### Benefit 1

#### Title

Own Your Data

#### Description

All content stored as markdown — portable, readable, yours

### Benefit 2

#### Title

Extend Everything

#### Description

Plugin system makes every brain customizable

## CTA

### Text

Get Started

### Link

/docs/getting-started
```

**Schema:** `ProductsOverview` with headline, tagline (frontmatter) + vision, pillars (array of {title, description}), technologies (string array), benefits (array of {title, description}), CTA ({text, link}) parsed from body via `StructuredContentFormatter`.

## Overview Page

The `/products` page has two parts:

1. **Platform overview** — Vision, pillars, technologies, benefits, CTA (from overview entity)
2. **Brain model sections** — For each product entity:
   - **Identity**: Name + status badge + tagline
   - **What & why**: Role + purpose
   - **Audience**: Who this brain is for
   - **Values**: Displayed as tags/badges
   - **Features**: Capability cards (title + description) — the plugins it uses
   - **Story**: Rendered markdown body (`ProseContent`)
   - Visual breathing room between brain models

Designed with **frontend-design skill**.

**Reused components**: `StatusBadge`, `ProseContent`, `LinkButton`, `Head`, `Card`, `TagsList` from `@brains/ui-library`

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
11. Design overview template with **frontend-design skill** ✅ (v1 done, v2 below)
12. **Redesign products page template (v2)** ✅
13. **Refactor product entities to structured content** ✅
14. Implement generate tools + job handlers + AI templates
15. `bun install` + `bun run typecheck` + `bun run lint`

---

## Products Page Template — Visual Improvements (v2)

### Context

The current template (`plugins/products/src/templates/products-page.tsx`) renders correctly but looks generic. It doesn't follow the established design patterns of the codebase (homepage, about page). This plan brings the products page in line with those patterns and improves its visual quality.

### Inventory of Issues

#### 1. Hero — wrong layout pattern

- Uses fixed padding (`py-24 md:py-36`) instead of the signature `min-h-[70vh]` + `flex items-end` hero
- Content vertically centered instead of bottom-aligned
- Missing decorative horizontal divider (`w-12 border-t border-theme`) between headline and tagline

#### 2. Redundant inline font styles (7 occurrences)

- `style={{ fontFamily: "var(--font-heading)" }}` on every heading
- Theme CSS already applies `--font-heading` to h1-h6 globally — pure noise

#### 3. Vision section — disconnected

- Plain paragraph, no visual relationship to surrounding content
- Could benefit from larger typography or the stacked ContentSection pattern

#### 4. Pillars — washed out numbers

- `opacity-20` on large numbers makes them barely visible
- Predictable zebra stripe (`bg-theme-subtle`) across sections

#### 5. Brain Models — broken class + missing component reuse

- `md:direction-rtl` is NOT a valid Tailwind class — dead code
- Feature cards manually recreate `Card` component instead of reusing it
- Values use custom `<span>` tags instead of `TagsList`
- No visual separator between products

#### 6. Technologies — should use TagsList

- Manual tag rendering instead of `TagsList` with `variant="accent"`

#### 7. CTA — weaker than design system supports

- Missing `cta-bg-pattern` dot overlay (available in theme CSS)
- Just a centered button — no heading, no context
- Compare to `CTASection`: overline label, heading, social links

#### 8. Spacing — monotonous

- Every section uses `py-20 md:py-28` — no variation in rhythm

### Implementation Plan

**File to modify**: `plugins/products/src/templates/products-page.tsx`

**Reference files**:

- `plugins/professional-site/src/templates/homepage-list.tsx` — hero pattern
- `plugins/professional-site/src/components/CTASection.tsx` — CTA pattern
- `shared/ui-library/src/Card.tsx` — Card component
- `shared/ui-library/src/TagsList.tsx` — TagsList component
- `shared/theme-default/src/theme.css` — `cta-bg-pattern` class

#### Step 1: Fix hero layout

- Change to `min-h-[70vh] flex items-end` (from `homepage-list.tsx:77`)
- Bottom-align content with `pb-16 md:pb-24`
- Add horizontal divider between headline and tagline
- Keep `hero-bg-pattern` and `max-w-4xl`

#### Step 2: Remove inline font styles

- Delete all 7 occurrences of `style={{ fontFamily: "var(--font-heading)" }}`

#### Step 3: Improve vision section

- Larger typography (`text-2xl md:text-3xl font-light`)
- Add structure with stacked ContentSection pattern or top border

#### Step 4: Fix pillars

- Increase number opacity from `opacity-20` to `opacity-30`
- Remove zebra `bg-theme-subtle`, keep uniform `bg-theme`

#### Step 5: Fix brain models

- Remove dead `md:direction-rtl` class
- Replace custom cards with `Card` from `@brains/ui-library`
- Replace custom value tags with `TagsList` (variant `"muted"`, size `"sm"`)
- Add `border-t border-theme` separator between products

#### Step 6: Use TagsList for technologies

- Replace manual tag rendering with `TagsList` (variant `"accent"`, size `"md"`)

#### Step 7: Upgrade CTA

- Add `cta-bg-pattern` class alongside `bg-brand`
- Add overline label + heading above the button

#### Step 8: Update imports

- Add `TagsList`, `Card` to imports from `@brains/ui-library`

### Verification

```bash
cd plugins/products && bun run typecheck       # template compiles
cd plugins/products && bun test                # tests still pass
bun run typecheck                              # all packages pass
bun run lint                                   # no lint errors
cd apps/collective-brain && bun run dev        # start brain
# Trigger site build, check /products/index.html
# Verify: hero matches homepage pattern (tall, bottom-aligned)
# Verify: no broken classes (direction-rtl gone)
# Verify: TagsList and Card components render correctly
# Verify: CTA has dot pattern and heading
# Verify: both light and dark mode
```
