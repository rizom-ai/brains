# Plan: Image Performance Optimization

## Context

Images are the heaviest resource the brain serves. Professional-brain has 112MB of images in preview (52 files). No optimization, no lazy loading, no modern formats. Every image request goes through Hono's full middleware stack.

## Steps

### Step 1: Lazy loading + decode hints on image components

**`shared/ui-library/src/CardImage.tsx`** and **`shared/ui-library/src/CoverImage.tsx`**:

- Add `loading="lazy"` and `decoding="async"` to `<img>` tags
- CoverImage: pass `width`/`height` as attributes (already in props)

### Step 2: Build-time WebP conversion + resize with sharp

During site build, the image extractor writes images to `dist/images/`. Add sharp processing:

- Convert PNG/JPEG to WebP (quality 80). Skip if already WebP.
- Resize to 3 variants: 1920w, 960w, 480w
- **Filesystem cache**: hash the source data, write to `dist/images/{hash}-{size}w.webp`. Skip sharp if file already exists. `dist/` is NOT wiped between builds so this works naturally.

**`plugins/site-builder/src/lib/image-extractor.ts`**: After extracting base64 to file, run sharp to produce WebP variants. Update HTML references to use srcset.

**`plugins/site-builder/package.json`**: Add `sharp` dependency.

No migration needed — existing and new images go through the same build pipeline. Source entities stay untouched (original quality preserved).

### Step 3: Responsive images in HTML

Update image references in built HTML to use srcset:

```html
<img
  src="/images/{hash}-960w.webp"
  srcset="
    /images/{hash}-480w.webp   480w,
    /images/{hash}-960w.webp   960w,
    /images/{hash}-1920w.webp 1920w
  "
  sizes="(max-width: 640px) 480px, (max-width: 1280px) 960px, 1920px"
  loading="lazy"
  decoding="async"
  width="960"
  height="640"
/>
```

### Step 4: Skip Hono middleware for image requests

Serve `/images/*` directly via `Bun.file()` before the Hono app:

```typescript
if (path.startsWith("/images/")) {
  const file = Bun.file(join(distDir, path));
  return new Response(file, {
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
```

## Key files

| File                                              | Change                                            |
| ------------------------------------------------- | ------------------------------------------------- |
| `shared/ui-library/src/CardImage.tsx`             | Add lazy/async/dimensions                         |
| `shared/ui-library/src/CoverImage.tsx`            | Add lazy/async, pass width/height                 |
| `plugins/site-builder/src/lib/image-extractor.ts` | Sharp WebP conversion + resize + filesystem cache |
| `plugins/site-builder/package.json`               | Add `sharp`                                       |
| `interfaces/webserver/src/server-manager.ts`      | Fast path for `/images/*`                         |

## Future: extract sharp to sidecar

Sharp adds ~25MB native binary to Docker. When slimming down for Fly/standalone binary (see `docs/plans/embedding-service.md`), extract sharp into the same media sidecar alongside ONNX embeddings. For now, sharp in the build pipeline is the pragmatic choice.

## Verification

1. `bun run typecheck` / `bun test`
2. Build professional-brain preview site
3. Compare `dist/images/` size before/after (expect 60-80% reduction)
4. Rebuild without changes — sharp should skip all images (cache hit)
5. Browser DevTools: images load lazily, srcset used, immutable cache headers
