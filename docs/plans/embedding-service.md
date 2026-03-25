# Plan: Local AI Runtime

## Context

The brain currently bundles ONNX (embeddings) in-process and calls cloud APIs (Anthropic, OpenAI, Google) directly. This creates two problems:

1. **Native deps** — ONNX and Sharp can't compile into a standalone binary
2. **Cloud dependency** — every generation costs money and requires API keys

The sidecar extracts all AI/ML execution into a separate process that can run models **locally** — no cloud, no API keys, no per-token cost. Cloud APIs become one backend option, not the only one.

## Design

A **local AI runtime** — a separate `Bun.serve()` process that handles all inference. The brain talks to it over HTTP. The brain doesn't know or care whether it's running a local model or calling Claude.

### Architecture

```
Brain process (~200MB, no native deps, no API keys)
  │
  └── HTTP → Local AI Runtime
              ├── Embeddings:  ONNX / local model
              ├── Text gen:    local LLM (Ollama/llama.cpp) / Anthropic / OpenAI
              ├── Image gen:   local SD / DALL-E / Gemini
              └── Image opt:   Sharp (WebP conversion, resize)
```

### Backends per capability

| Capability         | Local                          | Cloud                     |
| ------------------ | ------------------------------ | ------------------------- |
| Embeddings         | ONNX (AllMiniLML6V2) — current | OpenAI embeddings API     |
| Text generation    | Ollama, llama.cpp              | Anthropic, OpenAI, Google |
| Image generation   | Stable Diffusion               | DALL-E, Gemini            |
| Image optimization | Sharp                          | — (always local)          |

Each capability has a backend configured independently. A desktop user might run local embeddings + cloud text gen. A hosted rover uses the remote gateway for everything. A fully offline setup runs all local.

### brain.yaml configuration

```yaml
# Local runtime (desktop, self-hosted)
ai:
  endpoint: http://localhost:9999

# Remote gateway (hosted rovers)
ai:
  endpoint: https://ai.rizom.ai
  token: ${AI_GATEWAY_TOKEN}

# In-process (dev mode, no sidecar)
ai:
  endpoint: local
```

The brain only knows the endpoint. Model selection, API keys, and backend choice live in the runtime's own config.

### Runtime config (separate from brain)

```yaml
# runtime.yaml — lives with the sidecar, not the brain
embeddings:
  backend: onnx # onnx | openai
  model: all-MiniLM-L6-v2

text:
  backend: ollama # ollama | anthropic | openai | google
  model: llama3.2 # or claude-sonnet-4-5-20250514

image_generation:
  backend: gemini # dalle | gemini | stable-diffusion
  model: gemini-2.5-flash-image

image_optimization:
  backend: sharp # always sharp

api_keys: # only needed for cloud backends
  anthropic: ${ANTHROPIC_API_KEY}
  openai: ${OPENAI_API_KEY}
  google: ${GOOGLE_API_KEY}
```

### Endpoints

All endpoints use `Bun.serve()` — no framework.

**`POST /embed`**

- Input: `{ text: string }` or `{ texts: string[] }`
- Output: `{ embedding: number[] }` or `{ embeddings: number[][] }`

**`POST /generate`**

- Input: `{ messages, system?, model?, temperature?, maxTokens? }`
- Output: `{ text, usage: { inputTokens, outputTokens } }`

**`POST /generate-object`**

- Input: `{ messages, system?, schema, model? }`
- Output: `{ object, usage }`

**`POST /generate-image`**

- Input: `{ prompt, aspectRatio?, model? }`
- Output: `{ dataUrl, width, height }`

**`POST /optimize-image`**

- Input: image binary
- Query: `?format=webp&quality=80&width=960`
- Output: optimized image binary

**`GET /health`**

- Output: `{ status, backends: { embeddings, text, imageGen, imageOpt }, uptime }`

### Why a separate process

- **Native deps isolated** — ONNX and Sharp don't touch the brain binary
- **Model lifecycle** — load/unload models without restarting the brain
- **Resource management** — GPU/memory allocation separate from brain
- **Shareable** — one runtime serves multiple brains (hosted rovers)
- **Replaceable** — swap Ollama for vLLM, or local for cloud, without touching brain code

### Deployment modes

