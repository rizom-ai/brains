---
"@rizom/brain": patch
"@brains/ai-service": patch
"@brains/core": patch
"@brains/ai-evaluation": patch
---

`model: local:<name>` runs the brain's agent on a text model from the model runtime, over its OpenAI-compatible `/v1/chat/completions` API; a local text model without a model runtime URL fails config validation. Runtime model tags keep their colon (`qwen3:4b`), and evals run `local:` models without an API key.

Object generation on a local text model sends its JSON schema to the runtime, which constrains the output to it.
