---
"@rizom/brain": patch
"@brains/ai-service": patch
"@brains/entity-service": patch
"@brains/core": patch
"@brains/app": patch
---

`brain.yaml` takes `embeddingModel` to choose the model that builds the semantic index: `openai:text-embedding-3-small` (the default) or `openai:text-embedding-3-large`. The index records the model, dimensions and prompt revision it was built with; at the next start after `embeddingModel` changes, the brain drops the index, re-embeds every entity with the new model, and holds chat until the rebuilt index is ready. Existing indexes are read as `text-embedding-3-small` and are kept. A `provider:` prefix on `model` is now kept, and a text or embedding model of an unknown provider, or an embedding model without a profile, fails config validation instead of falling back to Anthropic. Guest pricing covers `text-embedding-3-large`, and embedding usage is logged under the configured model.

An embedding that failed for good, for example during a provider outage longer than the job retries, is retried at the next start instead of being skipped until its content changes; restarting the brain after an outage completes its index.
