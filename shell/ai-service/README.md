# @brains/ai-service

AI provider integration and agent conversation orchestration for Brain applications.

## Overview

This package owns:

- AI text and object generation via the Vercel AI SDK
- image generation provider selection
- online embedding generation
- Brain agent construction and conversation orchestration
- tool invocation event emission

## Text/Object generation

```typescript
import { AIService } from "@brains/ai-service";

const aiService = AIService.getInstance(
  {
    apiKey: process.env.AI_API_KEY,
    model: "claude-haiku-4-5",
  },
  logger,
);

const text = await aiService.generateText(
  "You are a helpful assistant.",
  "Write a short summary of quantum computing.",
);
```

Structured output uses a Zod schema:

```typescript
import { z } from "@brains/utils";

const schema = z.object({
  title: z.string(),
  summary: z.string(),
});

const result = await aiService.generateObject(
  "Return structured JSON.",
  "Summarize this article: ...",
  schema,
);
```

## Configuration

```typescript
interface AIModelConfig {
  model?: string;
  imageModel?: string;
  apiKey?: string;
  imageApiKey?: string;
  temperature?: number;
  maxTokens?: number;
  webSearch?: boolean;
}
```

Defaults:

- `temperature`: `0.7`
- `maxTokens`: `1000`
- `webSearch`: `true`
- no default text model is invented; text generation requires `model`
- default image model is `gpt-image-1.5`

## Provider selection

Text provider is resolved from the model name or an explicit prefix.

Examples:

- `claude-haiku-4-5` → Anthropic
- `gpt-4o-mini` → OpenAI
- `gemini-2.0-flash` → Google
- `openai:gpt-4o-mini` → OpenAI with SDK model ID `gpt-4o-mini`

Image provider selection works similarly via `imageModel`:

- `gpt-image-1.5` → OpenAI
- `gemini-3-pro-image-preview` → Google
- `google:gemini-3-pro-image-preview` → Google with prefix stripped

## Agent service

```typescript
import { AgentService, createBrainAgentFactory } from "@brains/ai-service";

const agentFactory = createBrainAgentFactory({
  model: aiService.getModel(),
  modelId: aiService.getConfig().model,
  messageBus,
});

const agentService = AgentService.getInstance(
  mcpService,
  conversationService,
  identityService,
  profileService,
  logger,
  { agentFactory },
);
```

## Test utilities

```typescript
import { createMockAIService } from "@brains/ai-service/test";

const mockAI = createMockAIService();
```

## Exports

- `AIService`
- `AgentService`
- `createBrainAgentFactory`
- `OnlineEmbeddingProvider`
- provider helpers: `resolveTextProvider`, `selectTextProvider`, `selectImageProvider`
- AI SDK re-exports: `ToolLoopAgent`, `stepCountIs`, `dynamicTool`
- service and agent types
