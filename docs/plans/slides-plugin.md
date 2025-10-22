# Decks Plugin - Implementation Plan

## Philosophy

- Presentations are markdown files with frontmatter
- Git handles versioning, history, collaboration
- Plugin provides entity type + rendering only
- No complex commands - use existing file operations

## Plugin Structure

### 1. Entity Type: `deck`

**Schema:**

```typescript
{
  id: string;           // filename without .md
  title: string;        // from frontmatter
  description?: string; // from frontmatter
  author?: string;      // from frontmatter
  date?: string;        // from frontmatter (ISO date string)
  content: string;      // markdown with --- separators
  created: Date;
  updated: Date;
}
```

**Storage:** `brain-data/decks/my-presentation.md`

**Example File:**

```markdown
---
title: TypeScript Introduction
description: Learn TypeScript basics
author: Jane Developer
date: 2025-10-22
---

# Welcome

Introduction to TypeScript

---

## Why TypeScript?

- Type safety
- Better tooling
- Enhanced IDE support

---

## Thank You

Questions?
```

### 2. Deck Formatter with Validation

**File:** `plugins/decks/src/formatters/deck-formatter.ts`

- `toMarkdown()` - serialize with frontmatter + validate slide structure
- `fromMarkdown()` - parse frontmatter + content + validate slide structure
- Validates presence of `---` slide separators on both parse and serialize
- Throws descriptive errors if markdown is not a valid presentation
- Similar round-trip functionality as other entity formatters

### 3. Deck Template

**File:** `plugins/decks/src/templates/deck-template.ts`

- Uses `PresentationLayout` from `@brains/ui-library`
- Auto-detects `---` separators
- Schema: just `{ markdown: string }`
- Leverages work from Phase 1 & 2

### 4. Site Integration

- DynamicRouteGenerator creates `/decks/[id]` routes automatically
- Uses existing pattern (looks for `deck-detail` template)
- No manual route configuration needed

### 5. Single List Command

**File:** `plugins/decks/src/commands/index.ts`

- `/decks-list` - list all presentation decks
- Optional - can use `/search deck` instead
- Minimal implementation (~50 lines)

## Workflow

### Creating Presentations

```bash
# Just create a markdown file
cat > brain-data/decks/my-talk.md << 'EOF'
---
title: My Presentation
description: About TypeScript
author: Jane Developer
date: 2025-10-22
---

# Welcome

Introduction slide

---

## Main Content

- Point 1
- Point 2

---

## Thank You
EOF

# Git tracks it automatically
git add brain-data/decks/my-talk.md
git commit -m "Add TypeScript presentation"
```

### Viewing Presentations

- Navigate to `/decks/my-talk`
- Auto-generated route shows Reveal.js presentation
- Slide separators (`---`) detected automatically

### Versioning

- Git tracks changes automatically
- Commit, branch, merge - normal git workflow
- Presentation history = git history
- No custom versioning system needed

## Files to Create

```
plugins/decks/
├── src/
│   ├── formatters/
│   │   └── deck-formatter.ts       (~100 lines, includes validation)
│   ├── entities/
│   │   └── deck-schema.ts          (~40 lines)
│   ├── templates/
│   │   └── deck-template.ts        (~25 lines)
│   ├── commands/
│   │   └── index.ts                (~50 lines)
│   └── plugin.ts                   (~60 lines)
├── package.json
└── tsconfig.json
```

**Total:** ~275 lines of code for full plugin

## Implementation Pattern

Follow existing plugins:

- Link plugin (~400 lines total)
- Summary plugin (~500 lines total)
- Topics plugin (~450 lines total)

Decks plugin will be even simpler (~275 lines) since it doesn't need:

- AI integration
- Complex parsing beyond slide validation
- External API calls
- Custom commands for CRUD operations (use files + git)

## Benefits

✅ **Minimal code** - leverages existing infrastructure
✅ **Markdown files** - portable, human-readable, diffable
✅ **Git workflow** - versioning, collaboration, history
✅ **Auto-generated routes** - no manual configuration
✅ **Search works** - presentations are entities
✅ **Tags/metadata** - via frontmatter
✅ **Reuses PresentationLayout** - from Phase 1 & 2

## What We DON'T Need

