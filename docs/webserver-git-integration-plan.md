# Webserver Git Integration Plan (Simplified)

## Overview

This document outlines the simplified content management approach for the webserver plugin that fully integrates with the git-sync functionality and leverages the Content Generation Service. With the existing infrastructure (QueryProcessor, AIService, Plugin Context), this becomes a much simpler implementation focused on entity management and git integration.

## Core Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Git Repo       │     │  Entities    │     │  YAML Files     │
│  (.md files)    │ <-> │  (in DB)     │ --> │  (.astro-work)  │
│                 │     │              │     │  (build cache)  │
└─────────────────┘     └──────────────┘     └─────────────────┘
    Version Control      Source of Truth       Build Artifacts

                                ↑
                    Content Generation Service
                    (Uses existing QueryProcessor)
```

## File Structure

```
brain-repo/
├── notes/
│   ├── my-thoughts-on-ai.md
│   └── project-ideas.md
├── site-content/              # Website content entities
│   ├── landing-hero.md
│   ├── landing-features.md
│   ├── landing-testimonials.md
│   ├── about-intro.md
│   └── dashboard-welcome.md
└── .gitignore

website/                       # Webserver output directory
├── .astro-work/              # Git-ignored build directory
│   └── src/content/
│       ├── landing/
│       │   └── index.yaml    # Generated from entities
│       └── dashboard/
│           └── index.yaml
└── dist/                     # Built static site
```

## Site Content Entity Format

Site content entities store all their data fields directly in the frontmatter, with an optional markdown body for documentation or notes about the content.

Example: `site-content/landing-hero.md`

```markdown
---
page: landing
section: hero
headline: Welcome to My Digital Brain
subheadline: A personal knowledge management system that grows with you
ctaText: Explore My Thoughts
ctaLink: /dashboard
backgroundImage: /images/neural-network.jpg
features:
  - "🧠 AI-powered insights"
  - "📝 Markdown-based notes"
  - "🔍 Semantic search"
---

This hero section uses a neural network background image to convey
the AI-powered nature of the brain. The CTA leads to the dashboard
where users can see their recent notes and insights.

Design notes:

- Considered using a more abstract background but opted for neural network
- The three features highlight the key differentiators
- CTA text is action-oriented to encourage exploration
```

## Simplified Tools (Using Content Generation Service)

### 1. generate_site_content

Generate content for a specific page/section using the Content Generation Service.

**Input Schema:**

- `page` (string): Page name (e.g., 'landing', 'about')
- `section` (string): Section name (e.g., 'hero', 'features')
- `context` (string, optional): Additional context for generation
- `save` (boolean, default: true): Save as entity

**Behavior:**

- Uses `context.query(prompt, schema)` to generate content
- If `save` is true, creates a site-content entity
- Returns the generated content and entity ID

**Implementation:**

```typescript
handler: async (input) => {
  // Get appropriate schema for page/section
  const schema = this.getSchemaForSection(input.page, input.section);

  // Use existing plugin context query method
  const content = await this.context.query(
    `Generate ${input.section} content for ${input.page} page. ${input.context || ""}`,
    schema,
  );

  if (input.save) {
    const entity = await this.entityService.createEntity({
      entityType: "site-content",
      page: input.page,
      section: input.section,
      data: content,
      // ... other fields
    });
    return { content, entityId: entity.id };
  }

  return { content };
};
```

### 2. list_site_content

List all site content entities organized by page.

**Input Schema:**

- `page` (string, optional): Filter by specific page

**Behavior:**

- Lists all site-content entities
- Groups by page for easy navigation
- Shows section, ID, title, and last modified date

### 3. update_site_content

Update existing site content.

**Input Schema:**

- `page` (string): Page name
- `section` (string): Section name
- `updates` (object): Fields to update
- `merge` (boolean, default: true): Merge with existing or replace

**Behavior:**

- Finds existing content entity
- Updates with merge or replace strategy
- Saves back to entity (and thus to git)

### 4. build_site (enhanced)

Build the static website from current content.

**Input Schema:**

- `clean` (boolean, optional): Clean build
- `regenerateMissing` (boolean, default: true): Auto-generate missing sections

**Behavior:**

- Reads all content from site-content entities
- Optionally generates missing sections
- Writes YAML files for Astro build
- Runs the build process

## Content Generator Changes (Simplified)

The ContentGenerator class becomes much simpler by leveraging existing infrastructure:

1. **Always read from entities first**
2. **Use plugin context.query() for generation** (no custom AI integration)
3. **Write to YAML as build artifacts only**

```typescript
async generateLandingPage() {
  const sections = ['hero', 'features', 'testimonials', 'cta'];
  const pageData: any = {};

  for (const section of sections) {
    // Always try to read from entities first
    const existing = await this.getSiteContentEntity('landing', section);

    if (existing) {
      pageData[section] = existing.data;
    } else if (this.options.regenerateMissing) {
      // Use existing plugin context.query() method
      const schema = this.getSchemaForSection('landing', section);
      const generated = await this.context.query(
        `Generate ${section} content for landing page`,
        schema
      );

      // Auto-save as entity
      await this.createSiteContentEntity('landing', section, generated);
      pageData[section] = generated;

      this.logger.info(`Generated missing content for landing:${section}`);
    }
  }

  // Write to YAML for Astro build (ephemeral)
  await this.writeYamlFile('landing', 'index.yaml', pageData);
}
```

## User Workflows

### Initial Setup

```bash
# Generate initial content
User: "generate_site_content" { page: "landing", section: "hero", context: "AI consulting business" }
AI: Generated and saved content for landing:hero

