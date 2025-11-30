# Plan: Rich Profile & About Page

## Overview

Extend the profile system to support rich about pages while keeping core profile minimal and shared across site types (professional, team, etc.).

## Decisions Made

1. **Profile stays in core** - 1:1 relationship with brain (anchor identity)
2. **Schema split** - base fields in core, professional fields in professional-site extension
3. **AI context integration** - profile data feeds into AI prompts
4. **Static template in professional-site** - no separate plugin needed
5. **About page only** - no CV/PDF export for now
6. **Build extension first, then migrate** - avoid breaking changes

## Schema Split

### Base Profile (core profile-service) - shared by all site types

```typescript
name: string;                 // Required - who is the anchor
description?: string;         // Short description
avatar?: string;              // URL or asset path to avatar/logo
website?: string;             // Primary website URL
email?: string;               // Contact email
socialLinks?: Array<{         // Social media links
  platform: "github" | "instagram" | "linkedin" | "email" | "website";
  url: string;
  label?: string;
}>;
```

### Professional Extension (professional-site plugin)

```typescript
// Move from core
tagline?: string;             // Short, punchy one-liner
intro?: string;               // Longer introduction

// New fields
story?: string;               // Extended bio/narrative (multi-paragraph)
expertise?: string[];         // Skills, domains, areas of focus
currentFocus?: string;        // What you're working on now
availability?: string;        // Open to consulting, speaking, etc.

// Future
experience?: Array<{...}>;    // Work history
education?: Array<{...}>;     // Education history
achievements?: Array<{...}>;  // Publications, talks, awards
```

### Organization Extension (future - team-site plugin)

```typescript
founding?: { year?: string; story?: string; };
team?: Array<{ name: string; role: string; bio?: string; avatar?: string; }>;
mission?: string;
```

## Implementation Steps

### Step 1: Add avatar to core profile

- Add `avatar: z.string().optional()` to profileBodySchema
- Add avatar mapping to ProfileAdapter
- Update tests
- Run typecheck + tests

### Step 2: Create professional profile extension in professional-site

- Create `plugins/professional-site/src/schemas/professional-profile.ts`
- Define schema that extends base with: tagline, intro, story, expertise, currentFocus, availability
- Create parser that reads these fields from profile.md

### Step 3: Update professional-site to use extension

- Update homepage-datasource to use extended schema
- Profile.md still contains all fields - we just parse them via extension
- Existing tests continue to pass

### Step 4: Remove tagline, intro from core profile

- Remove from profileBodySchema
- Remove from ProfileAdapter mappings
- Update core tests
- professional-site still works (reads via its own extension)

### Step 5: Add new professional fields

- Add story, expertise, currentFocus, availability to professional extension schema
- Update professional-site parser

### Step 6: Create About Page

- Create `plugins/professional-site/src/templates/about.tsx`
- Conditionally render sections based on available data
- Register `/about` route in plugin

### Step 7: AI Context Integration

- Add `getProfile` callback to AIContentDataSource
- Profile becomes part of AI system prompt

### Step 8: Update Seed Content

- Update professional-brain profile.md with example rich content

## Files to Modify

**Core (profile-service):**

- `shell/profile-service/src/schema.ts` - add avatar, later remove tagline/intro
- `shell/profile-service/src/adapter.ts` - update mappings
- `shell/profile-service/test/*.test.ts` - update tests

**Professional-site:**

- `plugins/professional-site/src/schemas/professional-profile.ts` (new)
- `plugins/professional-site/src/datasources/homepage-datasource.ts`
- `plugins/professional-site/src/templates/about.tsx` (new)
- `plugins/professional-site/src/plugin.ts` - add route

**Core (AI integration):**

- `shell/core/src/datasources/ai-content-datasource.ts`
- `shell/core/src/shell.ts`

**Seed content:**

- `apps/professional-brain/seed-content/profile/profile.md`

## About Page Sections (conditional)

1. **Hero** - avatar, name, tagline
2. **Intro** - intro paragraph
3. **Story** - extended narrative
4. **Expertise** - skills/domains grid
5. **Current Focus** - what you're working on
6. **Availability** - what you're open to
7. **Contact** - email, social links

## Key Insight

The order matters: build the replacement (professional extension) BEFORE removing fields from core. This prevents breaking changes during migration.
