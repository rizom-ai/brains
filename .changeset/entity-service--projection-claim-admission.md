---
"@brains/entity-service": patch
---

Decline a projection-wave claim when another coordinator has already claimed the active wave. Preserve pending ingress without throwing on ordinary competing admission or retrying uncertain writes. Insert claimed inputs in bounded batches within the same transaction, so larger waves respect the SQL argument limit and roll back atomically on a later-batch failure.
