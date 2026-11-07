---
"@rizom/brain": patch
---

A malformed broadcast event is now refused and logged instead of being read with its missing fields as undefined. Entity changes, embeddings, publish results, job progress, conversation messages, tool activity, site metadata updates and the startup import's completion each have one declared payload, which every plugin following them checks. A publish event that does not name its entity no longer marks a queued post published or failed, the newsletter no longer looks up an undefined post, and an invalid site metadata update no longer clears the contact form's theme. Studio's activity feed now shows a job whose message runs past 500 characters, with the message cut short, where it used to leave the job out.
