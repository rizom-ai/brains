---
"@brains/newsletter": minor
"@rizom/brain": minor
---

Add Resend Contacts, Segments, and Broadcasts as a selectable newsletter delivery provider, move Buttondown onto the same provider-neutral publishing and subscriber seam, and render one shared HTML email body through both providers.

Newsletter configuration now uses a discriminated `provider` block. Provider-less configurations retain newsletter entities and generation without registering external publishing, subscriber tools, routes, or signup UI. Public signup routes now target a subscribe-only route tool instead of exposing the administrative subscriber action surface.
