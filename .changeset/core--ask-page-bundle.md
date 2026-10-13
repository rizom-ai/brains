---
"@rizom/brain": patch
---

The public Ask page loads its own guest bundle (`/ask/assets/ask.js` and `ask.css`, about 1.9 MB) instead of the signed-in chat app (`app.js`, about 15 MB), which it mounted only to render the guest conversation. The app bundle stays served for sites that still load it.
