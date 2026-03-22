# Plan: Media Sidecar (Embeddings + Image Processing)

## Context

Two native dependencies make the brain process heavy and block the standalone binary goal:

1. **ONNX** (FastEmbed, AllMiniLML6V2, 87MB model) — local vector embeddings. Contributes to 3.65GB memory spike.
2. **Sharp** (libvips, ~25MB binary) — build-time image optimization (WebP conversion + resize). Added by the image performance plan.

Both are native C/C++ binaries that can't be bundled into `bun build --compile`.

## Approach

Extract both into a single **media sidecar** process. The brain calls it over localhost HTTP. One sidecar, two endpoints.

### Architecture

```
Docker container
  ├── Brain process (~1GB, no native deps)
  │   ├── HttpEmbeddingService → http://localhost:9999/embed
  │   └── HttpImageService    → http://localhost:9999/image/optimize
  └── Media sidecar (~500MB)
      ├── FastEmbed + ONNX model  → POST /embed
      └── Sharp                    → POST /image/optimize
```

### Benefits

- Brain process has zero native dependencies — enables standalone binary
- Sidecar can lazy-start (only when needed)
- For hosted minimal rovers: don't start the sidecar at all (no embeddings, no site build)
- Single process to manage, not two separate sidecars
- Keeps fully-local path (no external API dependency)
- Future: shared sidecar across multiple hosted rovers

### Endpoints

**`POST /embed`**

- Input: `{ text: string }` or `{ texts: string[] }`
- Output: `{ embedding: number[] }` or `{ embeddings: number[][] }`
- Backend: FastEmbed ONNX

**`POST /image/optimize`**

- Input: image binary (PNG/JPEG/WebP)
- Query params: `?format=webp&quality=80&width=960`
- Output: optimized image binary
- Backend: Sharp

### Implementation

1. `IEmbeddingService` interface already exists (`shell/entity-service/src/embedding-types.ts`)
2. Create `HttpEmbeddingService` — calls sidecar `/embed` endpoint
3. Create image optimization HTTP client for site-builder's image extractor
4. Create standalone sidecar app (simple Bun/Hono wrapping FastEmbed + Sharp)
5. Make backends configurable: `sidecar` (default) / `api` (OpenAI/Cloudflare) / `in-process` (dev)
6. Update Dockerfile to run both processes

### Phases

**Phase 1** (now): Sharp in-process for image optimization (see image performance plan). Works today.

**Phase 2** (Fly migration prep): Extract Sharp + ONNX into media sidecar. Brain process drops to ~1GB. Enables 2GB Fly machines.

**Phase 3** (standalone binary): Brain builds with `bun build --compile`. Sidecar ships as separate binary or optional Docker companion.

### Memory impact (measured)

| Config                   | Idle                        | Spike      |
| ------------------------ | --------------------------- | ---------- |
| Current (all in-process) | 1.85GB                      | 3.65GB     |
| With sidecar (estimated) | 1.0GB brain + 500MB sidecar | ~2GB total |
| API only (no local)      | 1.0GB                       | ~1.5GB     |
