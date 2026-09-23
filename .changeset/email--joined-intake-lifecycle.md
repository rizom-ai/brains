---
"@brains/email": patch
---

Own email connections through initial intake, reconnect and shutdown. Join pending work and disconnects before restart, preserve retirement failures, and propagate cancellation through connection and intake stages without losing acknowledged mailbox cursors. Withhold source rereads until cleanup succeeds.
