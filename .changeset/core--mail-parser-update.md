---
"@rizom/brain": patch
---

Update the inbound mail parser and its required dependency closure. Cover sender-address parsing, prototype-named MIME parameters, nested multipart epilogues, padded base64, charset decoding, retained headers and oversized-header refusal through the existing email adapter.

Keep cursor acknowledgement, source ownership, sender resolution, strict address validation and inline-image policy unchanged. Email HTML is still raw, not sanitized; header parsing does not authenticate senders. These checks do not establish total message-memory, parsing-time or shutdown bounds, and do not exercise hosted mail delivery or change release versions.
