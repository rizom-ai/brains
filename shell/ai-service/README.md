# @brains/ai-service

AI text and object generation service for Personal Brain applications.

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
  apiKey: process.env.ANTHROPIC_API_KEY,
  // model defaults to claude-haiku-4-5-20251001
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

Supported Claude models:

- `claude-haiku-4-5-20251001` - Fast, efficient (default)
- `claude-sonnet-4-5-20251001` - Balanced
- `claude-opus-4-5-20251001` - Most capable

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

MIT
