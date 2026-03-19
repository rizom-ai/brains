# Plan: Extract Shared Layout Helpers & Deduplicate Code

## Context

Three code review agents found significant duplication across `layouts/personal/` and `layouts/professional/`:

- Profile fetch+parse: identical 7-line block in 4 datasource files
- Site-info fetch: identical 10-line block in 2 homepage datasources
- ProfileParser classes: identical `parse()`/`format()` bodies (only schema differs)
- CTASection components: two copies with different signatures
- Sequential DB queries that should use Promise.all

## Changes

### Phase 1: Shared helpers (additive, no consumers changed)

#### 1A. Profile helpers → `@brains/identity-service`

**New file: `shell/identity-service/src/profile-helpers.ts`**

```typescript
export function createProfileParser<T>(schema: ZodSchema<T>) {
  return {
    parse(content: string): T {
      /* existing parser body */
    },
    format(data: T): string {
      /* existing format body */
    },
  };
}

export async function fetchAnchorProfile<T>(
  entityService: ICoreEntityService,
  parse: (content: string) => T,
): Promise<T> {
  /* fetch + null check + parse */
}

export const baseProfileExtension = z.object({
  tagline: z.string().optional(),
  intro: z.string().optional(),
  story: z.string().optional(),
});
```

**Modify: `shell/identity-service/src/index.ts`** — add exports
**Modify: `shell/plugins/src/index.ts`** — re-export from identity-service

#### 1B. Site-info helper → `@brains/site-builder-plugin`

**New file: `plugins/site-builder/src/services/site-info-helpers.ts`**

```typescript
export async function fetchSiteInfo(
  entityService: ICoreEntityService,
): Promise<SiteInfoBody> {
  /* fetch + null check + parse via SiteInfoAdapter */
}
```

**Modify: `plugins/site-builder/src/index.ts`** — export `fetchSiteInfo`

#### 1C. CTASection → `@brains/ui-library`

**New file: `shared/ui-library/src/CTASection.tsx`**

```typescript
interface CTASectionProps {
  cta: { heading: string; buttonText: string; buttonLink: string };
  variant?: "centered" | "editorial";
  socialLinks?: SocialLink[];
}
```

- `"centered"`: brand bg, centered text, outline-light button (personal style)
- `"editorial"`: subtle bg, left-aligned, overline label, primary button, social links (professional style)

**Modify: `shared/ui-library/src/index.ts`** — export CTASection

### Phase 2: Migrate professional layout

**`layouts/professional/package.json`** — add missing deps: `@brains/site-builder-plugin`, `@brains/ui-library`

**`layouts/professional/src/schemas/professional-profile.ts`**:

- Import `baseProfileExtension`, `createProfileParser` from `@brains/plugins`
- `professionalProfileExtension` = `baseProfileExtension.extend({ expertise, currentFocus, availability })`
- Replace class with: `export const { parse: parseProfessionalProfile, format: formatProfessionalProfile } = createProfileParser(professionalProfileSchema)`

**`layouts/professional/src/datasources/about-datasource.ts`**:

- Replace 7-line block with `fetchAnchorProfile(entityService, parseProfessionalProfile)`

**`layouts/professional/src/datasources/homepage-datasource.ts`**:

- `Promise.all` for profile, posts, decks, site-info
- Use `fetchAnchorProfile`, `fetchSiteInfo`
- Make decks optional (`entityService.hasEntityType("deck")` guard)

**Delete: `layouts/professional/src/components/CTASection.tsx`**
**`layouts/professional/src/templates/homepage-list.tsx`**: import CTASection from ui-library, add `variant="editorial"`

### Phase 3: Migrate personal layout

**`layouts/personal/src/schemas/personal-profile.ts`**:

- Import `baseProfileExtension`, `createProfileParser` from `@brains/plugins`
- `personalProfileExtension` = `baseProfileExtension` (identical fields)
- Replace class with parse function

**`layouts/personal/src/datasources/about-datasource.ts`**:

- Use `fetchAnchorProfile`
- Pre-compute `storyHtml` via `markdownToHtml` in datasource (not template)

**`layouts/personal/src/datasources/homepage-datasource.ts`**:

- `Promise.all` for profile, posts, site-info
- Use `fetchAnchorProfile`, `fetchSiteInfo`

**Delete: `layouts/personal/src/components/CTASection.tsx`**
**`layouts/personal/src/templates/homepage.tsx`**: import CTASection from ui-library, `variant="centered"`
**`layouts/personal/src/templates/about.tsx`**: use pre-computed `storyHtml`
**`layouts/personal/src/routes.ts`**: `layout: "personal"` → `layout: "default"`

### Phase 4: Update tests + verify

- Update `layouts/professional/test/` — parser class → function, dependency assertion
- `bun run typecheck` (all packages)
- `bun test layouts/professional/ layouts/personal/`
- `bun run lint`

## Files

| File                                                          | Action                      |
| ------------------------------------------------------------- | --------------------------- |
| `shell/identity-service/src/profile-helpers.ts`               | Create                      |
| `shell/identity-service/src/index.ts`                         | Add exports                 |
| `shell/plugins/src/index.ts`                                  | Re-export helpers           |
| `plugins/site-builder/src/services/site-info-helpers.ts`      | Create                      |
| `plugins/site-builder/src/index.ts`                           | Export fetchSiteInfo        |
| `shared/ui-library/src/CTASection.tsx`                        | Create                      |
| `shared/ui-library/src/index.ts`                              | Export CTASection           |
| `layouts/professional/package.json`                           | Fix missing deps            |
| `layouts/professional/src/schemas/professional-profile.ts`    | Replace class with function |
| `layouts/professional/src/schemas/index.ts`                   | Update exports              |
| `layouts/professional/src/datasources/about-datasource.ts`    | Use helpers                 |
| `layouts/professional/src/datasources/homepage-datasource.ts` | Use helpers + Promise.all   |
| `layouts/professional/src/components/CTASection.tsx`          | Delete                      |
| `layouts/professional/src/templates/homepage-list.tsx`        | Import from ui-library      |
| `layouts/personal/src/schemas/personal-profile.ts`            | Replace class with function |
| `layouts/personal/src/schemas/index.ts`                       | Update exports              |
| `layouts/personal/src/datasources/about-datasource.ts`        | Use helpers + storyHtml     |
| `layouts/personal/src/datasources/homepage-datasource.ts`     | Use helpers + Promise.all   |
| `layouts/personal/src/components/CTASection.tsx`              | Delete                      |
| `layouts/personal/src/templates/homepage.tsx`                 | Import from ui-library      |
| `layouts/personal/src/templates/about.tsx`                    | Use storyHtml               |
| `layouts/personal/src/routes.ts`                              | layout key → "default"      |
| `layouts/professional/test/plugin.test.ts`                    | Update dependency assertion |
