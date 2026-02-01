# @brains/newsletter

Buttondown newsletter integration for AI-assisted composition and scheduled delivery.

## Features

- **Buttondown Integration**: Send newsletters via Buttondown API
- **AI Generation**: Generate newsletter content from prompts or blog posts
- **Subscriber Management**: Subscribe/unsubscribe via API
- **Publishing Workflow**: Draft → Queued → Published lifecycle
- **Signup Form**: Automatic newsletter signup form in site footer

## Usage

```typescript
import { createNewsletterPlugin } from "@brains/newsletter";

const config = defineConfig({
  plugins: [
    createNewsletterPlugin({
      buttondown: {
        apiKey: process.env.BUTTONDOWN_API_KEY,
        doubleOptIn: true,
      },
      autoSendOnPublish: false,
    }),
  ],
});
```

## Tools

- `newsletter:generate` - Generate newsletter from prompt or blog posts
- `newsletter:subscribe` - Subscribe email to newsletter
- `newsletter:unsubscribe` - Unsubscribe email
- `newsletter:list_subscribers` - List current subscribers

## Templates

- `newsletter:newsletter-list` - List of sent newsletters
- `newsletter:newsletter-detail` - Individual newsletter view

## API Routes

- `POST /api/newsletter/subscribe` - Public signup endpoint
