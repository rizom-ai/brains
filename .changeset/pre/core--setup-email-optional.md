---
"@rizom/brain": patch
"@brains/notifications": patch
---

A personal or professional brain starts with only `AI_API_KEY` set. With `SETUP_EMAIL_TO` unset, the notifications plugin boots without a default recipient instead of failing with "Invalid plugin config for notifications", and the brain prints the passkey `/setup` link in the terminal; the setup email is sent once `SETUP_EMAIL_TO`, `SETUP_EMAIL_API_KEY`, and `SETUP_EMAIL_FROM` are set. `brain init --recipe team` now scaffolds the same `auth-service`, `notifications`, and Resend `email` config, so invitations are emailed once those variables are filled in; while they are unset, a team brain starts and Admin → Add a person offers a manual invite link.
