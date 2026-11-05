---
"@rizom/brain": patch
---

The channel pickup's note is posted as soon as the pickup finishes. A job enqueued while handling an event joined that event's operation, so its completion was withheld as a step of a batch, and the note waited for the next restart. Jobs can now be enqueued `detached`, as an operation of their own; the pickup is.
