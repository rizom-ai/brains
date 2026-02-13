# Plan: Image Generation — Multi-Provider Support

## Context

The roadmap lists three image generation improvements for Phase 1:

1. Add a second image provider alongside DALL-E 3
2. Make provider configurable
3. Better text rendering for cover images with titles

Currently, image generation is **tightly coupled to DALL-E 3**: the model is hardcoded in `AIService.generateImage()`, size/style enums are DALL-E-specific throughout the stack, and the tool description explicitly mentions DALL-E 3.

### Why Nano Banana Pro

**Nano Banana Pro** (Gemini 3 Pro Image, launched Nov 2025) is the second provider. Reasons:

- **Text rendering** — its headline feature. Renders legible text directly in images, solving the "better text for cover images" roadmap item without CSS overlays
- **Same API key** — uses `GOOGLE_GENERATIVE_AI_API_KEY`, already configured for Gemini text generation
- **High quality** — up to 4K resolution, advanced creative controls
- **Different API pattern** — uses `generateText()` with image output (multimodal model) rather than `generateImage()` (dedicated image model). This is an implementation detail hidden inside `AIService`.

Imagen 4 was considered but adds little over DALL-E 3 — same dedicated-image-model pattern, no text rendering advantage.

### Decisions

| Decision             | Choice                                                    |
| -------------------- | --------------------------------------------------------- |
| Second provider      | Nano Banana Pro (Gemini 3 Pro Image)                      |
| Size parameter       | Switch to aspect ratios, clean break (drop `size`)        |
| Provider selection   | Global config only (no per-call override)                 |
| Style parameter      | Drop entirely (DALL-E-specific, not universal)            |
| Text on cover images | Trust Nano Banana Pro's native rendering (no CSS overlay) |
| Backward compat      | Clean break — `size` and `style` removed from tool schema |

## Current Architecture

```
image_generate tool → ImageGenerationJobHandler → AIService.generateImage()
                                                       ↓
                                                  openaiProvider.image("dall-e-3")  ← hardcoded
                                                       ↓
                                                  Vercel AI SDK generateImage()
```

## Target Architecture

```
image_generate tool → ImageGenerationJobHandler → AIService.generateImage()
                                                       ↓
                                                  provider from config
                                        ┌──────────────┐  ┌─────────────────┐
                                        │   DALL-E 3    │  │ Nano Banana Pro │
                                        │ generateImage │  │  generateText   │
                                        └──────────────┘  └─────────────────┘
```

## Aspect Ratio Mapping

Nano Banana Pro works with aspect ratios natively. DALL-E 3 needs pixel dimensions. The mapping is internal to `AIService`.

| Aspect ratio | DALL-E 3 size         | Nano Banana Pro |
| ------------ | --------------------- | --------------- |
| `1:1`        | `1024x1024`           | native          |
| `16:9`       | `1792x1024`           | native          |
| `9:16`       | `1024x1792`           | native          |
| `4:3`        | `1792x1024` (closest) | native          |
| `3:4`        | `1024x1792` (closest) | native          |

## Changes

### 1. `shell/ai-service/src/types.ts` — Provider-agnostic types

```typescript
/**
 * Available image generation providers
 */
export type ImageProvider = "openai" | "google";

/**
 * Options for image generation
 */
export interface ImageGenerationOptions {
  /** Image aspect ratio (default: "16:9" for cover images) */
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
}

export interface IAIService {
  // ...existing methods unchanged...

  generateImage(
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResult>;

  /** Check if image generation is available */
  canGenerateImages(): boolean;
}
```

Remove: `size` param, `style` param. Add: `aspectRatio`, `ImageProvider` type.

### 2. `shell/ai-service/src/aiService.ts` — Multi-provider dispatch

The provider is selected from config (`defaultImageProvider`), not per-call. The `generateImage()` method dispatches to the appropriate internal method.