| Mode          | Runtime                                   | Brain config                       | Use case                       |
| ------------- | ----------------------------------------- | ---------------------------------- | ------------------------------ |
| Desktop       | Local process, auto-started by Electrobun | `endpoint: http://localhost:9999`  | Personal use, optional offline |
| Docker        | Separate container or sidecar in compose  | `endpoint: http://ai-runtime:9999` | Self-hosted                    |
| Hosted rovers | Shared gateway service                    | `endpoint: https://ai.rizom.ai`    | Managed hosting                |
| Dev           | In-process (no sidecar)                   | `endpoint: local`                  | Development, testing           |

## IAIProvider interface

The brain gets a clean interface. Current `AIService` becomes one implementation.

```typescript
interface IAIProvider {
  generate(params: GenerateParams): Promise<GenerateResult>;
  generateObject(params: GenerateObjectParams): Promise<GenerateObjectResult>;
  generateImage(params: ImageParams): Promise<ImageResult>;
  embed(text: string | string[]): Promise<number[] | number[][]>;
  optimizeImage(input: Buffer, options: ImageOptions): Promise<Buffer>;
  health(): Promise<RuntimeHealth>;
}
```

Two implementations:

- `LocalAIProvider` — current in-process behavior (dev mode)
- `HttpAIProvider` — calls the runtime over HTTP

## Steps

### Phase 1: IAIProvider interface

Extract interface from current `AIService`. No behavior change — just a boundary.

1. Define `IAIProvider` in `shell/ai-service/`
2. Current `AIService` implements it
3. Brain resolves provider from `ai.endpoint` config
4. `"local"` → current AIService, anything else → HttpAIProvider (not yet built)
5. Tests

### Phase 2: HttpAIProvider

HTTP client that calls the runtime endpoints.

1. Create `HttpAIProvider` implementing `IAIProvider`
2. Add `ai.endpoint` and `ai.token` to instance overrides schema
3. Brain selects provider based on config
4. Tests with mock HTTP server

### Phase 3: Embedding + image optimization runtime

First runtime capabilities — the native deps.

1. Create `services/ai-runtime/` — `Bun.serve()` app
2. Embed endpoint: FastEmbed + ONNX
3. Optimize-image endpoint: Sharp
4. Runtime config (runtime.yaml or env vars)
5. Health endpoint
6. Test: brain connects to runtime, embeds text, optimizes image

### Phase 4: Text generation runtime

Add LLM backends to the runtime.

1. Ollama backend (local LLM)
2. Anthropic backend (cloud, current behavior)
3. OpenAI + Google backends
4. Model selection via runtime config
5. Test: brain generates text via runtime with local and cloud backends

### Phase 5: Image generation runtime

1. DALL-E backend
2. Gemini backend
3. Stable Diffusion backend (optional, heavy)
4. Test: brain generates images via runtime

### Phase 6: Docker + Electrobun integration

1. Docker Compose: brain + ai-runtime as sidecar
2. Electrobun: auto-start runtime alongside brain
3. Health check: brain waits for runtime `/health` before starting

### Phase 7: Remote gateway (hosted rovers)

1. Deploy runtime as shared service
2. Add auth (bearer token)
3. Usage tracking + rate limiting
4. Cost metering per rover

## Relationship to other plans

| Plan                     | Relationship                                                         |
| ------------------------ | -------------------------------------------------------------------- |
| System to framework      | System's `ai.query()` calls IAIProvider                              |
| Entity consolidation     | derive() and generation handlers call context.ai → IAIProvider       |
| Desktop app (Electrobun) | Runtime auto-starts alongside brain, user configures in app settings |
| Hosted rovers (K8s)      | Shared gateway replaces per-rover API keys                           |
| Standalone binary        | Brain compiles to binary, runtime ships separately                   |

## Memory impact

| Config                    | Brain                     | Runtime                  | Total  |
| ------------------------- | ------------------------- | ------------------------ | ------ |
| Current (all in-process)  | 1.85GB idle, 3.65GB spike | —                        | 3.65GB |
| Local runtime             | ~200MB                    | ~500MB (ONNX + Sharp)    | ~700MB |
| Local runtime + local LLM | ~200MB                    | ~2-8GB (model dependent) | varies |
| Remote gateway (hosted)   | ~200MB                    | — (remote)               | ~200MB |
