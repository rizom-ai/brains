# Automatic Link Extraction from Conversations - Implementation Plan

## Overview

This document outlines the implementation plan for automatic link extraction from conversation messages in the Link plugin. When users share URLs in conversations, the system will automatically detect and capture them using the existing AI-powered extraction capabilities.

## Goals

1. **Seamless Capture**: Automatically detect and capture links shared in conversations without user intervention
2. **Non-Intrusive**: Process links asynchronously without blocking conversation flow
3. **Intelligent Deduplication**: Use deterministic URL-based entity IDs to prevent duplicates
4. **Configurable**: Allow users to enable/disable and configure auto-capture behavior
5. **Selective Processing**: Only capture links from user messages (not assistant responses or commands)

## Architecture Design

### Event Flow

```
User Message → MessageInterfacePlugin.handleInput()
                        ↓
            [Publish "conversation:message" event for ALL user messages]
                        ↓
            LinkPlugin (subscribed to event)
                        ↓
                  URL Detection
                        ↓
              Enqueue Job: "link:auto-capture"
                        ↓
                Job Handler Processing
                        ↓
              Generate Deterministic ID (domain + hash)
                        ↓
              Check if Entity Exists
                        ↓
              LinkService.captureLink()
                        ↓
                Entity Created
```

### Component Architecture

```
LinkPlugin
├── Configuration (LinkConfig)
│   ├── enableAutoCapture: boolean (default: true)
│   ├── notifyOnCapture: boolean (default: false)
│   └── maxUrlsPerMessage: number (default: 3)
│
├── Message Event Handler
│   ├── Subscribe to "conversation:message"
│   ├── Extract URLs from message
│   └── Enqueue auto-capture jobs
│
├── Auto-Capture Job Handler
│   ├── Generate deterministic entity ID
│   ├── Check for existing entity
│   └── Capture if new
│
├── URL Processing
│   ├── Regex pattern matching
│   ├── URL normalization (remove query params/fragments)
│   └── ID generation (domain-hash pattern)
│
└── Entity ID Generation
    ├── Normalize URL (strip query/fragment)
    ├── Generate SHA256 hash
    └── Create ID: "{domain}-{hash[:6]}"
```

## Implementation Details

### 1. Configuration Schema Updates

```typescript
// plugins/link/src/schemas/link.ts
export const linkConfigSchema = z.object({
  // Existing config...

  // Auto-capture configuration (Phase 1)
  enableAutoCapture: z.boolean().default(true),

  // Optional notification when links are captured
  notifyOnCapture: z.boolean().default(false),

  // Maximum URLs to capture per message
  maxUrlsPerMessage: z.number().min(1).max(10).default(3),

  // Future enhancements (Phase 2):
  // - autoCaptureDomains: z.array(z.string()).default([])
  // - autoCaptureIgnoreDomains: z.array(z.string()).default([])
  // - Domain filtering with wildcard support
});
```

### 2. Message Event Payload

```typescript
// shell/plugins/src/message-interface/types.ts
export interface ConversationMessagePayload {
  conversationId: string;
  messageId: string;
  userId: string;
  channelId: string;
  interfaceType: string;
  content: string;
  role: "user" | "assistant";
  timestamp: string;
  metadata?: Record<string, unknown>;
}
```

### 3. URL Detection and ID Generation

```typescript
// plugins/link/src/lib/url-utils.ts
import { createHash } from "crypto";

export class UrlUtils {
  // Comprehensive URL regex pattern
  private static readonly URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

  /**
   * Extract URLs from text
   */
  static extractUrls(text: string): string[] {
    const matches = text.match(UrlUtils.URL_PATTERN) || [];
    return [...new Set(matches)]; // Remove duplicates within message
  }

  /**
   * Normalize URL for deduplication (remove query params and fragments)
   */
  static normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Keep only protocol, host, and pathname
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * Generate deterministic entity ID from URL
   * Format: "{domain}-{hash[:6]}"
   * Example: "github-com-a3f5d9"
   */
  static generateEntityId(url: string): string {
    const normalized = this.normalizeUrl(url);
    const hash = createHash("sha256").update(normalized).digest("hex");

    try {
      const parsed = new URL(normalized);
      // Clean domain name for ID (remove dots, keep hyphens)
      const domain = parsed.hostname.replace(/\./g, "-");
      return `${domain}-${hash.substring(0, 6)}`;
    } catch {
      // Fallback to just hash if URL parsing fails
      return hash.substring(0, 12);
    }
  }

  /**
   * Validate URL format
   */
  static isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  }
}
```

### 4. Auto-Capture Job Handler

