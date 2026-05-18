---
"@brains/auth-service": minor
"@brains/rover": minor
"@rizom/ops": minor
---

Auth-service can now request passkey setup emails via the notifications router, with persistent dedupe keyed to the active setup token (SHA-256 hashed at rest, 0o600). Rover bundles the setup email delivery plugins by default, and brains-ops renders `setup.delivery: email` configuration for pilot users — including the required `SETUP_EMAIL_API_KEY` and `SETUP_EMAIL_FROM` GitHub Secrets.
