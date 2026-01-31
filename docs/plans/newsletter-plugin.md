# Newsletter Plugin (Buttondown Integration)

## Overview

Add a newsletter plugin that integrates with Buttondown for AI-assisted newsletter composition and scheduled delivery, with a signup form for the site.

## Provider Choice: Buttondown

- Simple, developer-friendly API
- Newsletter-focused (aligns with blog publishing)
- Supports markdown emails
- Good pricing, no bloat

## User Flow

1. **Generate** (AI-composed, context-aware)
   - "Write a newsletter about my latest post"
   - "Create a weekly digest featuring these 3 posts"
   - AI pulls from any entity type (posts, decks, projects), brain identity/voice

2. **Refine** (conversational)
   - "Make the intro punchier"
   - "Add a teaser for the superconnectors deck"

3. **Send or Queue**
   - No params → queue for next scheduled send (e.g., Friday 9am)
   - `immediate: true` → send now
   - `scheduledFor: "2024-01-20T09:00:00Z"` → send at specific time

## Features

1. **Generate tool** - AI composes newsletter, references any entity via `entityIds`
2. **Send tool** - Three modes: default schedule, immediate, or specific time
3. **Subscribe/Unsubscribe tools** - Manage subscribers via Buttondown API
4. **Signup form** - Site component for visitor subscriptions
5. **Publish-pipeline integration** - Cron-based scheduling

## Data Storage

- **Newsletter entity**: Stored locally (AI-generated content, sent history, referenced entities)
- **Subscribers**: Buttondown is source of truth (no local storage, query via API)

## File Structure

```
plugins/newsletter/
├── src/
│   ├── index.ts
│   ├── newsletter-plugin.ts
│   ├── config.ts
│   ├── schemas/
│   │   └── newsletter.ts
│   ├── adapters/
│   │   └── newsletter-adapter.ts
│   ├── lib/
│   │   └── buttondown-client.ts
│   ├── tools/
│   │   ├── index.ts
│   │   ├── generate.ts
│   │   ├── send.ts
│   │   └── subscribe.ts
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
    })
    .optional(),
});
```

Environment variables:

```
BUTTONDOWN_API_KEY=your-api-key
```

Schedule configured via content-pipeline:

```typescript
// In brain.config.ts
contentPipelinePlugin({
  entitySchedules: {
    newsletter: "0 9 * * 5", // Fridays at 9am
  },
});
```

## Entity Schema

### Newsletter

```typescript
newsletterSchema = baseEntitySchema.extend({
  entityType: z.literal("newsletter"),
  metadata: z.object({
    subject: z.string(),
    status: z.enum(["draft", "queued", "sent", "failed"]),
    entityIds: z.array(z.string()).optional(), // Referenced entities (any type)
    scheduledFor: z.string().datetime().optional(), // Override schedule
    sentAt: z.string().datetime().optional(),
    buttondownId: z.string().optional(),
  }),
});
```

## Tools

| Tool                          | Description                                                       |
| ----------------------------- | ----------------------------------------------------------------- |
| `newsletter_generate`         | AI composes newsletter (params: prompt, entityIds?, subject?)     |
| `newsletter_send`             | Send newsletter (params: newsletterId, immediate?, scheduledFor?) |
| `newsletter_subscribe`        | Subscribe email (params: email, name?, tags?)                     |
| `newsletter_unsubscribe`      | Unsubscribe email (params: email)                                 |
| `newsletter_list`             | List newsletters (params: status?, limit?)                        |
| `newsletter_list_subscribers` | List subscribers via Buttondown API (params: status?, limit?)     |

### Send Tool Modes

1. **Default**: `newsletter_send newsletterId="abc"` → queues for next scheduled time
2. **Immediate**: `newsletter_send newsletterId="abc" immediate=true` → sends now
3. **Specific time**: `newsletter_send newsletterId="abc" scheduledFor="2024-01-20T09:00:00Z"`

## Buttondown API Endpoints

| Endpoint                  | Method | Purpose           |
| ------------------------- | ------ | ----------------- |
| `/v1/subscribers`         | POST   | Create subscriber |
| `/v1/subscribers`         | GET    | List subscribers  |
| `/v1/subscribers/{email}` | GET    | Get subscriber    |
| `/v1/subscribers/{email}` | DELETE | Unsubscribe       |
| `/v1/emails`              | POST   | Create/send email |
| `/v1/emails`              | GET    | List emails       |

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
3. **Newsletter entity schema + adapter** - local storage for generated content
4. **Tools** - generate, send, subscribe, unsubscribe, list tools
5. **Publish-pipeline integration** - register with scheduler for cron-based sending
6. **Job handler** - async send handler
7. **UI component** - NewsletterSignup in ui-library
8. **Tests** - unit and integration tests

## Future Improvements

- **Friendlier schedule config** - Refactor content-pipeline to support human-readable schedules like `{ day: "friday", time: "09:00", timezone: "Europe/Amsterdam" }` instead of raw cron expressions

## Reference Files

| Pattern                | File                                             |
| ---------------------- | ------------------------------------------------ |
| ServicePlugin with API | `plugins/analytics/src/`                         |
| API client             | `plugins/analytics/src/lib/cloudflare-client.ts` |
| Entity schemas         | `plugins/blog/src/schemas/blog-post.ts`          |
| Content-pipeline       | `plugins/content-pipeline/src/`                  |
| UI component           | `shared/ui-library/src/`                         |

## Verification

```bash
# Run tests
bun test plugins/newsletter

# Manual testing
# 1. Configure BUTTONDOWN_API_KEY in .env
# 2. Subscribe: newsletter_subscribe email="test@example.com"
# 3. Generate: "write a newsletter about my latest post"
# 4. Send immediately: newsletter_send newsletterId="..." immediate=true
# 5. Queue for schedule: newsletter_send newsletterId="..."
# 6. Check Buttondown dashboard for results
```
