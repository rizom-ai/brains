---
"@rizom/brain": patch
---

A first-party service's tool reads the running call's conversation and its caller's permission level through its internal runtime, as its class's handler read them from the call, so a playbook run stays with the conversation that started it and the Inbox tool still refuses a caller below admin before reading any source.
