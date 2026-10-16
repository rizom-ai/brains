---
"@rizom/site-rizom-ai": patch
---

The public Ask section loads Web Chat's guest page bundle (`/ask/assets/ask.js` and `ask.css`) instead of the signed-in chat app. It needs a Brain release that serves the guest page bundle; on an older Brain the section stays on its "Connecting" line.
