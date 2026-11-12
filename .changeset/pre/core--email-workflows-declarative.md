---
"@rizom/brain": patch
---

Email-workflows is a declarative service: the same triage, Inbox source, triage list tool and inbound contract as before, composed under the plugin id `email-workflows` with its `mail-item` type. As a deliberate exception to the declared-type pattern, a mail item's metadata indexes only its routing fields and thread position, never its source locator, sender label, organization or requested actions, and a read hands back the whole document as before. The reply-draft type is declared but, as on main, installed in no brain.
