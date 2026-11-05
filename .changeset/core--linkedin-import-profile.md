---
"@brains/linkedin-import": patch
"@rizom/brain": patch
---

A new opt-in `linkedin-import` plugin fills the owner's profile from LinkedIn. Add it with `add: [linkedin-import]` and a member token for LinkedIn's DMA portability API (`plugins.linkedin-import.accessToken`). The Anchor gets a LinkedIn workspace in Studio that shows each profile field next to LinkedIn's value: empty fields and placeholders are filled, values the owner wrote are kept. Importing asks for confirmation and refuses when the profile changed since the preview.
