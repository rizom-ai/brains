---
"@rizom/site-rizom-ai": patch
---

The hero chat uses Web Chat's shared Ask box boot (`/ask/assets/box.js`) instead of the site's own `/brain-chat.js`, which is removed. The box needs a Brain release that serves the shared boot; on an older Brain the hero composer stays disabled and nothing is sent.
