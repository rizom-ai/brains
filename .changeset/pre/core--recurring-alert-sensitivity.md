---
"@rizom/brain": patch
---

A recurring check alert marked secret is now delivered as a secret notification. Before, its sensitivity was dropped on the way to notifications, so the email transport treated it as normal and logged its recipient and subject when a delivery failed.
