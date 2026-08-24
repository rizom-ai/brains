---
"@brains/directory-sync": patch
"@brains/entity-service": patch
---

Persist entity-to-directory export intents atomically with entity mutations, recover and checkpoint them through Git before acknowledgement, and block destructive cleanup while exports remain unsettled.
