# @brains/content-generator

Template-based content generation service for Personal Brain applications.

## Overview

This service provides content generation and derivation capabilities using AI and templates. It supports generating new content from prompts and deriving content from existing entities.

## Features

- Template-based content generation
- Content derivation from existing entities
- Multi-format output support
- Background job processing
- Progress tracking
- Integration with AI service

## Installation

```bash
bun add @brains/content-generator
```

## Usage

```typescript
import { ContentGenerator } from "@brains/content-generator";

const generator = ContentGenerator.getInstance({
  aiService,
  entityService,
  jobQueue,
  messageBus,
});

// Generate new content
const result = await generator.generateContent({
  prompt: "Write a blog post about TypeScript",
  template: "blog-post",
  options: {
    tone: "professional",
    length: "medium",
  },
});

// Derive content from existing entity
const derived = await generator.deriveContent({
  sourceEntityId: "note_123",
  targetType: "article",
  template: "note-to-article",
});
```

## Templates

Templates define the structure and generation rules:

```typescript
interface ContentTemplate {
  id: string;
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
  promptTemplate: string;
  formatter?: (data: unknown) => string;
}

// Register a template
generator.registerTemplate({
  id: "summary",
  name: "Summary Generator",
  description: "Generate concise summaries",
  inputSchema: z.object({
    content: z.string(),
    maxLength: z.number().optional(),
  }),
  outputSchema: z.object({
    summary: z.string(),
    keyPoints: z.array(z.string()),
  }),
  promptTemplate: `
    Summarize the following content:
    {content}
    
    Max length: {maxLength} words
  `,
});
```

## Content Operations

### Generation

Create new content from prompts:

```typescript
const generated = await generator.generateContent({
  prompt: "Create a tutorial about React hooks",
  template: "tutorial",
  metadata: {
    level: "beginner",
    includeExamples: true,
  },
});
```

### Derivation

Transform existing content:

```typescript
const article = await generator.deriveContent({
  sourceEntityId: "note_456",
  targetType: "article",
  transformations: ["expand", "add-examples", "format-markdown"],
});
```

### Batch Operations

Generate multiple pieces of content:

```typescript
const batchId = await generator.batchGenerate([
  { prompt: "Topic 1", template: "blog" },
  { prompt: "Topic 2", template: "blog" },
  { prompt: "Topic 3", template: "blog" },
]);

// Monitor progress
messageBus.on("job:progress", (event) => {
  if (event.batchId === batchId) {
    console.log(`Progress: ${event.progress}%`);
  }
});
```

## Job Handlers

The service includes job handlers for async processing:

- `ContentGenerationJobHandler` - Handles generation jobs
- `ContentDerivationJobHandler` - Handles derivation jobs

## Integration

Works with other Brain services:

```typescript
// With EntityService
const entity = await entityService.get(sourceId);
const derived = await generator.deriveContent({
  source: entity,
  targetType: "summary",
});

// With JobQueue
const jobId = await jobQueue.queueJob({
  type: "content:generate",
  payload: { prompt, template },
});

// With AIService
// Automatically uses AI service for generation
```

## Configuration

```typescript
interface ContentGeneratorConfig {
  aiService: AIService;
  entityService: EntityService;
  jobQueue: JobQueueService;
  messageBus: MessageBus;
  defaultTemplates?: ContentTemplate[];
}
```

## Testing

```typescript
import { ContentGenerator } from "@brains/content-generator";

const generator = ContentGenerator.createFresh({
  aiService: mockAI,
  entityService: mockEntities,
  jobQueue: mockQueue,
  messageBus: mockBus,
});

// Test generation
const result = await generator.generateContent({
  prompt: "Test prompt",
  template: "test",
});
```

## Exports

- `ContentGenerator` - Main service class
- `ContentGenerationJobHandler` - Generation job handler
- `ContentDerivationJobHandler` - Derivation job handler
- Types: `ContentTemplate`, `GenerationOptions`, `DerivationOptions`

## License

MIT
