# UI Component Abstraction Plan

**Status:** Planning
**Created:** 2025-01-12
**Priority:** Medium

## Context

Following the successful extraction of Card components (Card, CardImage, CardTitle, CardMetadata) from plugin templates, we've identified additional common UI patterns across the codebase that could benefit from abstraction. This plan outlines which patterns to abstract and how to implement them incrementally.

## Current State

We have 7 plugins with template files that contain duplicate UI patterns:

- **Blog Plugin**: blog-list.tsx, series-list.tsx, PostMetadata.tsx
- **Decks Plugin**: deck-list/layout.tsx
- **Link Plugin**: link-list/layout.tsx
- **Summary Plugin**: summary-list/layout.tsx, summary-detail/layout.tsx
- **Topics Plugin**: topic-list/layout.tsx, topic-detail/layout.tsx
- **Site-builder**: dashboard/layout.tsx

## Identified Patterns

### 1. Empty State Messages (8 occurrences)

**Pattern:**

```tsx
{
  items.length === 0 && (
    <div className="text-center py-12">
      <p className="text-theme-muted">No [items] yet.</p>
      <p className="text-sm text-theme-muted mt-2">
        [Secondary explanation text]
      </p>
    </div>
  );
}
```

**Locations:**

- blog-list.tsx (line 56-60)
- series-list.tsx (line 64-68)
- deck-list/layout.tsx (line 41-50)
- link-list/layout.tsx (line 107-115)
- summary-list/layout.tsx (line 56-63)
- summary-detail/layout.tsx (line 65-71)
- topic-list/layout.tsx (line 50-57)

**Potential Savings:** ~28 lines of code

### 2. Page Header with Count Summary (6 occurrences)

**Pattern:**

```tsx
<div className="mb-8">
  <h1 className="text-3xl font-bold mb-2 text-theme">[Title]</h1>
  <p className="text-theme-muted">
    {count} {count === 1 ? "singular" : "plural"} [additional text]
  </p>
</div>
```

**Locations:**

- blog-list.tsx (line 17)
- deck-list/layout.tsx (line 9-15)
- link-list/layout.tsx (line 12-15)
- summary-list/layout.tsx (line 12-17)
- topic-list/layout.tsx (line 12-15)

**Potential Savings:** ~50 lines of code

### 3. Date Formatting (8+ occurrences)

**Pattern:**

```tsx
// Variant A: Full format
{
  new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Variant B: Simple format
{
  new Date(date).toLocaleDateString();
}

// Variant C: With time
{
  new Date(date).toLocaleString();
}
```

**Locations:**

- PostMetadata.tsx (line 27-31)
- deck-list/layout.tsx (line 33)
- link-list/layout.tsx (line 60)
- summary-list/layout.tsx (line 44-49)
- summary-detail/layout.tsx (line 24-26, 41-48)
- topic-list/layout.tsx (line 42)
- topic-detail/layout.tsx (line 19-25)
- dashboard/layout.tsx (line 98, 109)

**Benefit:** Consistency + easier future changes

### 4. Tags/Keywords Display (4 occurrences)

**Pattern:**

```tsx
<div className="flex flex-wrap gap-2">
  {items.slice(0, limit).map((item) => (
    <span
      key={item}
      className="px-2 py-1 text-xs bg-theme-muted rounded-full text-theme"
    >
      {item}
    </span>
  ))}
  {items.length > limit && (
    <span className="px-2 py-1 text-xs text-theme-muted">
      +{items.length - limit} more
    </span>
  )}
</div>
```

**Locations:**

- link-list/layout.tsx (line 41-55)
- topic-list/layout.tsx (line 27-36)
- topic-detail/layout.tsx (line 35-48)
- PostMetadata.tsx (line 34-38) - Draft status badge

**Potential Savings:** ~40 lines of code

### 5. Back/Navigation Links (3 occurrences)

**Pattern:**

```tsx
// Simple back link
<a href="/[route]" className="text-brand hover:text-brand-dark">
  ← Back to [Items]
</a>

// Prev/Next navigation
<nav className="flex justify-between items-center border-t border-theme pt-6 mt-12">
  {prevItem && <a href={prevItem.url}>← Previous: {prevItem.title}</a>}
  {nextItem && <a href={nextItem.url} className="text-right">Next: {nextItem.title} →</a>}
</nav>
```

