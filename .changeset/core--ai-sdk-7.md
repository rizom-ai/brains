---
"@rizom/brain": patch
---

The brain runs on AI SDK 7 with the 4.x OpenAI, Anthropic and Google providers. Structured output uses `generateText` with an `output` setting in place of the deprecated `generateObject`, and system prompts are passed as `instructions`.
