# @brains/content-pipeline

Content pipeline plugin for managing entity publishing queues, scheduling, and generation.

## Features

- **Queue Management**: Add, remove, and reorder entities in publish queues
- **Cron Scheduling**: Schedule publishing at specific times per entity type
- **Generation Scheduling**: Trigger automatic draft creation on schedule
- **Retry Logic**: Automatic retry with exponential backoff for failed publishes
- **Provider Registry**: Register custom publish providers per entity type

## Usage

```typescript
import { contentPipelinePlugin } from "@brains/content-pipeline";

const config = defineConfig({
  plugins: [
    contentPipelinePlugin({
      maxRetries: 3,
      retryBaseDelayMs: 1000,
      entitySchedules: {
        "social-post": "0 9 * * 1-5", // Weekdays at 9am
      },
      generationSchedules: {
        newsletter: "0 8 * * 5", // Fridays at 8am
      },
    }),
  ],
});
```

## Tools

- `content-pipeline:queue` - Add entity to publish queue
- `content-pipeline:publish` - Publish entity directly

## Messages

- `publish:register` - Register a publish provider
- `publish:execute` - Trigger entity publishing
- `generate:execute` - Trigger draft generation
