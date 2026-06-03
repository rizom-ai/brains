# @brains/web-chat

## 0.2.0-alpha.106

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.106
  - @brains/auth-service@0.2.0-alpha.106
  - @brains/plugins@0.2.0-alpha.106

## 0.2.0-alpha.105

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.105
  - @brains/auth-service@0.2.0-alpha.105
  - @brains/plugins@0.2.0-alpha.105

## 0.2.0-alpha.104

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.104
  - @brains/auth-service@0.2.0-alpha.104
  - @brains/plugins@0.2.0-alpha.104

## 0.2.0-alpha.103

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.103
  - @brains/auth-service@0.2.0-alpha.103
  - @brains/plugins@0.2.0-alpha.103

## 0.2.0-alpha.102

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.102
  - @brains/auth-service@0.2.0-alpha.102
  - @brains/plugins@0.2.0-alpha.102

## 0.2.0-alpha.101

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.101
  - @brains/auth-service@0.2.0-alpha.101
  - @brains/plugins@0.2.0-alpha.101

## 0.2.0-alpha.100

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.100
  - @brains/auth-service@0.2.0-alpha.100
  - @brains/plugins@0.2.0-alpha.100

## 0.2.0-alpha.99

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.99
  - @brains/auth-service@0.2.0-alpha.99
  - @brains/plugins@0.2.0-alpha.99

## 0.2.0-alpha.98

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.98
  - @brains/auth-service@0.2.0-alpha.98
  - @brains/plugins@0.2.0-alpha.98

## 0.2.0-alpha.97

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.97
  - @brains/auth-service@0.2.0-alpha.97
  - @brains/plugins@0.2.0-alpha.97

## 0.2.0-alpha.96

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.96
  - @brains/auth-service@0.2.0-alpha.96
  - @brains/plugins@0.2.0-alpha.96

## 0.2.0-alpha.95

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.95
  - @brains/auth-service@0.2.0-alpha.95
  - @brains/plugins@0.2.0-alpha.95

## 0.2.0-alpha.94

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.94
  - @brains/auth-service@0.2.0-alpha.94
  - @brains/plugins@0.2.0-alpha.94

## 0.2.0-alpha.93

### Patch Changes

