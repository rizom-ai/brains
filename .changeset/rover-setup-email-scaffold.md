---
"@rizom/brain": patch
---

Fix Rover standalone scaffolding for first-passkey setup email delivery.

`brain init` now wires Rover's `auth-service.setupEmail` and `email-resend` config to `SETUP_EMAIL_TO`, `SETUP_EMAIL_API_KEY`, and `SETUP_EMAIL_FROM`, includes those variables in generated env examples and env schemas, and passes all three through the shared Kamal deploy template. Varlock validation now fails before deploy when setup email delivery is configured but the required Resend/setup email variables are missing.
