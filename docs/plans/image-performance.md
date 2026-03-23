# Plan: Image Performance Optimization

## Context

Images are the heaviest resource the brain serves. Professional-brain has 112MB of images in preview (52 files). No optimization, no lazy loading, no modern formats. Every image request goes through Hono's full middleware stack.

## Steps

### Step 1: Lazy loading + decode hints on image components ✅

**`shared/ui-library/src/CardImage.tsx`** and **`shared/ui-library/src/CoverImage.tsx`**:

- Add `loading="lazy"` and `decoding="async"` to `<img>` tags
- CoverImage: pass `width`/`height` as attributes (already in props)

### Step 2: Build-time WebP conversion + resize with sharp ✅

New `ImageOptimizer` class in `plugins/site-builder/src/lib/image-optimizer.ts`:

- Convert PNG/JPEG to WebP (quality 80). Skip if already WebP.
- Resize to 3 variants: 1920w, 960w, 480w (skips upscales)
- **Filesystem cache**: hash the source data, write to `{hash}-{size}w.webp`. Skip sharp if file already exists.
- Added `sharp` to `plugins/site-builder/package.json` and native deps for Docker/binary builds.

### Step 3: Responsive images — Astro-like pre-rendering ✅

Instead of HTML post-processing with regex, images are resolved before rendering:

- **`ImageBuildService`**: Pre-resolves image entities to optimized WebP files before rendering begins. Components and markdown renderers receive optimized URLs directly.
- **`markdownToHtml` callback**: Extended with optional `imageRenderer` callback. Site-builder provides a renderer that resolves `entity://image/{id}` to `<img srcset="...">` during markdown→HTML conversion. No remark plugin needed — `marked` custom renderers handle it.
- **CoverImage component**: Accepts optional `srcset`/`sizes` props, rendered natively.
- **Enrichment**: `enrichWithUrls()` uses `ImageBuildService` to provide optimized cover image URLs + srcset to templates.
- **Fallback**: Old `extractAndResolveImages` post-processing remains for any inline images not yet handled by the new flow.

### Step 4: Skip Hono middleware for image requests ✅

Serve `/images/*` directly via `Bun.file()` before the Hono app in both preview and production servers:

```typescript
private serveImageFastPath(req: Request, distDir: string): Response | null {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/images/")) return null;
  const file = Bun.file(join(distDir, url.pathname));
  return new NativeResponse(file, {
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
```

### Step 5: Shared images directory

Preview and production builds output identical images (content-addressed, hash-based filenames). Currently each environment extracts and optimizes independently — doubling work and disk space.

**Change**: Use a single shared `./dist/images/` directory for both environments.

- First build (preview or production) does the sharp work
- Second build gets a full cache hit — zero processing
- Half the disk space

#### Config changes

| File                                                  | Change                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| `plugins/site-builder/src/config.ts`                  | Add `sharedImagesDir` (default `./dist/images/`)                |
| `plugins/site-builder/src/lib/image-build-service.ts` | Accept images dir as parameter, default to shared dir           |
| `plugins/site-builder/src/lib/site-builder.ts`        | Pass `sharedImagesDir` from config to `ImageBuildService`       |
| `interfaces/webserver/src/config.ts`                  | Add `sharedImagesDir` (default `./dist/images/`)                |
| `interfaces/webserver/src/server-manager.ts`          | Fast path serves from shared dir instead of per-environment dir |

#### Docker / deploy changes

| File                                                               | Change                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------- |
| `deploy/docker/Dockerfile.prod`                                    | Add `mkdir -p /app/dist/images` alongside existing dirs |
| `deploy/scripts/deploy-docker.sh`                                  | Mount shared `images` volume                            |
| `deploy/providers/hetzner/deploy-app.sh`                           | Create `images` directory                               |
| `deploy/providers/hetzner/templates/docker-compose-*.yml.template` | Add `images` volume mount                               |

#### Build-time clean behavior

`PreactBuilder.clean()` removes HTML/CSS/JS but preserves `images/` for the sharp filesystem cache. Already implemented.

## Key files

| File                                                  | Change                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `shared/ui-library/src/CardImage.tsx`                 | `loading="lazy"`, `decoding="async"`                                           |
| `shared/ui-library/src/CoverImage.tsx`                | `loading="lazy"`, `decoding="async"`, `width`/`height`, `srcset`/`sizes` props |
| `shared/utils/src/markdown.ts`                        | `markdownToHtml` extended with optional `imageRenderer` callback               |
| `plugins/site-builder/src/lib/image-optimizer.ts`     | Sharp WebP conversion + responsive variants + filesystem cache                 |
| `plugins/site-builder/src/lib/image-build-service.ts` | Pre-resolves images before rendering, provides `imageRenderer` for markdown    |
| `plugins/site-builder/src/lib/site-builder.ts`        | Image pre-resolution in build flow, enrichment uses optimized URLs             |
| `plugins/site-builder/package.json`                   | `sharp` dependency                                                             |
| `plugins/blog/src/schemas/blog-post.ts`               | `coverImageSrcset`/`coverImageSizes` fields                                    |
| `plugins/blog/src/templates/blog-post.tsx`            | Passes `srcset`/`sizes` to CoverImage                                          |
| `interfaces/webserver/src/server-manager.ts`          | Fast path for `/images/*` with immutable cache headers                         |
| `scripts/extract-native-deps.js`                      | `sharp` in native modules for Docker                                           |
| `scripts/build-release.sh`                            | `--external=sharp` for bun compile                                             |

## Future: extract sharp to sidecar

Sharp adds ~25MB native binary to Docker. When slimming down for Fly/standalone binary (see `docs/plans/embedding-service.md`), extract sharp into the same media sidecar alongside ONNX embeddings. For now, sharp in the build pipeline is the pragmatic choice.

## Verification

1. `bun run typecheck` / `bun test`
2. Build professional-brain preview site
3. Compare `dist/images/` size before/after (expect 60-80% reduction)
4. Rebuild without changes — sharp should skip all images (cache hit)
5. Browser DevTools: images load lazily, srcset used, immutable cache headers
