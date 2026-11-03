---
"@brains/theme-rizom": patch
"@rizom/brain": patch
---

Decks show on sites that use the Rizom theme. The theme's scroll-in utility hid every element with the class `.reveal` until a script added `.visible`, and no site loads that script any more; reveal.js names its presentation container `.reveal`, so every deck rendered as an empty page. The unused scroll-in rules are removed.