```typescript
// plugins/link/src/handlers/auto-capture-handler.ts
import type { JobHandler } from "@brains/job-queue";
import { UrlUtils } from "../lib/url-utils";
import { LinkService } from "../lib/link-service";

interface AutoCaptureJobData {
  url: string;
  conversationId: string;
  messageId: string;
  userId: string;
}

export class AutoCaptureHandler
  implements JobHandler<string, AutoCaptureJobData, void>
{
  constructor(
    private context: ServicePluginContext,
    private config: LinkConfig,
    private logger: Logger,
  ) {}

  async handle(jobId: string, data: AutoCaptureJobData): Promise<void> {
    const { url, conversationId } = data;

    try {
      // Generate deterministic entity ID
      const entityId = UrlUtils.generateEntityId(url);

      // Check if entity already exists
      const existing = await this.context.entityService.getEntity(
        "link",
        entityId,
      );
      if (existing) {
        this.logger.debug("Link already captured", { url, entityId });
        return;
      }

      // Capture the link with deterministic ID
      const linkService = new LinkService(this.context);
      const result = await linkService.captureLink(url, {
        id: entityId,
        metadata: { conversationId },
      });

      this.logger.info("Auto-captured link", {
        url,
        entityId: result.entityId,
        title: result.title,
        conversationId,
      });

      // Send notification if configured
      if (this.config.notifyOnCapture) {
        // Emit notification event (handled by interface plugins)
        await this.context.sendMessage("link:captured", {
          url,
          title: result.title,
          entityId: result.entityId,
          conversationId,
        });
      }
    } catch (error) {
      this.logger.error("Failed to auto-capture link", { url, error });
      throw error; // Let job queue handle retry
    }
  }
}
```

### 5. Message Event Handler

```typescript
// plugins/link/src/handlers/message-event-handler.ts
import { UrlUtils } from "../lib/url-utils";

export class MessageEventHandler {
  constructor(
    private context: ServicePluginContext,
    private config: LinkConfig,
    private logger: Logger,
  ) {}

  async handleMessage(payload: ConversationMessagePayload): Promise<void> {
    // Skip assistant messages (only process user messages)
    if (payload.role !== "user") {
      return;
    }

    // Extract URLs from message
    const urls = UrlUtils.extractUrls(payload.content);
    if (urls.length === 0) {
      return;
    }

    // Limit URLs to process
    const urlsToProcess = urls.slice(0, this.config.maxUrlsPerMessage);

    // Enqueue auto-capture jobs for each URL
    for (const url of urlsToProcess) {
      if (!UrlUtils.isValidUrl(url)) {
        this.logger.debug("Invalid URL skipped", { url });
        continue;
      }

      // Enqueue job for async processing
      await this.context.enqueueJob(
        "link:auto-capture",
        {
          url,
          conversationId: payload.conversationId,
          messageId: payload.messageId,
          userId: payload.userId,
        },
        {
          priority: "low",
          retries: 2,
        },
      );

      this.logger.debug("Queued URL for auto-capture", { url });
    }
  }
}
```

### 6. Plugin Integration

```typescript
// plugins/link/src/index.ts
import { MessageEventHandler } from "./handlers/message-event-handler";
import { AutoCaptureHandler } from "./handlers/auto-capture-handler";

export class LinkPlugin extends ServicePlugin<LinkConfig> {
  private messageEventHandler?: MessageEventHandler;

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Existing registration...

    // Register auto-capture job handler
    const autoCaptureHandler = new AutoCaptureHandler(
      context,
      this.config,
      this.logger,
    );
    context.registerJobHandler("auto-capture", autoCaptureHandler);

    // Setup auto-capture if enabled
    if (this.config.enableAutoCapture) {
      this.messageEventHandler = new MessageEventHandler(
        context,
        this.config,
        this.logger,
      );

      // Subscribe to conversation messages
      context.subscribe("conversation:message", async (message) => {
        const payload = conversationMessagePayloadSchema.parse(message.payload);
        await this.messageEventHandler?.handleMessage(payload);
        return { success: true };
      });

      this.logger.info("Auto-capture enabled for Link plugin");
    }
  }
}
```

### 7. Message Interface Plugin Updates

```typescript
// shell/plugins/src/message-interface/message-interface-plugin.ts
protected async handleInput(
  input: string,
  context: MessageContext,
  replyToId?: string,
): Promise<void> {
  // Existing code...

  // Store user message and publish event (around line 274-287)
  const isCommand = input.startsWith(this.commandPrefix);
  if (!isCommand) {
    try {
      await this.getContext().addMessage(conversationId, "user", input, {
        messageId: context.messageId,
        userId: context.userId,
        timestamp: context.timestamp.toISOString(),
        directed: this.shouldRespond(input, context),
      });
    } catch (error) {
      this.logger.debug("Could not store user message", { error });
    }
  }

  // ALWAYS publish message event for ALL user messages (even commands)
  // This allows plugins to process all user input
  try {
    await this.getContext().sendMessage('conversation:message', {
      conversationId,
      messageId: context.messageId,
      userId: context.userId,
      channelId: context.channelId,
      interfaceType: context.interfaceType,
      content: input,
      role: 'user',
      timestamp: context.timestamp.toISOString(),
      metadata: {
        directed: this.shouldRespond(input, context),
        isCommand
      }
    });
  } catch (error) {
    this.logger.debug("Could not publish message event", { error });
  }

  // Rest of existing code...
}
```

