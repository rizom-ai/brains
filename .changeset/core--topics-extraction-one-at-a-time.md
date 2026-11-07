---
"@rizom/brain": patch
---

Run topic extraction jobs one at a time. A note added or edited while topic extraction was running could wait about 30 seconds for its topic vote instead of being read as soon as the running extraction finished.
