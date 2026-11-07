---
"@brains/contracts": patch
"@brains/messaging-service": patch
"@brains/core": patch
"@brains/plugins": patch
"@brains/a2a": patch
"@brains/web-chat": patch
"@brains/agent-discovery": patch
"@brains/studio": patch
---

A bus contract's failure reaches the asker in its public form. `BusResult`'s `failed` carries `error: SdkErrorData` (`{ code, message }`) and `BusCollection.failures` is `SdkErrorData[]`: an owner that throws an `SdkError` keeps its code and public message, any other error is `handler_failed`, an answer outside the contract is `invalid_response` and an invalid request `invalid_input`. The message a failure was thrown with stays in the owner's log. Askers that pass a failure on raise it again with `sdkErrorFrom`, keeping its code. The A2A ask and call owners report a directory refusal as `permission_denied`, a timeout as `deadline_exceeded` and a peer's refusal in its own words, cut to the public bound with `clipPublicMessage`; Studio's workspace host refuses a reserved id as `invalid_input` and a taken one as `conflict`. Studio's ask-agent route answers a failure with `{ error, code }` and the code's HTTP status, and `network_ask` gives each unanswered peer's public message as its reason.
