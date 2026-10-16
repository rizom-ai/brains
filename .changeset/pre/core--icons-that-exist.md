---
"@rizom/brain": patch
---

A built site's pages link only the icons the build has: `/favicon.svg` and `/favicon.png` each appear in the head only when the site package or the app's public folder provides them, with the SVG listed last so browsers that take the last icon use it. Sites without an icon no longer send every visitor's browser to two missing files.
