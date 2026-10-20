---
"@rizom/brain": patch
---

Search returns only entity types the brain loads. Rows left by a plugin the brain no longer runs used to take result slots and log an error on every search. An unknown entity type now reports itself as unknown rather than as a failed registration.
