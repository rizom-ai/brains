---
"@rizom/brain": patch
---

Cross-plugin calls that nobody answers are told apart from calls that fail. On a brain without auth, resolving who is behind an actor now finds no one instead of failing; generation refuses the request as unauthorized rather than retrying an outage that never clears. A contact request on a brain without a notifier is now recorded as "no notifier" instead of an unconfirmed delivery. A Web Chat action whose runtime handler fails now answers 500 "Runtime action failed" instead of looking like a missing handler (404). Studio's ask-agent answers 400 with the reason when an agent's reply cannot be read, where it answered 500.
