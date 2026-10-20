---
"@brains/chat": patch
---

Render agent replies in Slack. The Slack adapter sends a plain string as Slack's `text`, which shows `**bold**` and `## headings` verbatim; agent text, streamed edits and turn errors now post as `{ markdown }`, which Slack renders. Discord is unchanged.