**Locations:**

- SeriesNavigation.tsx (line 58-80)
- summary-detail/layout.tsx (line 74-81)
- topic-detail/layout.tsx (line 84-88)

**Potential Savings:** ~40 lines of code

## Proposed Components

### High Priority (Phase 1)

#### 1. EmptyState Component

```typescript
// shared/ui-library/src/EmptyState.tsx
export interface EmptyStateProps {
  message: string;
  description?: string;
  className?: string;
}

export const EmptyState = ({
  message,
  description,
  className = "",
}: EmptyStateProps): JSX.Element => {
  return (
    <div className={`text-center py-12 ${className}`}>
      <p className="text-theme-muted">{message}</p>
      {description && (
        <p className="text-sm text-theme-muted mt-2">{description}</p>
      )}
    </div>
  );
};
```

**Usage:**

```tsx
{
  items.length === 0 && (
    <EmptyState
      message="No blog posts yet."
      description="Blog posts will appear here as they are published."
    />
  );
}
```

#### 2. ListPageHeader Component

```typescript
// shared/ui-library/src/ListPageHeader.tsx
export interface ListPageHeaderProps {
  title: string;
  count?: number;
  singularLabel?: string;
  pluralLabel?: string;
  description?: string;
  className?: string;
}

export const ListPageHeader = ({
  title,
  count,
  singularLabel,
  pluralLabel,
  description,
  className = "",
}: ListPageHeaderProps): JSX.Element => {
  const countText = count !== undefined && singularLabel
    ? `${count} ${count === 1 ? singularLabel : (pluralLabel || singularLabel + 's')}`
    : null;

  return (
    <div className={`mb-8 ${className}`}>
      <h1 className="text-3xl font-bold mb-2 text-theme">{title}</h1>
      {(countText || description) && (
        <p className="text-theme-muted">
          {countText && description ? `${countText} - ${description}` : countText || description}
        </p>
      )}
    </div>
  );
};
```

**Usage:**

```tsx
<ListPageHeader
  title="Captured Links"
  count={totalCount}
  singularLabel="link"
  pluralLabel="links"
  description="captured from conversations and manual additions"
/>
```

#### 3. formatDate Utility

```typescript
// shared/ui-library/src/utils/formatDate.ts
export type DateFormatStyle = "short" | "long" | "full";

export interface FormatDateOptions {
  style?: DateFormatStyle;
  includeTime?: boolean;
}

export const formatDate = (
  date: string | Date,
  options: FormatDateOptions = {},
): string => {
  const { style = "short", includeTime = false } = options;
  const dateObj = typeof date === "string" ? new Date(date) : date;

  if (includeTime) {
    return dateObj.toLocaleString();
  }

  switch (style) {
    case "long":
      return dateObj.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    case "full":
      return dateObj.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    case "short":
    default:
      return dateObj.toLocaleDateString();
  }
};
```

**Usage:**

```tsx
<time dateTime={updated}>
  Updated {formatDate(updated)}
</time>

// Or with long format
<time dateTime={publishedAt}>
  {formatDate(publishedAt, { style: "long" })}
</time>
```

### Medium Priority (Phase 2)

#### 4. TagsList Component

```typescript
// shared/ui-library/src/TagsList.tsx
export interface TagsListProps {
  tags: string[];
  maxVisible?: number;
  variant?: "default" | "muted";
  size?: "xs" | "sm";
  className?: string;
}

export const TagsList = ({
  tags,
  maxVisible = 5,
  variant = "default",
  size = "xs",
  className = "",
}: TagsListProps): JSX.Element => {
  const visibleTags = tags.slice(0, maxVisible);
  const remainingCount = tags.length - maxVisible;

  const sizeClasses = {
    xs: "text-xs px-2 py-1",
    sm: "text-sm px-3 py-1",
  };

  const variantClasses = {
    default: "bg-theme-muted text-theme",
    muted: "bg-theme text-theme-muted",
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {visibleTags.map((tag) => (
        <span
          key={tag}
          className={`${sizeClasses[size]} ${variantClasses[variant]} rounded-full`}
        >
          {tag}
        </span>
      ))}
      {remainingCount > 0 && (
        <span className={`${sizeClasses[size]} text-theme-muted`}>
          +{remainingCount} more
        </span>
      )}
    </div>
  );
};
```

