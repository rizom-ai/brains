---
"@brains/studio": minor
"@brains/plugins": minor
"@brains/site-builder-plugin": minor
"@brains/directory-sync": minor
"@rizom/brain": minor
---

⌘K runs the actions a page offers, from any page.

- A workspace action can be offered in Studio's palette with `palette: true`, when it needs no input and asks for no confirmation. Studio lists it for whoever the workspace admits at the action's permission.
- Site's Build preview (trusted) and Content sync's Sync now (admin) are offered. Choosing one runs it and opens its page; if it fails, the palette stays open and says why.
