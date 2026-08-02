---
"@brains/email": minor
"@brains/contracts": patch
"@brains/auth-service": patch
"@brains/rover": patch
"@rizom/brain": patch
---

Add optional IMAP intake to the Email interface. Configured interfaces now connect to a read-only mailbox, parse MIME messages, publish the exported `EMAIL_INBOUND` contract, and persist an acknowledgement-gated UID cursor for at-least-once delivery. Intake stays live through IDLE or interval polling with capped reconnect backoff and enriches known senders through the auth principal registry. Outbound-only setups remain unchanged, and mailbox content, addresses, and credentials stay out of logs.
