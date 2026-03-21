# Plan: Embedding Service Extraction

## Context

The ONNX embedding model (FastEmbed, AllMiniLML6V2, 87MB) loads in-process, contributing to a 3.65GB memory spike during site build + embedding generation. This makes 2GB Fly machines unviable.

## Approach

Extract embedding generation into a separate sidecar process. The brain calls it over localhost HTTP instead of loading ONNX in-process.

### Architecture

```
Docker container
  ├── Brain process (~1-1.5GB)
  │   └── ApiEmbeddingService → http://localhost:9999/embed
  └── Embedding server (~500MB)
      └── FastEmbed + ONNX model
```

### Benefits

- Brain process stays lightweight — no ONNX runtime in memory
- Embedding server can lazy-start (only when embeddings needed)
- For hosted minimal rovers: don't start the server at all
- Future: shared embedding server across multiple rovers
- Keeps fully-local path (no external API dependency)

### Implementation

1. `IEmbeddingService` interface already exists (`shell/entity-service/src/embedding-types.ts`)
2. Create `HttpEmbeddingService` — calls `localhost:9999/embed` over HTTP
3. Create standalone embedding server (simple Bun/Hono app wrapping FastEmbed)
4. Make embedding backend configurable: `local-sidecar` (default) / `api` (OpenAI/Anthropic) / `in-process` (current, for dev)
5. Update Dockerfile to run both processes (or use a process manager)

### Memory impact (measured)

| Config               | Idle                        | Spike      |
| -------------------- | --------------------------- | ---------- |
| Current (in-process) | 1.85GB                      | 3.65GB     |
| Sidecar (estimated)  | 1.0GB brain + 500MB sidecar | ~2GB total |
| API only (no local)  | 1.0GB                       | ~1.5GB     |
