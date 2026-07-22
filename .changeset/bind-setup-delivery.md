---
"@brains/auth-service": patch
"@brains/admin": patch
---

Bind targeted passkey setup links to an Admin-confirmed email or Discord claim. Successful claim now verifies the delivered channel, activates the invited user, consumes the setup token, and records redacted audit provenance while rejecting mismatched, suspended, undelivered, expired, or replayed claims.
