---
"@brains/chat": patch
---

Retain bounded Slack upload recovery metadata after validated initialization. Distinguish allocation, received upload, completed upload and share attempt/response stages without claiming the file was shared. Preserve original failure causes, omit upload URLs and local paths, and never replay or advance sharing after a failed/cancelled upload.
