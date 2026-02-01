# @brains/image-plugin

Plugin for AI-powered image generation and management.

## Features

- **AI Generation**: Generate images from text prompts
- **Entity Storage**: Store images as base64 data URLs in entities
- **Reference System**: Reference images via `entity://image/{id}` URLs
- **Site Integration**: Automatic extraction to static files during build

## Usage

```typescript
import { imagePlugin } from "@brains/image-plugin";

const config = defineConfig({
  plugins: [imagePlugin()],
});
```

## Tools

- `image:generate` - Generate an image from a prompt

## Image References

Images can be referenced in content using the entity URL scheme:

```markdown
![My Image](entity://image/my-image-id)
```

During site build, these references are resolved to static file URLs.