❌ No create/edit/delete commands (use files + git)
❌ No versioning system (use git)
❌ No storage layer (markdown files)
❌ No complex UI (just view presentations)
❌ No custom editor (use any markdown editor)

## Integration with Existing System

### Phase 1 & 2 (Already Complete)

- PresentationLayout in `@brains/ui-library` ✅
- Generic presentation template in `@brains/default-site-content` ✅
- Auto-detection of `---` separators ✅

### Phase 3 (Decks Plugin)

- Define `deck` entity type with author/date metadata
- Create deck formatter with validation
- Register deck template
- DynamicRouteGenerator picks it up automatically

## Technical Details

### Deck Schema (Zod)

```typescript
import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/entity-service";

export const deckSchema = baseEntitySchema.extend({
  title: z.string().describe("Presentation title"),
  description: z.string().optional().describe("Brief description"),
  author: z.string().optional().describe("Author name"),
  date: z.string().optional().describe("Presentation date (ISO format)"),
});

export type DeckEntity = z.infer<typeof deckSchema>;
```

### Formatter Pattern with Validation

```typescript
export class DeckFormatter {
  entityType = "deck" as const;
  schema = deckSchema;

  /**
   * Parse markdown into a deck entity
   * Validates that content has proper slide structure
   */
  fromMarkdown(markdown: string): DeckEntity {
    const { frontmatter, content } = parseMarkdownWithFrontmatter(markdown);

    // Validate presentation structure - must have slide separators
    const hasSlides = /^---$/gm.test(content);
    if (!hasSlides) {
      throw new Error(
        `Invalid deck: markdown must contain slide separators (---) to be a valid presentation`,
      );
    }

    // Optional: count slides for metadata
    const slideCount = content.split(/^---$/gm).length;

    return this.schema.parse({
      id: frontmatter.id,
      title: frontmatter.title,
      description: frontmatter.description,
      author: frontmatter.author,
      date: frontmatter.date,
      content,
      slideCount, // Optional metadata
      created: frontmatter.created || new Date(),
      updated: frontmatter.updated || new Date(),
    });
  }

  /**
   * Serialize deck entity to markdown
   * Validates before serializing to prevent corrupted data
   */
  toMarkdown(entity: DeckEntity): string {
    // Validate before serializing
    if (!/^---$/gm.test(entity.content)) {
      throw new Error(
        `Cannot serialize deck: content must contain slide separators (---)`,
      );
    }

    return generateMarkdownWithFrontmatter(entity.content, {
      title: entity.title,
      description: entity.description,
      author: entity.author,
      date: entity.date,
    });
  }
}
```

### Template Registration

```typescript
export const deckTemplate = createTemplate<{ markdown: string }>({
  name: "deck-detail",
  description: "Render a presentation deck as Reveal.js slides",
  schema: z.object({ markdown: z.string() }),
  dataSourceId: "shell:entities",
  requiredPermission: "public",
  layout: {
    component: PresentationLayout, // from @brains/ui-library
    interactive: false,
  },
});
```

## Success Criteria

1. Can create presentation by creating markdown file in `brain-data/decks/`
2. Deck formatter validates slide structure on parse and serialize
3. Invalid markdown (without `---` separators) throws descriptive error
4. Presentation appears in search results
5. Can view presentation at `/decks/[id]` route
6. Reveal.js renders slides from `---` separators
7. Git tracks all changes to presentations
8. Can add author and date metadata via frontmatter

## Future Enhancements (Not in Initial Scope)

- Speaker notes support (separate section in markdown)
- Custom themes via frontmatter
- Presentation metadata (date, location, audience)
- Export to PDF
- Live presentation mode with remote control
- Slide analytics (views, shares)

## Implementation Timeline

**Estimated:** 2-3 hours for experienced developer

1. **Setup** (30 min) - Create plugin structure, package.json
2. **Entity & Adapter** (45 min) - Define schema, implement adapter
3. **Template** (30 min) - Create slide template using PresentationLayout
4. **Integration** (30 min) - Register in plugin, test with site-builder
5. **Testing** (30 min) - Create sample presentations, verify routing

## Related Work

- **Phase 1 & 2:** Presentation functionality extraction (Complete)
- **MCP Prompts Plan:** Could add prompts for generating/formatting presentations
- **Blog Plugin:** Similar simple entity type with markdown storage
