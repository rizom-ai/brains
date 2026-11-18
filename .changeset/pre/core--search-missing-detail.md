---
"@brains/core": patch
"@rizom/brain": patch
---

When a typed system_search returns that type's entities but not a detail the user asked about, the agent answers from what the results say and names what is missing, instead of searching the same type again with added words. A question about something the saved content does not state no longer costs extra model steps.
