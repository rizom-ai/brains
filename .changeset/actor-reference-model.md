---
"@brains/ai-evaluation": patch
"@brains/ai-service": patch
"@brains/app": patch
"@brains/auth-service": patch
"@brains/cms": patch
"@brains/content-pipeline": patch
"@brains/chat": patch
"@brains/contracts": patch
"@brains/conversation-memory": patch
"@brains/conversation-service": patch
"@brains/core": patch
"@brains/entity-service": minor
"@brains/discord": patch
"@brains/identity-service": patch
"@brains/job-queue": patch
"@brains/link": patch
"@brains/mcp": patch
"@brains/mcp-service": minor
"@brains/newsletter": patch
"@brains/plugins": minor
"@brains/site-content": patch
"@brains/social-media": patch
"@brains/webserver": patch
"@brains/web-chat": patch
---

Replace ambiguous flattened actor identifiers with a discriminated `ActorRef` model for authenticated users, opaque external identities, agents, and services. Require `ActorRef` through tool execution, MCP routing, AI call options, create interceptors, tool events, and job provenance; remove flattened `userId` and `canonicalId` tool-context fields rather than deprecating them. Jobs retain every requester as `requestedByActor` and project `requestedByUserId` only through the centralized authenticated-user policy. New messages and durable memory use the new model, while legacy persisted actor metadata is normalized at read boundaries.
