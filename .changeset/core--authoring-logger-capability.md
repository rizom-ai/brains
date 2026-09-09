---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

Project plugin loggers to their declared methods instead of exposing the backing class, file handle, private methods, and singleton controls. Child loggers receive the same frozen projection; detached calls preserve their receiver. Host logging APIs remain unchanged.

Cover service/interface/message-interface setup, service reactions, and service/entity jobs through the public SDK consumer tests, with direct binding and recursive-child regressions.