**Usage:**

```tsx
<TagsList tags={link.keywords} maxVisible={4} />
```

#### 5. BackLink Component

```typescript
// shared/ui-library/src/BackLink.tsx
export interface BackLinkProps {
  href: string;
  children: string;
  className?: string;
}

export const BackLink = ({
  href,
  children,
  className = "",
}: BackLinkProps): JSX.Element => {
  return (
    <nav className={`mt-8 pt-6 border-t border-theme ${className}`}>
      <a href={href} className="text-brand hover:text-brand-dark text-sm">
        ← {children}
      </a>
    </nav>
  );
};
```

**Usage:**

```tsx
<BackLink href="/topics">Back to Topics</BackLink>
```

## Implementation Plan

### Phase 1: High Priority Components

**Estimated Effort:** 2-3 hours
**Impact:** ~80 lines of code removed, improved consistency

1. Create EmptyState component in ui-library
2. Create ListPageHeader component in ui-library
3. Create formatDate utility in ui-library
4. Export all from ui-library/src/index.ts
5. Add unit tests for each component
6. Refactor 1-2 plugins as proof of concept
7. Run typecheck and tests

### Phase 2: Refactor All Plugins

**Estimated Effort:** 3-4 hours
**Impact:** All plugins using consistent components

1. Refactor remaining plugins to use Phase 1 components
2. Run full typecheck and test suite
3. Commit with proper message

### Phase 3: Medium Priority Components

**Estimated Effort:** 2 hours
**Impact:** ~40 additional lines removed

1. Create TagsList component
2. Create BackLink component
3. Export from ui-library
4. Add unit tests
5. Refactor plugins using these patterns
6. Run typecheck and tests

### Phase 4: Verification

**Estimated Effort:** 1 hour

1. Review all plugin templates for consistency
2. Verify no duplicate patterns remain
3. Document new components in ui-library README
4. Update CLAUDE-PLUGINS-INTERFACES.md if needed

## Success Criteria

- [ ] EmptyState component created and exported
- [ ] ListPageHeader component created and exported
- [ ] formatDate utility created and exported
- [ ] All 7 plugins refactored to use new components
- [ ] All typechecks pass
- [ ] All tests pass (1279+ tests)
- [ ] ~120-150 lines of code removed from plugins
- [ ] Consistent date formatting across all templates
- [ ] No duplicate UI patterns in plugin templates

## Files to Modify

### New Files (ui-library)

- `shared/ui-library/src/EmptyState.tsx`
- `shared/ui-library/src/ListPageHeader.tsx`
- `shared/ui-library/src/TagsList.tsx` (Phase 3)
- `shared/ui-library/src/BackLink.tsx` (Phase 3)
- `shared/ui-library/src/utils/formatDate.ts`
- `shared/ui-library/src/index.ts` (exports)

### Plugin Templates to Refactor

- `plugins/blog/src/templates/blog-list.tsx`
- `plugins/blog/src/templates/series-list.tsx`
- `plugins/blog/src/templates/PostMetadata.tsx`
- `plugins/decks/src/templates/deck-list/layout.tsx`
- `plugins/link/src/templates/link-list/layout.tsx`
- `plugins/summary/src/templates/summary-list/layout.tsx`
- `plugins/summary/src/templates/summary-detail/layout.tsx`
- `plugins/topics/src/templates/topic-list/layout.tsx`
- `plugins/topics/src/templates/topic-detail/layout.tsx`

## Open Questions

1. Should ListPageHeader support both h1 and h2 heading levels?
2. Should formatDate support relative time ("2 days ago")?
3. Should TagsList support clickable tags with href?
4. Do we need a PrevNextNav component or keep it plugin-specific?

## Notes

- This follows the same incremental pattern used for Card component extraction
- Focus on high-impact, low-complexity patterns first
- Each phase should be independently testable and committable
- Maintain backward compatibility - no breaking changes to existing APIs
