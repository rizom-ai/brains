# Professional Brain Homepage Redesign

**Status:** Planning Complete - Ready for Implementation
**Date:** 2025-11-16
**Goal:** Redesign professional brain homepage to use Ben Evans style essay list with integrated decks section

## Background

Current homepage shows the full latest blog post OR falls back to HOME.md. This doesn't provide a good overview of all content. Ben Evans' site (https://www.ben-evans.com/) uses a clean, simple essay list that's more suitable for a professional showcase.

## Requirements (from Q&A)

1. ✅ Show BOTH blog posts AND presentation decks
2. ✅ Display in **separate sections** (not integrated chronologically)
3. ✅ Essays section: **Simple list** style (title, date, excerpt - minimal like Ben Evans)
4. ✅ Create **new custom template** (not modify existing)
5. ✅ Start with **sample deck** to demonstrate functionality
6. ✅ Use **profile entity** for homepage intro (extend with tagline/intro fields)

## Architecture Decisions

### Profile Entity Extension

- Add `tagline` (optional string) - Short, punchy one-liner
- Add `intro` (optional string) - Optional longer description for homepage
- Falls back to existing `description` if tagline/intro not set
- Keeps all "about the person" data in one place

### New Homepage Template

**Name:** `blog:homepage-list`

**Structure:**

1. **Header Section**
   - Display profile name
   - Display tagline (or description as fallback)
   - Display intro if present
   - Minimal, clean design

2. **Essays Section**
   - Simple list layout (inspired by Ben Evans)
   - For each post: title (linked), date, excerpt
   - No card components, no images
   - Clean typography focus

3. **Presentations Section**
   - Simple list layout (matching essays style)
   - For each deck: title (linked), date, description
   - Links to `/decks/{slug}` detail pages

**Datasource:**

- Fetches profile entity for header
- Fetches latest blog posts (limit: 10-20)
- Fetches latest decks (limit: 5-10)
- Sorts by date descending

### DecksPlugin Integration

- Add `decksPlugin` to professional brain plugins array
- Auto-generates routes:
  - `/decks` - List all presentations
  - `/decks/{id}` - Individual presentation detail view
- Uses existing deck templates from @brains/decks

### Sample Content

Create sample deck: `brain-data/deck/sample-presentation.md`

- Demonstrates deck functionality
- Provides example for future decks
- Can be replaced/removed later

## Implementation Phases

### Phase 1: Extend Profile Schema

**Files to modify:**

- `core/src/entities/profile/schema.ts` - Add tagline/intro fields
- `core/src/entities/profile/formatter.ts` - Handle new fields
- `apps/professional-brain/brain-data/profile/profile.md` - Add example data

**Changes:**

```typescript
// schema.ts
tagline: z.string().optional(),
intro: z.string().optional(),
```

### Phase 2: Add DecksPlugin

**Files to modify:**

- `apps/professional-brain/brain.config.ts`

**Changes:**

```typescript
import { decksPlugin } from "@brains/decks";

plugins: [
  // ... existing plugins
  blogPlugin({}),
  decksPlugin({}), // Add this
  siteBuilderPlugin({ ... }),
]
```

### Phase 3: Create Sample Deck

**New file:**

- `apps/professional-brain/brain-data/deck/sample-presentation.md`

**Content:**

- Title: "Sample Presentation"
- 3-5 slides demonstrating deck format
- Markdown-based slides

### Phase 4: Create Homepage Template

**New files:**

- `plugins/blog/src/templates/homepage-list.tsx` - Layout component
- `plugins/blog/src/datasources/homepage-datasource.ts` - Data fetching
- Update `plugins/blog/src/index.ts` - Export new template

**Template structure:**

```typescript
interface HomepageListData {
  profile: ProfileEntity;
  posts: PostEntity[];
  decks: DeckEntity[];
}
```

**Layout features:**

- Responsive design
- Dark mode compatible
- Semantic HTML
- Accessible

### Phase 5: Update Homepage Route

**Files to modify:**

- `apps/professional-brain/brain.config.ts`

**Changes:**

```typescript
{
  id: "home",
  sections: [
    {
      template: "blog:homepage-list", // Changed from "blog:homepage"
      dataQuery: {},
    }
  ]
}
```

### Phase 6: Testing

**Manual testing:**

- [ ] Build preview site: `bun run build:preview`
- [ ] Start dev server: `bun run dev`
- [ ] Verify light mode appearance
- [ ] Verify dark mode appearance (toggle theme)
- [ ] Check responsive design (mobile, tablet, desktop)
- [ ] Verify essay links work
- [ ] Verify deck links work
- [ ] Check `/decks` list page
- [ ] Check `/decks/{slug}` detail page

## Success Criteria

- [ ] Homepage shows clean list of essays (Ben Evans style)
- [ ] Homepage shows separate section for presentations
- [ ] Profile tagline/intro displays at top
- [ ] All links functional
- [ ] Works in both light and dark modes
- [ ] Responsive design works on all screen sizes
- [ ] No TypeScript errors
- [ ] All tests pass
- [ ] No ESLint warnings

## Future Enhancements (Not in Scope)

- Pagination for long lists
- Filtering/search functionality
- Tags/categories display
- RSS feed link
- Newsletter signup integration
- Analytics integration

## Notes

- Keep design minimal and clean (Ben Evans style)
- Use semantic tokens from theming system
- No hardcoded colors
- Focus on typography and whitespace
- Mobile-first responsive design
