---
"@brains/email": patch
---

Keep a persistent IMAP error listener between interval polls so socket timeouts trigger the existing reconnect path instead of crashing the runtime.
