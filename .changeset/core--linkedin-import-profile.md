---
"@brains/linkedin-import": patch
"@rizom/brain": patch
---

A new opt-in `linkedin-import` plugin fills the owner's profile from LinkedIn. Add it with `add: [linkedin-import]` and the instance's LinkedIn app under `plugins.linkedin-import.oauth` (`clientId`, `clientSecret`, `redirectUri` ending at `/linkedin/oauth/callback`). The Anchor gets a LinkedIn workspace in Studio: Connect LinkedIn runs LinkedIn's consent flow and keeps the token in the Anchor's account settings, then the workspace shows each profile field next to LinkedIn's value. Empty fields and placeholders are filled, values the owner wrote are kept. Importing asks for confirmation and refuses when the profile changed since the preview.
