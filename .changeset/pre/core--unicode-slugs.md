---
"@rizom/brain": patch
---

Slugs keep the letters and digits of every script, so a Chinese, Japanese, Korean or Cyrillic title gets an id and URL of its own instead of an empty slug. Topic and skill ids derived from such titles are now the same on every run; before, each extraction gave them a new random id, replaced the entity and triggered itself again, an endless loop of embedding and extraction jobs. Text with no letters or digits at all is named by a stable hash of the text.
