---
"@rizom/brain": patch
---

The AI `maxTokens` setting is removed: since the AI SDK upgrade it reached no model, because the SDK reads an output cap as `maxOutputTokens`. Text and object generation also stop passing `webSearch`, which the SDK does not read; the agent's web search, a provider option, is unchanged. No brain behaves differently.
