---
"@rizom/brain": patch
---

The unified inbox is a declarative service. It registers the same `inbox_list` tool, Inbox workspace, Dashboard widget, daily digest and Inbox way in, under its class plugin id, `unified-inbox`. A failed `inbox_list` call keeps its message and now also carries its code (`permission_denied`, `invalid_input` or `handler_failed`). The workspace and widget now register once every plugin has registered rather than once the brain is ready; the way in still appears once the brain is ready, pointing at the workspace's URL.
