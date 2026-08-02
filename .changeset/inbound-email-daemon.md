---
"@brains/email": minor
"@brains/contracts": patch
"@brains/auth-service": patch
"@rizom/brain": patch
---

Add optional IMAP intake to the Email interface. Configured interfaces now connect to a read-only mailbox, parse MIME messages, publish the exported `EMAIL_INBOUND` contract, and persist an acknowledgement-gated, UIDVALIDITY-scoped cursor for at-least-once delivery. Poison messages no longer block later mail. Intake stays live through per-connection IDLE fallback and capped reconnect backoff, including failed initial connections, and enriches known senders through the auth principal registry. Outbound-only setups remain unchanged, and mailbox content, addresses, and credentials stay out of logs.
