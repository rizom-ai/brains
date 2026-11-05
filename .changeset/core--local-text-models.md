---
"@rizom/brain": patch
"@brains/ai-service": patch
"@brains/core": patch
"@brains/ai-evaluation": patch
---

`model: local:<name>` runs the brain's agent on a text model from the model runtime, over its OpenAI-compatible `/v1/chat/completions` API; a local text model without a model runtime URL fails config validation. Runtime model tags keep their colon (`qwen3:4b`), and evals run `local:` models without an API key.

Object generation on a local text model sends its JSON schema to the runtime, which constrains the output to it.

`brain start` no longer requires `AI_API_KEY` when `brain.yaml` names `local:` models for both `model` and `embeddingModel`.

`reasoningEffort` in `brain.yaml` reaches local text models as the runtime's `reasoning_effort`; `reasoningEffort: none` turns a model's thinking off.

A local text model thinks while it chooses its tools and answers a tool result without thinking; on a runtime that generates about 20 tokens a second this removes most of a turn's answer time. Its searches return five hits of at most 800 characters each instead of ten of 3,000, so the model reads results in seconds.

`answerModel` in `brain.yaml` names a `local:` model that writes while `model` chooses the tools: it answers tool results and runs text and object generation, such as background derivations, so a reasoning model makes the calls and a fast one writes. The deploy pulls it with the other local models.
