---
"@brains/chat": patch
"@brains/plugins": patch
---

Remove legacy Slack/Discord upload download routes and copy-on-restore compatibility for 0.3. Restore only canonical upload references, retaining platform attribution and existing permission checks. Old platform references are no longer usable through chat; this change does not delete their retained files.
