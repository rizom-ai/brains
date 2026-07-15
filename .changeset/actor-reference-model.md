---
"@brains/ai-evaluation": patch
"@brains/ai-service": patch
"@brains/auth-service": patch
"@brains/chat": patch
"@brains/contracts": patch
"@brains/conversation-memory": patch
"@brains/conversation-service": patch
"@brains/core": patch
"@brains/discord": patch
"@brains/identity-service": patch
"@brains/mcp": patch
"@brains/plugins": patch
"@brains/web-chat": patch
---

Replace ambiguous flattened actor identifiers with a discriminated `ActorRef` model for authenticated users, opaque external identities, agents, and services. New messages and durable memory use the new model, while legacy actor metadata is normalized at read boundaries.