## Testing Strategy

### Unit Tests

1. **URL Detection Tests**
   - Various URL formats (http, https, with/without www)
   - URLs with query params, fragments, special characters
   - Invalid URLs that should be rejected
   - Edge cases (URLs in markdown, quotes, etc.)

2. **Domain Filtering Tests**
   - Whitelist behavior
   - Blacklist behavior
   - Combined whitelist/blacklist scenarios

3. **Deduplication Tests**
   - Same URL within window (should skip)
   - Same URL after window expires (should capture)
   - Similar URLs (different query params)

### Integration Tests

1. **Message Flow Tests**
   - Message event published correctly
   - Link plugin receives and processes event
   - Async processing doesn't block conversation

2. **End-to-End Tests**
   - Send message with URL
   - Verify entity created
   - Send same URL again (verify dedup)
   - Test with multiple URLs in one message

## Performance Considerations

1. **Async Processing**: All URL captures happen asynchronously to avoid blocking conversations
2. **Queue Management**: Use P-Queue to limit concurrent captures (default: 2)
3. **Cache Cleanup**: Periodic cleanup of deduplication cache to prevent memory leaks
4. **Regex Optimization**: Pre-compiled regex patterns for better performance
5. **Early Filtering**: Quick checks (length, role) before expensive operations

## Configuration Examples

### Default Configuration

```typescript
{
  enableAutoCapture: true,
  autoCaptureDomains: [], // Capture from all domains
  autoCaptureIgnoreDomains: ['localhost', '127.0.0.1'],
  deduplicationWindow: 24, // Hours
  minMessageLength: 10,
  maxUrlsPerMessage: 3
}
```

### Selective Capture (Whitelist)

```typescript
{
  enableAutoCapture: true,
  autoCaptureDomains: ['github.com', 'stackoverflow.com', 'medium.com'],
  autoCaptureIgnoreDomains: [],
  deduplicationWindow: 48,
  minMessageLength: 10,
  maxUrlsPerMessage: 5
}
```

### Minimal Processing

```typescript
{
  enableAutoCapture: true,
  autoCaptureDomains: [],
  autoCaptureIgnoreDomains: ['localhost', 'example.com', 'test.com'],
  deduplicationWindow: 168, // 1 week
  minMessageLength: 50, // Longer messages only
  maxUrlsPerMessage: 1 // One URL per message
}
```

## Future Enhancements

1. **User Preferences**: Per-user auto-capture settings
2. **Smart Detection**: Use AI to determine if a URL is worth capturing based on context
3. **Batch Processing**: Group multiple URLs for efficient AI extraction
4. **Preview Generation**: Generate link previews without full capture
5. **Undo Capability**: Allow users to remove auto-captured links
6. **Statistics**: Track auto-capture metrics and effectiveness
7. **Rich Notifications**: Notify user when links are auto-captured (optional)

## Implementation Timeline

### Phase 0: Foundation (Immediate)

- [ ] Implement URL hash-based entity IDs in LinkService
- [ ] Update captureLink to accept custom entity ID
- [ ] Test deduplication with deterministic IDs

### Phase 1: Core Auto-Capture (Day 1-2)

- [ ] Add enableAutoCapture config to LinkConfig schema
- [ ] Create UrlUtils class with extraction and ID generation
- [ ] Implement AutoCaptureHandler job handler
- [ ] Register job handler in plugin

### Phase 2: Message Event Integration (Day 3-4)

- [ ] Publish conversation:message event from MessageInterfacePlugin
- [ ] Create MessageEventHandler to process messages
- [ ] Subscribe to events in LinkPlugin
- [ ] Test end-to-end flow

### Phase 3: Testing & Polish (Day 5)

- [ ] Unit tests for UrlUtils
- [ ] Integration tests for auto-capture flow
- [ ] Add notifyOnCapture option
- [ ] Documentation updates

### Phase 4: Future Enhancements (Later)

- [ ] Domain filtering with wildcard support
- [ ] Per-conversation capture settings
- [ ] Capture statistics and metrics
- [ ] Rich notifications

## Success Metrics

1. **Capture Rate**: % of shared URLs successfully captured
2. **Processing Time**: Average time to capture a link
3. **Dedup Effectiveness**: % of duplicate URLs filtered
4. **Error Rate**: % of failed capture attempts
5. **User Satisfaction**: Feedback on auto-capture usefulness

## Risk Mitigation

1. **Performance Impact**: Use async processing and queuing
2. **Privacy Concerns**: Clear configuration options, respect user preferences
3. **Rate Limiting**: Implement per-user/per-conversation limits if needed
4. **Error Cascades**: Isolated error handling, circuit breaker pattern
5. **Storage Growth**: Monitor entity creation rate, implement cleanup policies
