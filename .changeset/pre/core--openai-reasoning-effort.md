---
"@brains/ai-service": patch
---

The configured OpenAI `reasoningEffort` now reaches the provider for every model the runtime treats as a reasoning model, including `gpt-6*` and provider-prefixed IDs. Previously the AI SDK silently dropped the effort, sent instructions in the `system` role, and accepted a temperature for model names missing from its own allowlist. Text, structured, and agent generation share one rule; non-reasoning models keep their temperature and `system` role.
