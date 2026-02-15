# Add missing entity types to Sveltia CMS

## Context

The CMS config generator (`plugins/site-builder/src/lib/cms-config.ts`) creates Sveltia CMS collections only for adapters that expose a `frontmatterSchema` property. Five entity types are missing from the CMS because they either use `StructuredContentFormatter` (no frontmatter) or don't expose their schema:

- **identity** — singleton, StructuredContentFormatter, fields: name, role, purpose, values
- **profile** — singleton, StructuredContentFormatter, fields: name, description, avatar, website, email, socialLinks
- **site-info** — singleton, StructuredContentFormatter, fields: title, description, copyright, logo, themeMode, cta
- **topic** — multi-file, StructuredContentFormatter, fields: content (body), keywords, sources (auto-generated)
- **site-content** — multi-file, already uses frontmatter but adapter doesn't expose `frontmatterSchema`

The CMS writes files in frontmatter format (YAML + markdown body). These adapters must be converted to frontmatter format. The CMS config generator also only supports `folder` collections — it needs `files` collection support for singletons.

## Design Decisions

1. **Singletons grouped into one "Settings" collection** — standard Sveltia/Decap CMS pattern, cleaner sidebar
2. **No body widget for pure-data entities** (identity, profile, site-info) — all data is in named fields, no free-form markdown
3. **Topic title moves to frontmatter** — consistent with blog posts, notes, decks. Sources stay in body (auto-generated, not CMS-editable)
4. **Backward compatibility** — `fromMarkdown()` handles both old structured format and new frontmatter format. Migration happens naturally as entities get updated.

## Changes

### 1. EntityAdapter interface: `shell/entity-service/src/types.ts`

Add two optional properties:

```typescript
isSingleton?: boolean;   // Singleton entity (one file, e.g., identity/identity.md)
hasBody?: boolean;       // Has free-form markdown body below frontmatter (default: true)
```

### 2. Site-content adapter: `plugins/site-builder/src/entities/site-content-adapter.ts`

Just expose the existing `frontmatterSchema` const (line 12) as a class property:

```typescript
public readonly frontmatterSchema = frontmatterSchema;
```

No other changes needed — already uses frontmatter format.

### 3. Identity adapter: `shell/identity-service/src/`

**Schema** (`schema.ts`): Add `identityFrontmatterSchema` (same shape as `identityBodySchema`).

**Adapter** (`adapter.ts`):

- Add `frontmatterSchema = identityFrontmatterSchema`, `isSingleton = true`, `hasBody = false`
- `toMarkdown()`: Use `generateMarkdownWithFrontmatter("", data)` instead of StructuredContentFormatter
- `fromMarkdown()`: Try frontmatter first (`---` prefix), fall back to StructuredContentFormatter
- `parseIdentityBody()`: Same dual-format handling
- Reuse: `parseMarkdownWithFrontmatter()` and `generateMarkdownWithFrontmatter()` from `@brains/plugins`

### 4. Profile adapter: `shell/profile-service/src/`

Same pattern as identity.

**Schema** (`schema.ts`): Add `profileFrontmatterSchema` (same shape as `profileBodySchema`).

**Adapter** (`adapter.ts`):

- Add `frontmatterSchema`, `isSingleton = true`, `hasBody = false`
- Convert `toMarkdown()` from passthrough to frontmatter generation
- Dual-format `fromMarkdown()` and `parseProfileBody()`

**Professional profile parser** (`plugins/professional-site/src/schemas/professional-profile.ts`):

- `ProfessionalProfileParser.parse()`: Try frontmatter first, fall back to StructuredContentFormatter
- `ProfessionalProfileParser.format()`: Write frontmatter format
- Import `parseMarkdownWithFrontmatter`, `generateMarkdownWithFrontmatter` from `@brains/plugins`

### 5. Site-info adapter: `plugins/site-builder/src/services/`

Same pattern as identity.

**Schema** (`site-info-schema.ts`): Add `siteInfoFrontmatterSchema` (same shape as `siteInfoBodySchema`).

**Adapter** (`site-info-adapter.ts`):

- Add `frontmatterSchema`, `isSingleton = true`, `hasBody = false`
- Convert `toMarkdown()` to frontmatter
- Dual-format `fromMarkdown()` and `parseSiteInfoBody()`

### 6. Topic adapter: `plugins/topics/src/`

**Schema** (`schemas/topic.ts`): Add frontmatter schema:

```typescript
export const topicFrontmatterSchema = z.object({
  title: z.string(),
  keywords: z.array(z.string()).optional(),
});
```

Sources excluded — auto-generated, not CMS-editable.

**Adapter** (`lib/topic-adapter.ts`):

- Add `frontmatterSchema = topicFrontmatterSchema` (no `isSingleton`, topics are multi-file)
- `toMarkdown()`: Write title + keywords as frontmatter, content as body, sources as `## Sources` appendix in body
- `fromMarkdown()`: Parse frontmatter for title/keywords, parse body for content and sources
- `parseTopicBody()`: Dual-format handling

### 7. CMS config generator: `plugins/site-builder/src/lib/cms-config.ts`

**Types**: Make `CmsCollection` a union supporting both `folder` and `files` collection types.

**`generateCmsConfig()`**:

1. Separate entity types into singletons vs multi-file
2. Multi-file → `folder` collections (existing behavior)
3. Singletons → grouped into one `files` collection named "Settings"
4. Skip body widget when `adapter.hasBody === false`
5. Singleton file paths: `{entityType}/{entityType}.md`

**Update `CmsConfigOptions.getAdapter` return type** to include `isSingleton?` and `hasBody?`.

### 8. Tests

| Test file                                          | Changes                                                         |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `shell/identity-service/test/adapter.test.ts`      | Frontmatter format output, dual-format input, backward compat   |
| `shell/profile-service/test/adapter.test.ts`       | Same as identity                                                |
| `plugins/site-builder/test/` (site-info adapter)   | Frontmatter format, dual-format                                 |
| `plugins/topics/test/lib/topic-adapter.test.ts`    | Frontmatter+body format, sources in body                        |
| `plugins/site-builder/test/lib/cms-config.test.ts` | Singleton files collection, body suppression, mixed collections |
| `plugins/professional-site/test/`                  | Parser handles both formats                                     |

## Implementation Order

| Step  | Files                                                       | Description                                     |
| ----- | ----------------------------------------------------------- | ----------------------------------------------- |
| 1     | `shell/entity-service/src/types.ts`                         | Add `isSingleton?`, `hasBody?` to EntityAdapter |
| 2     | `site-content-adapter.ts`                                   | Expose existing `frontmatterSchema`             |
| 3-4   | `shell/identity-service/src/` + tests                       | Convert identity to frontmatter                 |
| 5-7   | `shell/profile-service/src/` + professional-profile + tests | Convert profile to frontmatter                  |
| 8-9   | `site-info-schema.ts`, `site-info-adapter.ts` + tests       | Convert site-info to frontmatter                |
| 10-11 | `plugins/topics/src/` + tests                               | Convert topic to frontmatter+body               |
| 12-13 | `cms-config.ts` + tests                                     | Singleton collection support                    |
| 14    | Full repo                                                   | `bun run typecheck && bun test`                 |

## Verification

1. `bun run typecheck` — all tasks pass
2. `bun test shell/identity-service/` — adapter tests pass
3. `bun test shell/profile-service/` — adapter tests pass
4. `bun test plugins/site-builder/` — CMS config + site-info tests pass
5. `bun test plugins/topics/` — topic adapter tests pass
6. `bun test plugins/professional-site/` — parser tests pass
7. `bun run lint` — no lint errors
