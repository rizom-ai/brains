---
"@rizom/brain": patch
---

A recurring check alert is no longer emailed twice when its run dies after the send and before the alert is marked delivered. Each delivery attempt of an alert now carries the same idempotency key, derived from the alert and the time it was first observed, and the email provider answers a repeated key without sending again. The provider keeps a key for 24 hours, so a rerun that comes more than a day after such a crash can still send the alert a second time.
