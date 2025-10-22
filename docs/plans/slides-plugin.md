# Slides Plugin - Implementation Plan

## Philosophy

- Presentations are markdown files with frontmatter
- Git handles versioning, history, collaboration
- Plugin provides entity type + rendering only
- No complex commands - use existing file operations

## Plugin Structure

### 1. Entity Type: `slide`

**Schema:**

```typescript
{
  id: string;           // filename without .md
  title: string;        // from frontmatter
  description?: string; // from frontmatter
  tags?: string[];     // from frontmatter
  content: string;     // markdown with --- separators
  created: Date;
  updated: Date;
}
```

**Storage:** `brain-data/slides/my-presentation.md`

**Example File:**

```markdown
---
title: TypeScript Introduction
description: Learn TypeScript basics
tags: [typescript, programming]
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

### 2. Minimal Adapter

**File:** `plugins/slides/src/adapters/slide-adapter.ts`

- `toMarkdown()` - serialize with frontmatter
- `fromMarkdown()` - parse frontmatter + content
- Simple, like LinkAdapter or SummaryAdapter
- No complex formatting needed

### 3. Presentation Template

**File:** `plugins/slides/src/templates/slide-template.ts`

- Uses `PresentationLayout` from `@brains/ui-library`
- Auto-detects `---` separators
- Schema: just `{ markdown: string }`
- Leverages work from Phase 1 & 2

### 4. Site Integration

- DynamicRouteGenerator creates `/slides/[id]` routes automatically
- Uses existing pattern (looks for `slide-detail` template)
- No manual route configuration needed

### 5. Optional: Single List Command

**File:** `plugins/slides/src/commands/index.ts`

- `/slides` - list all presentations
- Optional - can use `/search slide` instead
- Minimal implementation (~50 lines)

## Workflow

### Creating Presentations

```bash
# Just create a markdown file
cat > brain-data/slides/my-talk.md << 'EOF'
---
title: My Presentation
description: About TypeScript
tags: [typescript, coding]
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
git add brain-data/slides/my-talk.md
git commit -m "Add TypeScript presentation"
```

### Viewing Presentations

- Navigate to `/slides/my-talk`
- Auto-generated route shows Reveal.js presentation
- Slide separators (`---`) detected automatically

### Versioning

- Git tracks changes automatically
- Commit, branch, merge - normal git workflow
- Presentation history = git history
- No custom versioning system needed

## Files to Create

```
plugins/slides/
├── src/
│   ├── adapters/
│   │   └── slide-adapter.ts        (~80 lines)
│   ├── entities/
│   │   └── slide-schema.ts         (~30 lines)
│   ├── templates/
│   │   └── slide-template.ts       (~25 lines)
│   ├── commands/
│   │   └── index.ts                (~50 lines, optional)
│   └── plugin.ts                   (~60 lines)
├── package.json
└── tsconfig.json
```

**Total:** ~250 lines of code for full plugin

## Implementation Pattern

Follow existing plugins:

- Link plugin (~400 lines total)
- Summary plugin (~500 lines total)
- Topics plugin (~450 lines total)

Slides plugin will be even simpler (~250 lines) since it doesn't need:

- AI integration
- Complex parsing
- External API calls
- Custom commands for CRUD operations

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

### Phase 3 (Slides Plugin)

- Define `slide` entity type
- Create slide adapter
- Register slide template
- DynamicRouteGenerator picks it up automatically

## Technical Details

### Slide Schema (Zod)

```typescript
import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/entity-service";

export const slideSchema = baseEntitySchema.extend({
  title: z.string().describe("Presentation title"),
  description: z.string().optional().describe("Brief description"),
  tags: z.array(z.string()).optional().describe("Tags for categorization"),
});

export type SlideEntity = z.infer<typeof slideSchema>;
```

### Adapter Pattern

```typescript
export class SlideAdapter extends EntityAdapter<SlideEntity> {
  entityType = "slide" as const;
  schema = slideSchema;

  toMarkdown(entity: SlideEntity): string {
    return generateMarkdownWithFrontmatter(entity.content, entity.metadata);
  }

  fromMarkdown(markdown: string): SlideEntity {
    const { frontmatter, content } = parseMarkdownWithFrontmatter(markdown);
    return this.schema.parse({
      ...frontmatter,
      content,
      // ... timestamps
    });
  }
}
```

### Template Registration

```typescript
export const slideTemplate = createTemplate<{ markdown: string }>({
  name: "slide-detail",
  description: "Render a presentation as Reveal.js slides",
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

1. Can create presentation by creating markdown file in `brain-data/slides/`
2. Presentation appears in search results
3. Can view presentation at `/slides/[id]` route
4. Reveal.js renders slides from `---` separators
5. Git tracks all changes to presentations
6. Can tag and categorize presentations via frontmatter

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
