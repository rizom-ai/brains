# Professional Brain UX Improvements Plan

## Confirmed Items

### Frontend

1. **CTA Email** - Fix placeholder in seed-content
2. ~~Home Nav~~ - Skip (logo already links to home)
3. **Mobile Menu** - Close on link click
4. **Mobile Menu** - Escape key to close
5. **Mobile Menu** - Focus trap (Tab stays within)
6. **Mobile Menu** - Focus management (first link on open, button on close)
7. **Focus Rings** - Add consistent focus utilities
8. **Prose Classes** - Extract to reusable theme class

### Agent Interaction

9. **Tool Status** - Show tool names in CLI spinner
10. **Async Jobs** - CLI job completion feedback
11. **Confirmation** - Accept more inputs, add help text

---

## Implementation

### 1. Fix CTA Email

**File**: `apps/professional-brain/seed-content/site-info/site-info.md`

- Change `mailto:you@example.com` to `mailto:yeehaa@rizom.ai`

### 2. Mobile Menu Accessibility

**File**: `plugins/site-builder/src/lib/html-generator.ts`

Update `toggleMobileMenu` function:

- Add `closeMobileMenu()` global function
- Change `max-h-96` to `max-h-screen`
- Add escape key listener when open
- Add focus trap for Tab/Shift+Tab
- Focus first link on open
- Return focus to button on close

**File**: `plugins/professional-site/src/components/CompactHeader.tsx`

- Add `onclick="closeMobileMenu()"` to mobile menu links

### 3. Focus Ring Utilities

**File**: `shared/theme-default/src/theme.css`

```css
@layer utilities {
  .focus-ring {
    @apply focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2;
  }
}
```

**Update components**:

- `shared/ui-library/src/Button.tsx`
- `shared/ui-library/src/NavLinks.tsx`
- `plugins/professional-site/src/components/CompactHeader.tsx`

### 4. Extract Prose Classes

**File**: `shared/theme-default/src/theme.css`

- Add `.prose-article` component class with all modifiers

**File**: `shared/ui-library/src/ProseContent.tsx`

- Replace inline classes with `prose-article`

### 5. Tool Invocation Status

**File**: `shell/agent-service/src/types.ts`

- Add `ToolInvocationCallback` type

**File**: `shell/agent-service/src/brain-agent.ts`

- Wrap tool execution to emit start/end events

**File**: `interfaces/cli/src/cli-interface.ts`

- Subscribe to tool events, update spinner text

Tool labels:

- `search` → "Searching..."
- `build_site` → "Building site..."
- `capture_url` → "Capturing..."
- `sync` → "Syncing..."

### 6. CLI Async Job Feedback

**File**: `interfaces/cli/src/cli-interface.ts`

- Track `jobId` from tool results
- Show completion/failure messages

**File**: `interfaces/cli/src/components/EnhancedApp.tsx`

- Handle job completion display

### 7. Improved Confirmation Flow

**File**: `shell/plugins/src/message-interface/confirmation-handler.ts` (new)

- Shared utility for parsing confirmation responses
- Accept: "yes", "y", "ok", "sure", "proceed"
- Reject: "no", "n", "cancel", "abort"

**Files**: CLI and Matrix interfaces

- Use shared confirmation handler
- Add help text: "(Type 'yes' to confirm, 'no' to cancel)"

---

## Files to Modify

| File                                                          | Change                          |
| ------------------------------------------------------------- | ------------------------------- |
| `apps/professional-brain/seed-content/site-info/site-info.md` | Fix email                       |
| `plugins/site-builder/src/lib/html-generator.ts`              | Mobile menu a11y                |
| `plugins/professional-site/src/components/CompactHeader.tsx`  | Menu link onclick               |
| `shared/theme-default/src/theme.css`                          | Focus ring + prose              |
| `shared/ui-library/src/ProseContent.tsx`                      | Use prose-article               |
| `shared/ui-library/src/Button.tsx`                            | Add focus-ring                  |
| `shared/ui-library/src/NavLinks.tsx`                          | Add focus-ring                  |
| `shell/agent-service/src/types.ts`                            | ToolInvocationCallback          |
| `shell/agent-service/src/brain-agent.ts`                      | Wrap tool execution             |
| `interfaces/cli/src/cli-interface.ts`                         | Tool status, jobs, confirmation |
| `interfaces/cli/src/components/EnhancedApp.tsx`               | Job display                     |
| `shell/plugins/src/message-interface/confirmation-handler.ts` | New file                        |
| `interfaces/matrix/src/lib/matrix-interface.ts`               | Use shared confirmation         |

---

## Testing

After each change:

- `bun run typecheck`
- `bun test` for affected packages
- `bun run lint:fix`

Manual testing:

- Mobile menu: link click closes, Escape closes, Tab cycles, focus moves correctly
- CLI: spinner shows tool names, job completion appears
- Confirmation: accepts various inputs
