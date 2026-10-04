---
"@brains/auth-service": patch
"@rizom/brain": patch
---

Render invitation emails with a text and an HTML part that name the inviter, the brain (from the anchor profile, falling back to the host) and the invited role, print the expiry as a readable UTC date, and explain passkeys and the next steps. Invitations are now sent with secret sensitivity.
