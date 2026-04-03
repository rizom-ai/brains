# @brains/ai-service

AI text and object generation service for Brain applications.

## Overview

This service provides AI-powered text generation and structured object creation using Anthropic's Claude API. It supports both free-form text generation and schema-validated object generation.

## Features

- Text generation with Claude
- Structured object generation with Zod schemas
- Template-based prompt construction
- Configurable model selection
- Token usage tracking
- Error handling and retries

## Installation

```bash
bun add @brains/ai-service
```

## Usage

```typescript
import { AIService } from "@brains/ai-service";

const aiService = AIService.getInstance({
  apiKey: process.env.AI_API_KEY,
  // model defaults to gpt-4.1, provider auto-detected from model name
});

// Generate text
const text = await aiService.generateText({
  prompt: "Write a summary of quantum computing",
  maxTokens: 500,
  temperature: 0.7,
});

// Generate structured object
import { z } from "zod";

const summarySchema = z.object({
  title: z.string(),
  summary: z.string(),
  keywords: z.array(z.string()),
  sentiment: z.enum(["positive", "neutral", "negative"]),
});

const result = await aiService.generateObject({
  prompt: "Analyze this article: ...",
  schema: summarySchema,
  maxTokens: 1000,
});
// result is typed according to schema
```

## Configuration

```typescript
interface AIServiceConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
  maxRetries?: number;
  timeout?: number;
}
```

## Models

Provider is auto-detected from model name. Default: `gpt-4.1`.

**OpenAI:** `gpt-4.1` (default), `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-4o`, `o3-mini`
**Anthropic:** `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`, `claude-opus-4-6`
**Google:** `gemini-2.0-flash`, `gemini-2.5-pro`
**Local (Ollama):** `llama-3.1-8b`, `mistral-7b`, `gemma4`

Explicit prefix supported: `openai:gpt-4o-mini`, `anthropic:claude-haiku-4-5`

## Templates

Use templates for consistent prompts:

```typescript
const template = `
Analyze the following text:
<text>
{content}
</text>

Provide:
1. Summary
2. Key points
3. Sentiment
`;

const result = await aiService.generateText({
  prompt: template.replace("{content}", articleText),
});
```

## Error Handling

```typescript
try {
  const result = await aiService.generateText({
    prompt: "...",
  });
} catch (error) {
  if (error.code === "rate_limit") {
    // Handle rate limiting
  } else if (error.code === "invalid_api_key") {
    // Handle auth error
  }
}
```

## Testing

```typescript
import { createMockAIService } from "@brains/ai-service/test";

const mockAI = createMockAIService();
mockAI.generateText.mockResolvedValue("Mocked response");

// Use in tests
const service = AIService.createFresh({
  apiKey: "test-key",
});
```

## Exports

- `AIService` - Main service class
- `aiConfigSchema` - Configuration schema
- Types: `AIServiceConfig`, `GenerateTextOptions`, `GenerateObjectOptions`
- Test utilities: `createMockAIService`

## License

Apache-2.0
