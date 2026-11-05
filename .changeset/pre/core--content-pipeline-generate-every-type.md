---
"@brains/content-pipeline": patch
"@rizom/brain": patch
---

Scheduled generation reaches every content type again. When a brain schedules both newsletters and social posts, the generation trigger now goes to every type's generator; before, whichever generator subscribed first answered for both and the other type was never generated.
