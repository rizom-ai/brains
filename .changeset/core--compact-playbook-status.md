---
"@brains/playbooks": patch
---

`playbook_manage` status, start, and send-event responses carry a definition reference instead of the full playbook: identity, title, status, audience, version, and the initial step. Previously every response returned the definition twice, as the entity's Markdown and as the parsed body, and the model re-read it on every later step. Run state, current-step instructions, evidence, verdicts, valid and blocked events, operator guidance, and action cards are unchanged, and the response is validated against a declared output schema. Direct callers that need the authored definition use `system_get` with `entityType: "playbook"` and the returned `playbook.id`; the engine and stored Markdown are unchanged.
