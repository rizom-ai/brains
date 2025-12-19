# Portfolio Plugin Implementation Plan

## Overview

A portfolio showcase plugin for displaying completed work, case studies, and achievements with links to related essays and presentations.

## Naming Convention

- **Package**: `@brains/portfolio` (in `plugins/portfolio/`)
- **Entity type**: `project`
- **Route URL**: `/portfolio` and `/portfolio/:slug`

## Entity: `project`

### Frontmatter Fields (8 fields)

| Field        | Type            | Required | Description                                         |
| ------------ | --------------- | -------- | --------------------------------------------------- |
| title        | string          | yes      | Project name                                        |
| slug         | string          | auto     | URL-friendly identifier (auto-generated from title) |
| status       | draft/published | yes      | Publication state                                   |
| description  | string          | yes      | 1-2 sentence summary for cards                      |
| year         | number          | yes      | Year project began (e.g., 2023) - used for ordering |
| coverImage   | string          | no       | Hero image URL                                      |
| technologies | string[]        | no       | Tech stack tags                                     |
| url          | string          | no       | Link to live project                                |

### Metadata (Fast Query Fields)

- title, slug, status, year

### Content Structure

- `description` field for card previews (like blog's `excerpt`)
- Markdown body with structured sections parsed by adapter

**Markdown body format:**

```markdown
## Context

Background and environment for the project.

## Problem

What challenge or opportunity was addressed?

## Solution

What was built or implemented?

## Outcome

Results, impact, or lessons learned.
```

**Parsed using `StructuredContentFormatter` from `@brains/utils`:**

```typescript
// Field mappings for section extraction
const projectFieldMappings: FieldMapping[] = [
  { headingLabel: "Context", fieldPath: "context" },
  { headingLabel: "Problem", fieldPath: "problem" },
  { headingLabel: "Solution", fieldPath: "solution" },
  { headingLabel: "Outcome", fieldPath: "outcome" },
];

interface ProjectContent {
  context: string;
  problem: string;
  solution: string;
  outcome: string;
}
```

Templates access structured data: `project.context`, `project.problem`, etc.

### Ordering

- Primary: `year` descending (newest projects first)
- Secondary: `publishedAt` for same-year projects

## File Structure

```
plugins/portfolio/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                    # Public exports
    ├── plugin.ts                   # ServicePlugin implementation
    ├── config.ts                   # Plugin config schema
    ├── schemas/
    │   └── project.ts              # Frontmatter, metadata, entity schemas
    ├── adapters/
    │   └── project-adapter.ts      # EntityAdapter implementation
    ├── datasources/
    │   └── project-datasource.ts   # DataSource with filtering/pagination
    ├── handlers/
    │   └── generation-handler.ts   # AI generation job handler
    ├── tools/
    │   ├── index.ts
    │   ├── generate.ts             # portfolio_generate tool
    │   └── publish.ts              # portfolio_publish tool
    └── templates/
        ├── project-list.tsx        # Grid/card view
        ├── project-detail.tsx      # Full case study page
        └── generation-template.ts  # AI generation template
```

## Routes

- `/portfolio` - Portfolio grid with all published projects
- `/portfolio/:slug` - Individual project case study page

## Implementation Steps

### Step 1: Package Setup

- Create `plugins/portfolio/` directory
- Create `package.json` with dependencies: `@brains/plugins`, `@brains/utils`, `@brains/entity-service`, `@brains/ui-library`
- Create `tsconfig.json` extending base config

### Step 2: Schemas (`src/schemas/project.ts`)

- Define `projectFrontmatterSchema` with all frontmatter fields
- Define `projectMetadataSchema` with fast-query fields
- Define `projectSchema` extending `baseEntitySchema`
- Define `projectWithDataSchema`, `templateProjectSchema`, `EnrichedProject` type

### Step 3: Adapter (`src/adapters/project-adapter.ts`)

- Implement `EntityAdapter<Project, ProjectMetadata>`
- Auto-generate slug from title using `slugify()`
- Sync frontmatter fields to metadata
- Use `StructuredContentFormatter` to parse/generate body sections (context, problem, solution, outcome)
- Handle markdown serialization/deserialization

### Step 4: DataSource (`src/datasources/project-datasource.ts`)

- Fetch single project by slug
- Fetch paginated list (sorted by year desc, then publishedAt)
- Filter by environment (preview shows drafts)

### Step 5: Templates

**`project-list.tsx`:**

- 2-3 column grid layout with Card components
- Image handling: real coverImage if provided, generated gradient placeholder otherwise
- Year badge overlay on image area
- Title, description, technology tags (limit 3)
- Pagination support

**`project-detail.tsx`:**

- Hero image (real or generated placeholder)
- Project metadata (year, external link button)
- Full technology list
- Prose content (case study body)

**`generation-template.ts`:**

- AI prompt for generating case studies
- Suggests problem/solution structure
- Professional but not stuffy tone

### Step 6: Tools

**`portfolio_generate`:**

- Input: prompt, year
- Enqueues generation job
- Returns job ID

**`portfolio_publish`:**

- Input: project slug
- Sets status to "published", adds publishedAt
- Returns success/failure

### Step 7: Plugin (`src/plugin.ts`)

- Extend `ServicePlugin<PortfolioConfig>`
- Register entity type with schema and adapter
- Register datasource
- Register templates (list, detail, generation)
- Register job handler
- Register eval handlers for testing

### Step 8: Professional Brain Integration

**Update `brains/professional/brain.config.ts`:**

```typescript
import { portfolioPlugin } from "@brains/portfolio";

plugins: [
  // ... existing
  portfolioPlugin(),
],
entityRouteConfig: {
  // ... existing
  project: {
    label: "Project",
    pluralName: "portfolio",
    navigation: { slot: "primary", priority: 60 }
  },
}
```

## Critical Reference Files

| Purpose                    | File                                                           |
| -------------------------- | -------------------------------------------------------------- |
| StructuredContentFormatter | `shared/utils/src/formatters/formatters/structured-content.ts` |
| Schema pattern             | `plugins/blog/src/schemas/blog-post.ts`                        |
| Adapter pattern            | `plugins/blog/src/adapters/blog-post-adapter.ts`               |
| DataSource pattern         | `plugins/blog/src/datasources/blog-datasource.ts`              |
| Plugin pattern             | `plugins/blog/src/plugin.ts`                                   |
| Template pattern           | `plugins/blog/src/templates/blog-list.tsx`                     |
| Job handler pattern        | `plugins/blog/src/handlers/blogGenerationJobHandler.ts`        |
| Tool pattern               | `plugins/blog/src/tools/generate.ts`                           |

## Testing Checklist

- [ ] Entity creation from markdown files works
- [ ] Slug auto-generation from title
- [ ] DataSource queries (by slug, paginated list sorted by year)
- [ ] Draft filtering in production vs preview
- [ ] Template rendering (list and detail)
- [ ] AI generation produces valid project structure
- [ ] Publish tool updates status correctly
- [ ] Routes accessible at /portfolio and /portfolio/:slug
- [ ] Navigation shows Portfolio link
