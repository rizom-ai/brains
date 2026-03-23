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
private serveImageFastPath(req: Request): Response | null {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/images/")) return null;
  const fileName = url.pathname.replace("/images/", "");
  const file = Bun.file(join(this.options.sharedImagesDir, fileName));
  return new NativeResponse(file, {
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
```

### Step 5: Shared images directory ✅

Preview and production share `./dist/images/`. Content-addressed filenames mean identical output. First build optimizes, second gets full cache hit.

- `sharedImagesDir` config in site-builder and webserver
- Docker/deploy updated with shared images volume mount
- `PreactBuilder.clean()` preserves `images/` for sharp cache
- `cleanBeforeBuild` option wired up (was dead code)

### Step 6: ImageRenderer via Preact context + remove post-processing

Templates call `markdownToHtml(post.body)` but don't have access to the `ImageBuildService`. Instead of hacking it into the enrichment step (wrong layer), use a Preact context — same pattern as the existing `HeadProvider`/`useHead()`.

`preact-render-to-string` supports `useContext` during SSR. The existing `HeadProvider` pattern in this codebase proves it works.

#### New: `ImageRendererProvider` + `useImageRenderer`

`shared/ui-library/src/ImageRendererProvider.tsx`:

```tsx
const ImageRendererContext = createContext<ImageRenderer | null>(null);

export function ImageRendererProvider({ imageRenderer, children }) {
  return h(ImageRendererContext.Provider, { value: imageRenderer }, children);
}

export function useImageRenderer(): ImageRenderer | null {
  return useContext(ImageRendererContext);
}
```

#### New: `useMarkdownToHtml` hook

`shared/ui-library/src/useMarkdownToHtml.tsx`:

```tsx
export function useMarkdownToHtml(): (markdown: string) => string {
  const imageRenderer = useImageRenderer();
  return (markdown: string) =>
    markdownToHtml(markdown, imageRenderer ? { imageRenderer } : undefined);
}
```

#### Wiring into preact-builder

`plugins/site-builder/src/lib/preact-builder.ts` — wrap rendering in `ImageRendererProvider` alongside `HeadProvider`:

```tsx
const imageRenderer = context.imageBuildService?.createImageRenderer();
const wrapper = h(HeadProvider, { headCollector }, [
  h(ImageRendererProvider, { imageRenderer }, children),
]);
```

#### Template migration

Templates replace:

```tsx
import { markdownToHtml } from "@brains/utils";
const htmlContent = markdownToHtml(post.body);
```

With:

```tsx
import { useMarkdownToHtml } from "@brains/ui-library";
const toHtml = useMarkdownToHtml();
const htmlContent = toHtml(post.body);
```

Same call pattern, but the hook version automatically includes the image renderer when available. Templates that don't migrate continue to work — they just don't get optimized inline images.

#### Remove old post-processing

Once templates use the hook, `extractAndResolveImages()` in `preact-builder.ts` can be removed along with `ImageExtractor` and `ImageReferenceResolver`. The old regex-based HTML post-processing is fully replaced by the Astro-like pre-rendering approach.

#### Files

| File                                                     | Change                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `shared/ui-library/src/ImageRendererProvider.tsx`        | **New** — context + provider + hook                                         |
| `shared/ui-library/src/useMarkdownToHtml.tsx`            | **New** — hook wrapping `markdownToHtml` with image renderer                |
| `shared/ui-library/src/index.ts`                         | Export new components                                                       |
| `plugins/site-builder/src/lib/preact-builder.ts`         | Wrap rendering in `ImageRendererProvider`, remove `extractAndResolveImages` |
| `plugins/blog/src/templates/blog-post.tsx`               | Use `useMarkdownToHtml` hook                                                |
| `plugins/blog/src/templates/homepage.tsx`                | Use `useMarkdownToHtml` hook                                                |
| `plugins/newsletter/src/templates/newsletter-detail.tsx` | Use `useMarkdownToHtml` hook                                                |
| `plugins/portfolio/src/templates/project-detail.tsx`     | Use `useMarkdownToHtml` hook                                                |
| `plugins/products/src/templates/products-page.tsx`       | Use `useMarkdownToHtml` hook                                                |
| `layouts/personal/src/datasources/about-datasource.ts`   | Use hook or pass renderer                                                   |
| `layouts/professional/src/templates/about.tsx`           | Use `useMarkdownToHtml` hook                                                |
| `shared/ui-library/src/PresentationLayout.tsx`           | Use `useMarkdownToHtml` hook                                                |

## Key files

| File                                                  | Change                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `shared/ui-library/src/CardImage.tsx`                 | `loading="lazy"`, `decoding="async"`                                           |
| `shared/ui-library/src/CoverImage.tsx`                | `loading="lazy"`, `decoding="async"`, `width`/`height`, `srcset`/`sizes` props |
| `shared/ui-library/src/ImageRendererProvider.tsx`     | Preact context for image renderer during SSR                                   |
| `shared/ui-library/src/useMarkdownToHtml.tsx`         | Hook that wraps `markdownToHtml` with image renderer from context              |
| `shared/utils/src/markdown.ts`                        | `markdownToHtml` extended with optional `imageRenderer` callback               |
| `plugins/site-builder/src/lib/image-optimizer.ts`     | Sharp WebP conversion + responsive variants + filesystem cache                 |
| `plugins/site-builder/src/lib/image-build-service.ts` | Pre-resolves images before rendering, provides `imageRenderer` for markdown    |
| `plugins/site-builder/src/lib/site-builder.ts`        | Image pre-resolution in build flow, enrichment uses optimized URLs             |
| `plugins/site-builder/src/lib/preact-builder.ts`      | `ImageRendererProvider` wiring, `cleanBeforeBuild`, remove post-processing     |
| `plugins/site-builder/package.json`                   | `sharp` dependency                                                             |
| `plugins/blog/src/schemas/blog-post.ts`               | `coverImageSrcset`/`coverImageSizes` fields                                    |
| `plugins/blog/src/templates/blog-post.tsx`            | `useMarkdownToHtml` hook, passes `srcset`/`sizes` to CoverImage                |
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
