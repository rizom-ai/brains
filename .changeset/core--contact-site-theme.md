---
"@rizom/brain": patch
---

The contact form opens in the site's own theme when a link names none, instead of always opening dark. Contact reads the theme from the site's metadata at startup and follows changes to it; a `?theme=` on the link still wins.
