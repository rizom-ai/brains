# Professional Brain Setup Plan

## Overview

Create `apps/professional-brain` - a brain application for an individual professional that serves dual purposes:

1. **Knowledge Management**: Personal note-taking, content capture, and organization
2. **Public Showcase**: Professional portfolio and blog with public-facing website

This differs from `collective-brain` (team/organization) by focusing on individual professional needs with emphasis on public content creation and presentation.

## Implementation Approach

**Three-Phase Strategy**:

1. **Phase 1**: Setup basic app structure (minimal but runnable)
2. **Phase 2**: Develop blog plugin
3. **Phase 3**: Complete app by integrating blog plugin

## Phase 1: Basic App Setup

**Estimated Time**: 1-2 hours

### Goals

- Create minimal but **runnable** professional-brain app
- Use only essential plugins: SystemPlugin, directory-sync, site-builder, webserver
- Provide seed content for identity, profile, and site-info

### Files to Create

```
apps/professional-brain/
├── brain.config.ts          # Main configuration
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript config
├── .env.example             # Environment variables template
├── README.md                # Setup instructions
└── seed-content/            # Initial content
    ├── identity/
    │   └── identity.md      # AI personality config
    ├── profile/
    │   └── profile.md       # Professional profile
    ├── site-info/
    │   └── site-info.md     # Website presentation
    ├── HOME.md              # Homepage content
    └── README.md            # About page content
```

### Configuration Details

**Plugins** (brain.config.ts):

- `SystemPlugin` - Core system functionality
- `directorySync` - Bidirectional file sync with seed content
- `WebserverInterface` - Preview server
- `siteBuilderPlugin` - Static site generation with default theme

**Dependencies** (package.json):

- @brains/app
- @brains/default-site-content
- @brains/directory-sync
- @brains/site-builder-plugin
- @brains/system
- @brains/theme-default
- @brains/webserver
- preact

**Scripts**:

- `dev`: Run with watch mode
- `start`: Production start
- `migrate`: Run all migrations
- `test`: Run tests
- `typecheck`: Type checking

### Success Criteria

- ✓ App starts with `bun run dev`
- ✓ Seed content syncs to brain-data/
- ✓ Preview site generates at http://localhost:4321
- ✓ No errors in console
- ✓ Type checking passes

## Phase 2: Blog Plugin Development

**Estimated Time**: 3-4 hours

### Goals

- Implement blog plugin following `docs/plugins/blog-plugin-plan.md`
- Thin wrapper over entity system
- Markdown-based with frontmatter
- Site builder integration

### Implementation Tasks

1. **Plugin Structure** (~30 min)
   - Create `plugins/blog/` directory
   - Setup package.json with dependencies
   - Create src/plugin.ts and src/schema.ts

2. **Entity Schema** (~30 min)
   - Define BlogEntity with Zod schema
   - Fields: id, title, slug, content, status, publishedAt, tags, createdAt, updatedAt
   - Status enum: draft, published

3. **Tools Implementation** (~1.5 hours)
   - `blog:new` - Create new blog post
   - `blog:publish` - Publish draft post
   - `blog:unpublish` - Unpublish post back to draft
   - `blog:list` - List all blog posts with filtering

4. **Site Builder Integration** (~1 hour)
   - Blog list page template (/blog)
   - Blog post detail template (/blog/[slug])
   - Route configuration
   - Navigation integration

5. **Tests** (~1 hour)
   - Plugin initialization tests
   - Tool execution tests
   - Schema validation tests
   - Mock entity service

6. **Documentation** (~30 min)
   - Plugin README
   - Usage examples
   - API documentation

### Success Criteria

- ✓ Plugin loads without errors
- ✓ All 4 tools work correctly
- ✓ Blog entities stored as markdown files
- ✓ All tests pass
- ✓ Type checking passes
- ✓ Site templates render correctly

## Phase 3: Complete App

**Estimated Time**: 30-60 minutes

### Goals

- Integrate blog plugin into professional-brain app
- Verify end-to-end workflow
- Update documentation

### Integration Tasks

1. **Update brain.config.ts** (~10 min)
   - Add blog plugin import
   - Add to plugins array
   - Configure blog routes in site-builder

2. **Update package.json** (~5 min)
   - Add @brains/blog dependency

3. **Add Example Content** (~15 min)
   - Create seed-content/blog/ directory
   - Add 1-2 example blog posts
   - Include published and draft examples

4. **Update Documentation** (~15 min)
   - Update app README with blog usage
   - Document blog workflow
   - Add examples

5. **Testing** (~15 min)
   - Run full migration
   - Test blog:new tool
   - Test blog:publish workflow
   - Verify blog pages on site
   - Check type checking and tests

### Success Criteria

- ✓ Blog plugin fully integrated
- ✓ Can create blog posts via CLI
- ✓ Can publish/unpublish posts
- ✓ Blog list and detail pages render correctly
- ✓ All tests pass
- ✓ Type checking passes
- ✓ Documentation complete

## Scope

### In Scope

- Blog plugin for long-form content (HIGH PRIORITY)
- Professional brain app configuration
- Default theme usage (theme-default)
- Integration with core plugins (directory-sync, site-builder)
- Seed content structure for professional use case

### Out of Scope (Future)

- Portfolio plugin (LOW PRIORITY - defer to future)
- Task management (secondary feature)
- Calendar integration (not needed)
- Custom theme development (use theme-default)
- Link, topics, summary plugins (defer to Phase 3 or later)

## Timeline

**Total Estimated Time**: 5-7 hours

- **Phase 1**: 1-2 hours
- **Phase 2**: 3-4 hours
- **Phase 3**: 30-60 minutes

## Dependencies

### External

- All existing shell packages (@brains/\*)
- theme-default
- default-site-content

### New

- blog-plugin (created in Phase 2)

## Reference Documentation

- **Blog Plugin Plan**: `docs/plugins/blog-plugin-plan.md`
- **Collective Brain**: `apps/collective-brain/` (reference structure)
- **Entity Model**: `docs/entity-model.md`
- **Plugin System**: `docs/plugin-system.md`

## Notes

- Follow Component Interface Standardization pattern
- Use Zod schemas for all validation
- Maintain compatibility with existing brain apps
- No custom theme needed - theme-default is sufficient
- Focus on blog functionality first, defer other features
