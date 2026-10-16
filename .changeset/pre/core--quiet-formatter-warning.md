---
"@rizom/brain": patch
---

Stop warning on every site build that static pages have "no formatter but saved content was requested". Site builds offer saved content to every section; templates without a formatter now skip it quietly.