- [`8437060`](https://github.com/rizom-ai/brains/commit/84370600a5936888c882e8c37b7ecff7b65bed12) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the theme toggle placement in the chat header. On desktop the action
  cluster (theme + New) now hugs the top-right corner instead of floating
  at the vertical midpoint of the tall eyebrow+h1+subtitle brand block;
  `.web-chat-header` switched to `align-items: start` with a padding-top
  nudge on `.web-chat-header-actions` so the actions line up with the h1
  baseline. On mobile the theme toggle resizes to 40×40 to match the
  hamburger trigger and the New button, eliminating the visible
  36/40 size mismatch in the three-button row.
- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.93
  - @brains/auth-service@0.2.0-alpha.93
  - @brains/plugins@0.2.0-alpha.93

## 0.2.0-alpha.92

### Patch Changes

- [`1aee233`](https://github.com/rizom-ai/brains/commit/1aee2335f9171e302826e54d5c2be4f13feb3e79) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the unstyled tool-call result block. The ai-elements registry's
  `tool.tsx` shipped raw — Radix Collapsible + Tailwind classes that don't
  resolve in this build + lucide icons + Badge — so every tool call rendered
  as an unstyled Radix div, completely bypassing the existing
  `web-chat-data-part-*` CSS that targets `<details>`. Ported `tool.tsx` to
  native `<details>`/`<summary>` while keeping the AI Elements export API
  (`Tool`, `ToolHeader`, `ToolContent`, `ToolInput`, `ToolOutput`) intact so
  call sites don't change. Status now renders as a small `· running` /
  `· completed` / `· error` text suffix with a `data-state` attribute for
  color (errors/denials red, approval-requested amber). Deleted the
  orphaned `code-block.tsx` and added small CSS for the new
  `.web-chat-data-part-label` and `.web-chat-data-part-status` selectors.
- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.92
  - @brains/auth-service@0.2.0-alpha.92
  - @brains/plugins@0.2.0-alpha.92

## 0.2.0-alpha.91

### Patch Changes

- [`f471266`](https://github.com/rizom-ai/brains/commit/f4712665e4e2783ab8a12b368ad97038d71cbe99) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Mobile cleanup against the just-shipped drawer:
  - Remove the "New" button from the chat header on every breakpoint —
    the sessions panel "+" button already covers that affordance on
    desktop (always visible) and mobile (via the drawer), so the header
    copy was redundant on both.
  - Drop the legacy `scrollIntoView` effect + sentinel div in `App.tsx`.
    `Conversation` is now aligned with the AI Elements pattern using
    `use-stick-to-bottom`, which manages its own scroll. Two scroll
    controllers were fighting on every streamed token, manifesting as the
    view jumping up during updates.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.91
  - @brains/auth-service@0.2.0-alpha.91
  - @brains/plugins@0.2.0-alpha.91

## 0.2.0-alpha.90

### Patch Changes

- [`7b9cfaa`](https://github.com/rizom-ai/brains/commit/7b9cfaaace29ef0efcc8ee6d83762c8615425a24) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Two mobile fixes against the just-shipped drawer:
  - Move the hamburger menu button out of the right-hand actions group so
    it anchors to the left edge of the header (matching the mockup, where
    the menu button sits opposite the theme / new actions).
  - Fix the drawer panel background under light mode. Previously the panel
    used `rgb(from var(--chat-surface-deep) r g b / 0.95)`, which extracts
    the underlying dark RGB even in light mode, leaving the drawer as a
    dark slab on a light page. Now uses `var(--chat-bg-card)` so the
    drawer flips with theme.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.90
  - @brains/auth-service@0.2.0-alpha.90
  - @brains/plugins@0.2.0-alpha.90

## 0.2.0-alpha.89

### Minor Changes

- [`3d05f53`](https://github.com/rizom-ai/brains/commit/3d05f539af35efb4d0c0e364cf4f09aa5ecb8fd9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Rework the mobile chat layout around a slide-in sessions drawer instead of
  the previous pill-rail stack. At ≤760px the sessions panel becomes a
  left-side drawer (86% width, max 320px) triggered by a hamburger in the
  header, backed by a scrim and a floating close button; tapping a session
  auto-closes the drawer. The same `.web-chat-sessions` component is
  reused verbatim — the drawer is just chrome (positioning + transform +
  backdrop). The mobile header collapses to four icon-only 40px circles
  (sessions, brand, theme, new) and drops the eyebrow + subtitle for
  vertical real estate. Touch targets meet 44px, the prompt textarea uses
  16px to suppress iOS auto-zoom, and prompt + drawer respect
  `env(safe-area-inset-bottom)`.

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.89
  - @brains/auth-service@0.2.0-alpha.89
  - @brains/plugins@0.2.0-alpha.89

## 0.2.0-alpha.88

### Minor Changes

- [`13e800c`](https://github.com/rizom-ai/brains/commit/13e800cd08eaac36951b5300c5fc53d11d3f6313) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add light mode and substantial mobile improvements to the web chat. The chat now consumes tokens via the dashboard's `--chat-* → dashboard → theme → hex` alias-chain pattern (instead of duplicating the palette inline), so embedding it in a site or dashboard automatically reskins the surface. A new sun/moon toggle in the chat header flips `data-theme` on `<html>` and persists the choice to `localStorage`; an inline pre-paint init script reads `prefers-color-scheme` (or the stored value) on first load to avoid FOUC. Mobile (≤760px) collapses the sessions panel into a horizontal scrollable pill rail above the chat and tightens the spine gutter; phone portrait (≤480px) disables the drop-cap and shrinks the empty-state glyph.

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.88
  - @brains/auth-service@0.2.0-alpha.88
  - @brains/plugins@0.2.0-alpha.88

## 0.2.0-alpha.87

### Patch Changes

- [`543190c`](https://github.com/rizom-ai/brains/commit/543190ca21364d582dceb64e5fa2f95b71318e70) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Polish the rizom restyle: anchor the mycelial spine at the chat pane's left edge (rather than inside the centered reading column) and collapse tool-result data parts into a minimal `tool · X ▸` debug toggle. Consecutive tool calls now group under a single `N tool calls ▸` container so a multi-tool assistant message reads as one line instead of N. Confirmations keep their instrument-card treatment since they require user action.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.87
  - @brains/auth-service@0.2.0-alpha.87
  - @brains/plugins@0.2.0-alpha.87

## 0.2.0-alpha.86

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.86
  - @brains/auth-service@0.2.0-alpha.86
  - @brains/plugins@0.2.0-alpha.86
