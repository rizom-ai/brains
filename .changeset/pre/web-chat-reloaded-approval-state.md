---
"@brains/web-chat": patch
"@brains/ai-service": patch
---

Keep resolved approval actions terminal when reopening web-chat history. Reloaded sessions now reconcile earlier approval requests with later result cards, while expired, declined, and failed approval outcomes are durably recorded so completed buttons do not reappear.
