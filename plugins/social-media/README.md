# @brains/social-media

Multi-provider social media posting with queue-based publishing.

## Features

- **LinkedIn Integration**: Post to LinkedIn via API
- **AI Generation**: Generate posts from prompts or content
- **Queue Management**: Schedule posts for later publishing
- **Publishing Pipeline**: Integration with content-pipeline for scheduling
- **Image Support**: Attach images to social posts

## Usage

```typescript
import { socialMediaPlugin } from "@brains/social-media";

const config = defineConfig({
  plugins: [
    socialMediaPlugin({
      linkedin: {
        accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
        personUrn: process.env.LINKEDIN_PERSON_URN,
      },
    }),
  ],
});
```

## Tools

- `social-media:generate` - Generate a social media post
- `social-media:publish` - Publish a post to platform

## Templates

- `social-media:post-list` - List of social posts
- `social-media:post-detail` - Individual post view

## Schema

Social posts support multiple platforms:

```yaml
---
platform: linkedin
status: draft
content: Post content here...
---
```

## Supported Platforms

- **LinkedIn**: Full support with text and image posts
- Additional platforms can be added via the provider system
