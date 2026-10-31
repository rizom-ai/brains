---
"@rizom/brain": patch
"@brains/ai-service": patch
"@brains/entity-service": patch
"@brains/core": patch
"@brains/app": patch
---

`embeddingModel: local:embeddinggemma-2:270m` indexes with Google's EmbeddingGemma 2 from a model runtime next to the brain: any server with the OpenAI-compatible `/v1/embeddings` API at `modelRuntime.url` in `brain.yaml`, such as Ollama (`ollama pull embeddinggemma-2:270m`). Queries and documents are framed with the model's retrieval prompts, documents carry their title, and long documents are chunked within the runtime's default 2,048-token context. A `local:` model without `modelRuntime.url` fails config validation. Bare `llama`, `mistral`, `phi-` and `qwen` model names now resolve to the `local` provider.
