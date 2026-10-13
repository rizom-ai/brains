---
"@rizom/brain": patch
---

The Ask box's code is now loaded at versioned addresses, so a release reaches visitors straight away instead of after their browser or edge cache expires (up to four hours on Cloudflare). The unversioned `/ask/assets/box.js` that sites reference is now a stub that never changes: it reads the current version from `/ask/assets/version`, which is never cached, and loads `/ask/assets/boot.js?v=…`, which loads `guest.js` and `guest.css` at the same version.