# Build site (auto-generates missing sections)
User: "build_site" { regenerateMissing: true }
AI:
- Found content for landing:hero
- Generated missing content for landing:features
- Generated missing content for landing:testimonials
- Site built successfully

# Check git status
User: "git status"
AI:
New files:
  site-content/landing-hero.md
  site-content/landing-features.md
  site-content/landing-testimonials.md
```

### Editing Content

#### Option 1: Direct File Edit

```bash
# Edit in VS Code or any editor
User: *edits site-content/landing-hero.md*
User: "build_site"
AI: Site rebuilt with your changes
```

#### Option 2: Via Tools

```bash
User: "update_site_content" {
  page: "landing",
  section: "hero",
  updates: { headline: "AI Solutions for Modern Business" }
}
AI: Updated landing:hero
```

#### Option 3: Regenerate Section

```bash
User: "generate_site_content" {
  page: "landing",
  section: "features",
  context: "Focus on automation and efficiency"
}
AI: Generated and saved content for landing:features
```

### Collaboration Workflow

```bash
# Team member clones repo
git clone brain-repo
cd brain-repo

# They edit content
vim site-content/landing-hero.md

# Create PR
git checkout -b update-hero-content
git add site-content/landing-hero.md
git commit -m "Update hero headline for clarity"
git push origin update-hero-content

# After merge, original user
User: "git pull"
User: "build_site"
AI: Site rebuilt with latest content from git
```

## Implementation Steps (Simplified)

1. **Update site-content entity adapter** to use frontmatter utility (already done)
2. **Simplify ContentGenerator** to use `context.query()` instead of custom AI integration
3. **Replace capture_generated_content** with generate_site_content tool
4. **Add list_site_content and update_site_content tools**
5. **Update build_site** to support regenerateMissing option
6. **Update .gitignore** to exclude .astro-work directory
7. **Add tests** for new workflow

**Key Simplification**: No need to build custom content generation - we leverage the existing `context.query(prompt, schema)` method that's already available to all plugins via QueryProcessor and AIService.

## Site Content Adapter Changes

The adapter should be updated to use the frontmatter utility properly:

```typescript
const siteContentConfig: FrontmatterConfig<SiteContent> = {
  // Exclude only system fields, include all site-content fields
  excludeFields: ["id", "entityType", "created", "updated", "content"],
};

export const siteContentAdapter: EntityAdapter<SiteContent> = {
  toMarkdown: (entity: SiteContent): string => {
    // Put all fields (including data fields) in frontmatter
    const allFields = {
      page: entity.page,
      section: entity.section,
      ...entity.data, // Spread data fields directly into frontmatter
    };

    return generateMarkdownWithFrontmatter(
      entity.content || "", // Optional documentation in body
      allFields,
    );
  },

  fromMarkdown: (markdown: string): Partial<SiteContent> => {
    const { content, metadata } = parseMarkdownWithFrontmatter(markdown);

    // Extract page and section, rest goes to data
    const { page, section, ...dataFields } = metadata;

    return {
      page: page as string,
      section: section as string,
      data: dataFields,
      content, // Optional documentation from body
    };
  },
};
```

## Benefits

1. **Git Integration**: All content versioned and synced
2. **Direct Editing**: Can edit markdown files directly
3. **AI Generation**: Can generate/regenerate any section using existing infrastructure
4. **Flexibility**: Mix manual and AI-generated content
5. **Collaboration**: Standard git workflow for content
6. **Clean Separation**: Build artifacts separate from source
7. **Consistency**: Same entity model as notes and other content
8. **Simple Implementation**: Leverages existing QueryProcessor and AIService
9. **No Duplication**: Reuses proven content generation patterns

## Migration Path

For existing users:

1. Run `import_existing_content` tool to convert YAML to entities
2. Delete old YAML files from git
3. Add .astro-work to .gitignore
4. Rebuild site with new system

## Implementation Timeline

**Phase 1: Entity Integration (1 day)**

- Update site-content adapter to use frontmatter utility
- Test entity serialization to markdown

**Phase 2: Tool Updates (1 day)**

- Replace capture_generated_content with generate_site_content
- Add list_site_content and update_site_content tools
- Update all tools to use `context.query()`

**Phase 3: ContentGenerator Simplification (1 day)**

- Remove custom AI integration code
- Use `context.query()` for all content generation
- Add entity-first reading logic

**Phase 4: Build Integration (1 day)**

- Update build_site to support regenerateMissing
- Add .astro-work to .gitignore
- Test full workflow

**Total: 4 days for complete implementation**

## Future Enhancements

1. **Content Templates**: Define templates for common sections (via Content Generation Service)
2. **Preview Mode**: Preview changes before saving to entities
3. **Batch Operations**: Generate entire pages at once
4. **Content Validation**: Validate content against schemas
5. **A/B Testing**: Support multiple versions of content
6. **Advanced Generation**: Leverage Content Generation Service templates and context