```typescript
// Config determines which provider to use
private get imageProvider(): ImageProvider {
  // Config override, or auto-detect from available API keys
  if (this.config.defaultImageProvider) return this.config.defaultImageProvider;
  if (this.openaiProvider) return "openai";
  if (this.googleProvider) return "google";
  throw new Error("No image generation provider configured");
}

// Aspect ratio → DALL-E size mapping (internal)
private static readonly ASPECT_TO_DALLE_SIZE: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1792x1024",
  "9:16": "1024x1792",
  "4:3": "1792x1024",
  "3:4": "1024x1792",
};

public async generateImage(
  prompt: string,
  options?: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const provider = this.imageProvider;
  const aspectRatio = options?.aspectRatio ?? "16:9";

  if (provider === "google") {
    return this.generateWithNanoBanana(prompt, aspectRatio);
  }
  return this.generateWithDalle(prompt, aspectRatio);
}

private async generateWithDalle(
  prompt: string,
  aspectRatio: string,
): Promise<ImageGenerationResult> {
  const size = AIService.ASPECT_TO_DALLE_SIZE[aspectRatio] ?? "1792x1024";
  const result = await generateImage({
    model: this.openaiProvider!.image("dall-e-3"),
    prompt,
    size: size as "1024x1024" | "1792x1024" | "1024x1792",
  });
  const base64 = result.image.base64;
  return { base64, dataUrl: `data:image/png;base64,${base64}` };
}

private async generateWithNanoBanana(
  prompt: string,
  aspectRatio: string,
): Promise<ImageGenerationResult> {
  // Nano Banana Pro uses generateText() — it's a multimodal model
  const result = await generateText({
    model: this.googleProvider!("gemini-3-pro-image-preview"),
    prompt,
    providerOptions: {
      google: { responseModalities: ["IMAGE", "TEXT"] },
    },
  });

  // Extract image from response files
  const imageFile = result.files?.find(f => f.mediaType.startsWith("image/"));
  if (!imageFile) {
    throw new Error("Nano Banana Pro did not return an image");
  }

  const base64 = Buffer.from(imageFile.uint8Array).toString("base64");
  const mimeType = imageFile.mediaType;
  return { base64, dataUrl: `data:${mimeType};base64,${base64}` };
}
```

Note: `aspectRatio` for Nano Banana Pro may need to be passed via `providerOptions` — verify during implementation.

### 3. `shell/ai-service/src/types.ts` — Update `AIModelConfig`

```typescript
export interface AIModelConfig {
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  webSearch?: boolean;
  openaiApiKey?: string;
  /** Default image provider: "openai" (DALL-E 3) or "google" (Nano Banana Pro) */
  defaultImageProvider?: ImageProvider;
}
```

### 4. `plugins/image/src/tools/index.ts` — Update tool schema

```typescript
// Old:
size: z.enum(["1024x1024", "1792x1024", "1024x1792"]).optional()
style: z.enum(["vivid", "natural"]).optional()

// New:
aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
  .describe("Image aspect ratio (default: 16:9 for cover images)")
  .optional(),
```

Remove `size` and `style`. Add `aspectRatio`.

Update tool description: remove "using DALL-E 3", replace with "Generate an image using AI".

### 5. `plugins/image/src/handlers/image-generation-handler.ts` — Update job schema

```typescript
export const imageGenerationJobDataSchema = z.object({
  prompt: z.string().optional(),
  title: z.string().max(80).optional(),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional(),
  targetEntityType: z.string().optional(),
  targetEntityId: z.string().optional(),
});
```

Remove `size` and `style` from job data. Add `aspectRatio`.

Update progress message: "Generating image with DALL-E" → "Generating image".

## Files

| File                                                     | Change                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `shell/ai-service/src/types.ts`                          | `ImageProvider` type, `aspectRatio` replaces `size`/`style`, `defaultImageProvider` config |
| `shell/ai-service/src/aiService.ts`                      | Multi-provider dispatch, DALL-E + Nano Banana Pro methods, aspect ratio mapping            |
| `plugins/image/src/tools/index.ts`                       | `aspectRatio` param, remove `size`/`style`, update descriptions                            |
| `plugins/image/src/handlers/image-generation-handler.ts` | Updated job schema, generic progress messages                                              |

## Implementation Order

1. `shell/ai-service/src/types.ts` — new types
2. `shell/ai-service/src/aiService.ts` — provider dispatch + both generation methods
3. `plugins/image/src/handlers/image-generation-handler.ts` — updated job schema
4. `plugins/image/src/tools/index.ts` — updated tool params + descriptions
5. Typecheck + test across both packages

## Verification

1. `bun run typecheck` — no errors
2. `bun test` in `shell/ai-service` and `plugins/image` — all pass
3. Manual test:
   - With `OPENAI_API_KEY` only → generates with DALL-E 3
   - With `GOOGLE_GENERATIVE_AI_API_KEY` only → generates with Nano Banana Pro
   - With both + `defaultImageProvider: "google"` → generates with Nano Banana Pro
   - `aspectRatio: "1:1"` produces square image with both providers
   - Cover image with title text → verify text is legible (Nano Banana Pro)

## Key Reference Files

- `shell/ai-service/src/aiService.ts` — current `generateImage()` (lines 213-247)
- `shell/ai-service/src/types.ts` — current `ImageGenerationOptions` (lines 69-74)
- `plugins/image/src/tools/index.ts` — tool schemas with hardcoded DALL-E options
- `plugins/image/src/handlers/image-generation-handler.ts` — job handler

## References

- [Nano Banana Pro — Google DeepMind](https://deepmind.google/models/gemini-image/pro/)
- [Google Gemini Image Generation — Vercel AI SDK](https://ai-sdk.dev/cookbook/guides/google-gemini-image-generation)
- [AI SDK Providers: Google Generative AI](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)
- [Nano Banana Pro on Vercel AI Gateway](https://vercel.com/changelog/nano-banana-pro-gemini-3-pro-image-now-available-in-the-ai-gateway)
