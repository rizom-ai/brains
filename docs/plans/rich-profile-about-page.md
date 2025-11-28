# Plan: Rich Profile & About Page

## Overview

Extend the profile-service with richer personal/organizational data and create an about page template in professional-site that renders this data.

## Decisions Made

1. **Single rich profile entity** - extend current profile.md with more sections (not separate entities)
2. **Support both individuals and organizations** - flexible schema
3. **AI context integration** - profile data feeds into AI prompts
4. **Static template in professional-site** - no separate plugin needed
5. **About page only** - no CV/PDF export for now
6. **Add all fields now, optional** - complete schema upfront, fill incrementally

## Schema Extension

### New Optional Fields

```typescript
// For both individuals and organizations
avatar?: string;              // URL or asset path
story?: string;               // Extended bio/narrative (multi-paragraph markdown)
expertise?: string[];         // Skills, domains, areas of focus
currentFocus?: string;        // What you're working on now

// For individuals
experience?: Array<{
  role: string;
  organization: string;
  startDate?: string;
  endDate?: string;           // Omit for current
  description?: string;
}>;

education?: Array<{
  degree?: string;
  institution: string;
  year?: string;
  field?: string;
}>;

achievements?: Array<{
  title: string;
  description?: string;
  date?: string;
  url?: string;               // Link to publication, talk, etc.
}>;

// For organizations
founding?: {
  year?: string;
  story?: string;
};

team?: Array<{
  name: string;
  role: string;
  bio?: string;
  avatar?: string;
}>;

// Shared
availability?: string;        // What you're open to (consulting, speaking, etc.)
```

## Implementation Steps

### 1. Extend Profile Schema

- Update `shell/profile-service/src/schema.ts` with new fields
- Update `profileBodySchema` with all optional fields
- Keep backward compatible - existing profiles work unchanged

### 2. Update Profile Adapter

- Update `shell/profile-service/src/adapter.ts`
- Add new field mappings to StructuredContentFormatter
- Handle nested arrays (experience, education, achievements, team)

### 3. Update Profile Adapter Tests

- Add tests for new fields in `shell/profile-service/test/adapter.test.ts`
- Test roundtrip for complex nested structures

### 4. Create About Page Template

- Create `plugins/professional-site/src/templates/about.tsx`
- Conditionally render sections based on available data
- Style consistent with existing professional-site design

### 5. Register About Route

- Update `plugins/professional-site/src/plugin.ts`
- Add `/about` route that fetches profile and renders template

### 6. Integrate Profile into AI Context

- Add `getProfile` callback to `AIContentDataSource` constructor (mirrors `getIdentity` pattern)
- Update `buildSystemPrompt()` to include profile context
- Pass profile callback from Shell when creating AIContentDataSource

### 7. Update Seed Content

- Update `apps/professional-brain/seed-content/profile/profile.md` with example rich content

## Files to Modify

- `shell/profile-service/src/schema.ts` - extend schema
- `shell/profile-service/src/adapter.ts` - update formatter mappings
- `shell/profile-service/test/adapter.test.ts` - add tests
- `shell/core/src/datasources/ai-content-datasource.ts` - add profile to AI context
- `shell/core/src/shell.ts` - pass profile callback to AIContentDataSource
- `plugins/professional-site/src/plugin.ts` - add about route
- `plugins/professional-site/src/templates/about.tsx` (new)
- `apps/professional-brain/seed-content/profile/profile.md` - example content

## Template Sections (conditional)

The about page will render these sections if data exists:

1. **Hero** - avatar, name, tagline
2. **Intro** - intro paragraph
3. **Story** - extended narrative
4. **Expertise** - skills/domains grid
5. **Experience** - work history timeline
6. **Education** - degrees/certifications
7. **Achievements** - publications, talks, awards
8. **Availability** - what you're open to
9. **Contact** - email, social links

For organizations, replace Experience/Education with:

- **Founding Story**
- **Team Members**
