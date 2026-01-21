# Newsletter Plugin (Buttondown Integration)

## Overview

Add a newsletter plugin that integrates with Buttondown for subscriber management and newsletter sending, with a signup form for the site.

## Provider Choice: Buttondown

- Simple, developer-friendly API
- Newsletter-focused (aligns with blog publishing)
- Supports markdown emails
- Good pricing, no bloat

## Features

1. **Subscribe tool** - Add subscribers via API
2. **Send newsletter** - Create and send newsletters (from blog post or custom)
3. **Signup form** - UI component for site-builder
4. **Auto-send** (optional) - Trigger newsletter on blog publish

## File Structure

```
plugins/newsletter/
├── src/
│   ├── index.ts
│   ├── newsletter-plugin.ts
│   ├── config.ts
│   ├── schemas/
│   │   ├── subscriber.ts
│   │   └── newsletter.ts
│   ├── adapters/
│   │   ├── subscriber-adapter.ts
│   │   └── newsletter-adapter.ts
│   ├── lib/
│   │   └── buttondown-client.ts
│   ├── tools/
│   │   ├── index.ts
│   │   ├── subscribe.ts
│   │   └── newsletter.ts
│   └── handlers/
│       └── send-handler.ts
├── test/
└── package.json
```

## Configuration

```typescript
export const newsletterConfigSchema = z.object({
  buttondown: z
    .object({
      apiKey: z.string(),
      doubleOptIn: z.boolean().default(true),
      defaultTags: z.array(z.string()).optional(),
    })
    .optional(),
  autoSendOnPublish: z.boolean().default(false),
});
```

Environment variables:

```
BUTTONDOWN_API_KEY=your-api-key
```

## Entity Schemas

### Subscriber

```typescript
subscriberSchema = baseEntitySchema.extend({
  entityType: z.literal("subscriber"),
  metadata: z.object({
    email: z.string().email(),
    status: z.enum(["unactivated", "regular", "unsubscribed"]),
    subscribedAt: z.string().datetime().optional(),
  }),
});
```

### Newsletter

```typescript
newsletterSchema = baseEntitySchema.extend({
  entityType: z.literal("newsletter"),
  metadata: z.object({
    subject: z.string(),
    status: z.enum(["draft", "scheduled", "sent", "failed"]),
    sourcePostId: z.string().optional(),
    sentAt: z.string().datetime().optional(),
  }),
});
```

## Tools

| Tool                          | Description                                            |
| ----------------------------- | ------------------------------------------------------ |
| `newsletter_subscribe`        | Subscribe email (params: email, name?, tags?)          |
| `newsletter_unsubscribe`      | Unsubscribe email                                      |
| `newsletter_create`           | Create draft (params: subject, body, tags?)            |
| `newsletter_from_post`        | Create from blog post (params: postId, customSubject?) |
| `newsletter_send`             | Send newsletter (params: newsletterId)                 |
| `newsletter_list_subscribers` | List subscribers (params: status?, limit?)             |

## Buttondown API Endpoints

| Endpoint                     | Method | Purpose           |
| ---------------------------- | ------ | ----------------- |
| `/v1/subscribers`            | POST   | Create subscriber |
| `/v1/subscribers/{email}`    | GET    | Get subscriber    |
| `/v1/emails`                 | POST   | Create newsletter |
| `/v1/emails/{id}/send-draft` | POST   | Send newsletter   |

Auth: `Authorization: Token $BUTTONDOWN_API_KEY`

## Site-Builder Integration

Add `NewsletterSignup` component to ui-library:

```tsx
<NewsletterSignup
  title="Subscribe to updates"
  description="Get new posts in your inbox"
  buttonText="Subscribe"
  showNameField={false}
/>
```

Hydration for client-side form submission.

## Message Bus Integration

Subscribe to `publish:completed` for auto-send feature:

```typescript
context.messaging.subscribe("publish:completed", async (msg) => {
  if (msg.payload.entityType === "post" && this.config.autoSendOnPublish) {
    await this.createAndQueueNewsletter(msg.payload.entityId);
  }
});
```

## Implementation Order

1. **Plugin scaffold** - package.json, config, index.ts
2. **ButtondownClient** - API client with subscribe/send methods
3. **Entity schemas** - subscriber and newsletter with adapters
4. **Tools** - subscribe, create, send tools
5. **UI component** - NewsletterSignup in ui-library
6. **Auto-send** - Message bus integration (optional)

## Reference Files

| Pattern                | File                                             |
| ---------------------- | ------------------------------------------------ |
| ServicePlugin with API | `plugins/analytics/src/`                         |
| API client             | `plugins/analytics/src/lib/cloudflare-client.ts` |
| Entity schemas         | `plugins/blog/src/schemas/blog-post.ts`          |
| Message bus            | `plugins/publish-pipeline/src/types/messages.ts` |
| UI component           | `shared/ui-library/src/`                         |

## Verification

```bash
# Run tests
bun test plugins/newsletter

# Manual testing
# 1. Configure BUTTONDOWN_API_KEY in .env
# 2. Use CLI to subscribe: newsletter_subscribe email="test@example.com"
# 3. Create newsletter: newsletter_create subject="Test" body="Hello"
# 4. Send: newsletter_send newsletterId="..."
# 5. Check Buttondown dashboard for results
```
