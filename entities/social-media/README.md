# @brains/social-media

Multi-provider social media posting with queue-based publishing.

## Features

- **LinkedIn Integration**: Post to LinkedIn via API
- **Native LinkedIn Documents**: Publish PDF/document carousel posts through LinkedIn's current document APIs
- **AI Generation**: Generate posts from prompts or content
- **Queue Management**: Schedule posts for later publishing
- **Publishing Pipeline**: Integration with content-pipeline for scheduling
- **Image Support**: Attach images to social posts
- **Document Support**: Attach durable `document` entities to social posts via `documents[]`

Image/PDF publication failures after validated registration expose `PartialLinkedInUploadError.recovery`: bounded resource URN, media kind, source facts and `registered`, `upload-received`, `uploaded` or `post-attempted` stage. This is not a post receipt or retry authority. Received evidence requires a branded native outcome matching the submitted source and a valid 2xx status; native failures never authorize a subsequent post. Completed uploads survive later cancellation and post failures in invocation-local evidence. `post-attempted` records entry into the post collaborator, not confirmed network submission or post creation. Original causes are retained, while upload URLs, authorization headers and paths are omitted from recovery metadata. Explicit HTTP image rejection retains its existing text-only fallback policy; valid post acknowledgements still return after late cancellation.

The publish handler adds bounded `recovery` diagnostics to its failure report and log: at most eight selected upload records, sixteen graph nodes and 16 KiB, with explicit invalid/truncated flags. Cause/aggregate relationships are retained without raw messages, paths, URLs or headers. Logging failures do not prevent the report attempt; reporting failures retain the original cause. Content-pipeline validates and forwards this shared recovery contract to failure broadcasts and callbacks, joining reporting completion without retrying publication. These diagnostics are not a durable recovery journal.

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
coverImageId: optional-image-id
documents:
  - id: optional-pdf-document-id
sourceEntityType: deck
sourceEntityId: source-deck-id
---
Post content here...
```

## Supported Platforms

- **LinkedIn**: Full support with text, image, and native PDF/document posts
- Additional platforms can be added via the provider system
