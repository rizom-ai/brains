---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
"@brains/agent-discovery": patch
"@brains/link": patch
"@brains/email-workflows": patch
"@brains/profile": patch
"@brains/site-content": patch
---

Give tools, service jobs, subscriptions, and entity reactions the same definition-typed entity reads and ownership-enforced writes. Create and update return `{ id }`; native job access remains separate. Service route slots receive the same read-only entity reader. Migrate built-in consumers and document the common authoring contracts.
