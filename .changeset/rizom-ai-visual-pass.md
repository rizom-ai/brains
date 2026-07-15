---
"@rizom/site-rizom-ai": patch
---

Visual pass on the consolidated-site chrome and sections across breakpoints. The faces strip wraps with tighter mobile metrics instead of overflowing narrow phones, the per-face nav links appear from `sm` (the footer covers them below), and the wordmark clamps so `rizom.foundation` fits a 360px row. A `#themeToggle` button joins the strip — boot.js and the site-engine `window.toggleTheme` were already wired, so this makes the theme's first-class light mode actually reachable. The footer takes its four-column form from `lg`. IndexRow no longer drops its display title into the 44px folio column below `md` (title and meta take full-width rows). SectCap's accent tick wraps as one unit with its lead. The /brain product screens collapse on phones: the studio's library pane becomes a horizontal file strip and the dashboard strip/tabs wrap or scroll. Small mono links across the chrome and colophon carry enlarged tap areas.
