---
"@rizom/brain": patch
---

Cross-plugin calls that nobody answers are told apart from calls that fail. On a brain without auth, resolving who is behind an actor now finds no one instead of failing; generation refuses the request as unauthorized rather than retrying an outage that never clears. A contact request on a brain without a notifier is now recorded as "no notifier" instead of an unconfirmed delivery.
