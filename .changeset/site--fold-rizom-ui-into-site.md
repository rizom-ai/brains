---
"@rizom/site-rizom": patch
---

Fold `@rizom/ui` into the site and retire the package.

`@rizom/ui` existed to share brand primitives across app-owned Rizom site
variants; the one-site consolidation retired that need, and its only consumer —
this package — had forked the components rather than importing them. The fork's
Header and Footer had drifted onto an older inline wordmark, so the site chrome
rendered a different brand mark than the `Wordmark` component exported from the
same barrel.

The components now live in this package as the single copy. Header and Footer
render the canonical `Wordmark` (per-suffix dot color, italic suffix), and
links marked `external` keep the fork's improvement of opening in a new tab
with `rel="noopener noreferrer"`. The npm package `@rizom/ui` receives no
further releases and should be deprecated in favour of `@rizom/site-rizom`.
