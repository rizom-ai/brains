# Image Generation — Multi-Provider Support

## Context

Image generation is tightly coupled to DALL-E 3: the model is hardcoded in `AIService.generateImage()`, size/style enums are DALL-E-specific, and the tool description explicitly mentions DALL-E 3. The roadmap calls for adding a second provider, switching from pixel sizes to aspect ratios, and better text rendering for cover images.

**Second provider**: Google Gemini (`gemini-2.5-flash-image`) via `@ai-sdk/google`. Key advantages:

- Native text rendering in images (solves "better text for cover images")
- Supports `aspectRatio` natively (no pixel-to-ratio mapping needed)
- Uses same Vercel AI SDK `generateImage()` function — minimal code change
- `GOOGLE_GENERATIVE_AI_API_KEY` env var (auto-read by `@ai-sdk/google`)

## Changes

### 1. Add `@ai-sdk/google` dependency

**File**: `shell/ai-service/package.json`

- Add `"@ai-sdk/google": "^3.0.0"` to dependencies

Run `bun install` after.

### 2. Update types

**File**: `shell/ai-service/src/types.ts`

- Add `ImageProvider` type: `"openai" | "google"`
- Add `googleApiKey` and `defaultImageProvider` to `AIModelConfig`
- Replace `size`/`style` with `aspectRatio` in `ImageGenerationOptions`
- Update `canGenerateImages()` doc to mention both providers

### 3. Update AIService

**File**: `shell/ai-service/src/aiService.ts`

- Import `createGoogleGenerativeAI` from `@ai-sdk/google`
- Add `private googleProvider` field (like `openaiProvider`)
- Create Google provider in constructor if `googleApiKey` is set
- Add `imageProvider` getter: config override → auto-detect from available keys
- Update `generateImage()` to dispatch based on provider:
  - **OpenAI path**: map `aspectRatio` → DALL-E pixel size, use `openaiProvider.image("dall-e-3")`
  - **Google path**: pass `aspectRatio` directly, use `googleProvider.image("gemini-2.5-flash-image")`
- Update `canGenerateImages()`: `openaiProvider !== null || googleProvider !== null`
- Update error messages to be provider-agnostic

Aspect ratio → DALL-E size mapping (internal):
| Aspect ratio | DALL-E 3 size |
|---|---|
| `1:1` | `1024x1024` |
| `16:9` | `1792x1024` |
| `9:16` | `1024x1792` |
| `4:3` | `1792x1024` |
| `3:4` | `1024x1792` |

### 4. Wire Google API key through shell config

**File**: `shell/core/src/config/shellConfig.ts` (line 193)

- Add: `googleApiKey: process.env["GOOGLE_GENERATIVE_AI_API_KEY"] ?? overrides.ai?.googleApiKey`

### 5. Update image plugin config

**File**: `plugins/image/src/image-plugin.ts`

- Remove `defaultStyle` and `defaultSize` from config schema
- Add `defaultAspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).default("16:9")`

### 6. Update image generation handler

**File**: `plugins/image/src/handlers/image-generation-handler.ts`

- Replace `size`/`style` with `aspectRatio` in job data schema
- Pass `aspectRatio` to `ai.generateImage()`
- Update progress message: "Generating image with DALL-E" → "Generating image"

### 7. Update image tools

**File**: `plugins/image/src/tools/index.ts`

- Replace `size`/`style` params with `aspectRatio` in tool schema
- Update tool description: remove "using DALL-E 3"
- Update error message: remove "OPENAI_API_KEY" reference

### 8. Update social-media caller

**File**: `plugins/social-media/src/handlers/generationHandler.ts` (line 284)

- Change `size: "1792x1024"` → `aspectRatio: "16:9"`

### 9. Update env examples

**Files**: `apps/professional-brain/.env.example`, `deploy/docker/.env.production.example`, etc.

- Add `GOOGLE_GENERATIVE_AI_API_KEY=` entry

## Implementation order

1. `shell/ai-service/package.json` — add dependency + `bun install`
2. `shell/ai-service/src/types.ts` — new types
3. `shell/ai-service/src/aiService.ts` — multi-provider dispatch
4. `shell/core/src/config/shellConfig.ts` — wire Google API key
5. `plugins/image/src/image-plugin.ts` — config update
6. `plugins/image/src/handlers/image-generation-handler.ts` — job schema
7. `plugins/image/src/tools/index.ts` — tool params
8. `plugins/social-media/src/handlers/generationHandler.ts` — caller fix
9. Update tests + env examples
10. Typecheck + lint + test

## Files to modify

| File                                                        | Change                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| `shell/ai-service/package.json`                             | Add `@ai-sdk/google`                                                   |
| `shell/ai-service/src/types.ts`                             | `ImageProvider`, `aspectRatio`, `googleApiKey`, `defaultImageProvider` |
| `shell/ai-service/src/aiService.ts`                         | Google provider, dispatch, aspect ratio mapping                        |
| `shell/core/src/config/shellConfig.ts`                      | Read `GOOGLE_GENERATIVE_AI_API_KEY`                                    |
| `plugins/image/src/image-plugin.ts`                         | Config: `defaultAspectRatio` replaces `defaultSize`/`defaultStyle`     |
| `plugins/image/src/handlers/image-generation-handler.ts`    | Job schema: `aspectRatio` replaces `size`/`style`                      |
| `plugins/image/src/tools/index.ts`                          | Tool schema: `aspectRatio` replaces `size`/`style`                     |
| `plugins/social-media/src/handlers/generationHandler.ts`    | `aspectRatio: "16:9"` replaces `size: "1792x1024"`                     |
| `apps/professional-brain/.env.example`                      | Add Google API key                                                     |
| Tests in `plugins/image/test/` and `shell/ai-service/test/` | Update for new params                                                  |

## Verification

1. `bun run typecheck` — no errors
2. `bun test plugins/image/` — all pass
3. `bun test plugins/social-media/` — all pass
4. `bun run lint` — no errors
