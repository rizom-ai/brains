# Newsletter Plugin (Buttondown Integration)

## Overview

Add a newsletter plugin that integrates with Buttondown for AI-assisted newsletter composition and delivery, with a signup form for the site.

## Provider Choice: Buttondown

- Simple, developer-friendly API
- Newsletter-focused (aligns with blog publishing)
- Supports markdown emails
- Good pricing, no bloat

## User Flow

1. **Generate** (AI-composed, context-aware)
   - "Write a newsletter about my latest post"
   - "Create a weekly digest of my 3 recent posts"
   - AI pulls from posts, topics, brain identity/voice

2. **Refine** (conversational)
   - "Make the intro punchier"
   - "Add a teaser for the superconnectors post"

3. **Send or Queue**
   - "Send it now" → immediate delivery
   - "Send it Friday 9am" → queued for later

## Features

1. **Generate tool** - AI composes newsletter content, can reference posts
2. **Send tool** - Send immediately or queue for scheduled delivery
3. **Subscribe tool** - Collect subscribers via site form
4. **Post integration** - Reference posts, generate teasers with links

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
    status: z.enum(["draft", "queued", "sent", "failed"]),
    postIds: z.array(z.string()).optional(), // Referenced posts
    scheduledFor: z.string().datetime().optional(),
    sentAt: z.string().datetime().optional(),
    buttondownId: z.string().optional(),
  }),
});
```

## Tools

| Tool                          | Description                                                    |
| ----------------------------- | -------------------------------------------------------------- |
| `newsletter_generate`         | AI composes newsletter (params: prompt, postIds?, subject?)    |
| `newsletter_send`             | Send or queue newsletter (params: newsletterId, scheduledFor?) |
| `newsletter_subscribe`        | Subscribe email (params: email, name?, tags?)                  |
| `newsletter_unsubscribe`      | Unsubscribe email (params: email)                              |
| `newsletter_list`             | List newsletters (params: status?, limit?)                     |
| `newsletter_list_subscribers` | List subscribers (params: status?, limit?)                     |

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

## Implementation Order

1. **Plugin scaffold** - package.json, config, index.ts
2. **ButtondownClient** - API client with subscribe/send methods
3. **Entity schemas** - subscriber and newsletter with adapters
4. **Tools** - generate, send, subscribe tools
5. **Job handler** - async send/queue handler
6. **UI component** - NewsletterSignup in ui-library

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
# 2. Subscribe: newsletter_subscribe email="test@example.com"
# 3. Generate: "write a newsletter about my latest post"
# 4. Send: newsletter_send newsletterId="..."
# 5. Queue: newsletter_send newsletterId="..." scheduledFor="2024-01-15T09:00:00Z"
# 6. Check Buttondown dashboard for results
```
