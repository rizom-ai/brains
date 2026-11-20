---
"@brains/core": patch
"@rizom/brain": patch
---

system_status no longer names the dashboard as an example surface, and tells the agent to report only the paths it lists. Asked for a surface the status does not list, the agent says its path was not reported instead of guessing one, such as a dashboard path a brain does not serve.
