---
"@rizom/brain": patch
---

A failed notification now says why, without any message content. The email transport reports Resend's error name (`resend_validation_error`) or HTTP status (`resend_http_500`) instead of a generic failure, notifications passes that code on (`NOTIFICATION_FAILURES` and `notificationFailureCode` in `@brains/contracts`), and contact keeps the latest attempt's code with a failed alert and counts failed alerts by code in its operational health (`failures`). A missing recipient or transport reads `recipient-missing` or `transport-missing`.
