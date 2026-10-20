---
"@rizom/brain": patch
---

A contact request whose email alert failed now keeps contact's operational health degraded only until the owner marks the request Done in the Studio Inbox, instead of for the request's whole retention with no way to clear it. Health details gain `failedUnhandled` beside the existing `failed` count.
