---
"@brains/ai-service": patch
"@brains/chat": patch
"@brains/web-chat": patch
---

Update the AI SDK and Chat SDK within their current majors: `ai` 6.0.302, `@ai-sdk/openai` 3.0.124 (adds GPT-6 Luna/Sol model IDs and reasoning configuration), `@ai-sdk/anthropic` 3.0.128, `@ai-sdk/google` 3.0.131, `@ai-sdk/react` 3.0.305, and `chat` with its adapters 4.41.1. Chat attachments whose adapter delivers bytes as an `ArrayBuffer` are now read correctly.
