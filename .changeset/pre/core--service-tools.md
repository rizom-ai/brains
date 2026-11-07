---
"@brains/content-service": patch
"@brains/contracts": patch
"@brains/mcp-service": patch
"@brains/utils": patch
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

A literal returned inline from a `defineTool` `execute` keeps its literal type, with or without parameters, so an enum value in the output no longer needs a cast. A tool's `confirmation` may be a function of its parsed input. A service tool's failure reaches its caller in its public form, `{ success: false, code, error }`: an `SdkError`'s code and `publicMessage`, or else the code's standard message, never the message a failure was thrown with, which stays in the brain's debug log. Refused input is `invalid_input`, and its message names each offending path and why, as main's class tools always have, cut between whole issues to the 1024-character public bound; another error from `execute` is `handler_failed`, an answer outside the output schema is `invalid_response`, and a call whose caller has gone is `cancelled`. Content-generation limits keep their message as `invalid_input`.
