---
"@brains/auth-service": patch
"@brains/admin": patch
---

Keep the personal Anchor's display name in sync with the CMS Anchor profile. The startup projection writes a resolved profile name onto the Anchor's person and user rows (fallback names never overwrite local names), the account snapshot exposes the owning profile entity, self-service rejects display-name edits for the profile-managed Anchor, and /account shows the name read-only with an Edit-in-CMS link.
