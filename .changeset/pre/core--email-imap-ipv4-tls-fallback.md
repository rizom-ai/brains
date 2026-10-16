---
"@brains/email": patch
---

Retry IMAP TLS hostname connections over IPv4 when Bun cannot read certificate names from the IPv6 peer, preserving normal certificate validation and restoring source-backed Inbox reads.
