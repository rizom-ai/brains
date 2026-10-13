# Plan: Local Model Runtime

## Status

Proposed. Nothing implemented. Each brain picks its embedding, text and image model in `brain.yaml`; cloud providers stay available, and a new `local` provider serves open models from a sidecar next to the brain. Embeddings ship first, with Google's EmbeddingGemma 2; text and image generation follow on the same runtime.

## Today

- Text: `brain.yaml` `model` resolves through `resolveTextProvider` (`provider-selection.ts`) to Anthropic, OpenAI or Google.
- Images: `selectImageProvider` supports a model string, but no config sets `imageModel` (`createAIModelConfig` in `service-config.ts` omits it), so every brain uses `gpt-image-1.5`.
- Embeddings: hard-wired to OpenAI `text-embedding-3-small`/1536 in `service-factory.ts`, built from `AI_API_KEY`.
- `resolveAIConfig` (`shell/app/src/ai-config.ts`) strips an explicit `provider:` prefix from `model`, so the provider is re-guessed from the bare name.
- `MODEL_PATTERNS` maps `llama`, `mistral`, `phi-` and `qwen` to provider `ollama`, but `provider-clients.ts` has no ollama client and `getLanguageModel` sends those models to Anthropic.

## Decisions

- **One selection scheme for every capability.** `brain.yaml` takes `model`, `embeddingModel` and `imageModel`, each a `provider:model` string resolved by `provider-selection.ts`. Explicit prefixes are kept end to end. An unknown provider is a config error, never a silent fallback to Anthropic.
- **OpenAI stays the default and the fallback.** `embeddingModel` defaults to `openai:text-embedding-3-small`; `local:` models are opt-in per brain. Switching back is a config change.
- **Embedding fallback is a config switch, not request failover.** Vectors from different models live in different spaces, so a query can only be embedded by the model that built the index. Changing `embeddingModel` rebuilds the index.
- **Supported embedding models are profiles.** A profile in `ai-service` holds dimensions, input limit, request limits and query/document templates. `text-embedding-3-small`, `text-embedding-3-large` and `embeddinggemma-2` ship first; config rejects an embedding model without a profile. Adding a model means adding a profile and its tests.
- **The runtime contract is the OpenAI-compatible HTTP API** (`/v1/embeddings`, `/v1/chat/completions`, `/v1/images/generations`) at one base URL, `modelRuntime.url` in `brain.yaml`. The brain talks to it with `@ai-sdk/openai-compatible`; `@ai-sdk/openai` targets OpenAI's Responses API, which local servers do not fully implement. The brain never knows which server sits behind the URL.
- **The first runtime is Ollama**, which serves embeddings and chat over that contract. Image generation adds a backend behind the same URL in Phase 5; the brain side does not change.
- **Model identity is stored with the index.** The embedding DB records model, dimensions and prompt revision; any change drops and rebuilds. The boot backfill (`shellBootloader.ts:278`, `backfillMissing`) re-queues every entity without a current embedding, and the readiness gate holds chat until the index is ready.

## Phase 0 — Measurement

Throwaway spike in a worktree; nothing merges. Numbers are recorded in this Status section. They gate the production switch in Phase 3, not the configurability work.

1. Run EmbeddingGemma 2 in Ollama locally, using the model tag that will ship.
2. Export one real brain's corpus (the yeehaa rover content repo).
3. Generate one question per note with an LLM, once, cached, so both models face the same queries. Target = the source note.
4. Embed corpus and questions with both models; Gemma uses the query/document prompts from its model card.
5. Measure recall@5 and MRR per model, embedding throughput on the fleet's Hetzner server type, and runtime RSS.

Production switch requires all three:

- Gemma MRR ≥ OpenAI MRR − 0.02.
- Full re-embed of the largest production brain ≤ 10 minutes on the fleet server type.
- Runtime RSS fits the fleet server type alongside the brain without a server upgrade.

## Phase 1 — Configurable embedding model (cloud only)

Tests first:

- Selection: `embeddingModel` resolves `openai:text-embedding-3-large`; a prefixed `model` keeps its provider through `resolveAIConfig`; an unknown provider or an embedding model without a profile fails config validation.
- `migrateEmbeddingDatabase`: fresh DB writes meta; same identity keeps rows; changed model, dimensions or prompt revision drops rows, recreates `F32_BLOB(<dims>)` and writes meta; existing rows without meta are read as `text-embedding-3-small`/1536.
- Provider: requests carry the profile's model and dimensions; usage is recorded under the configured model.

Build:

1. `resolveAIConfig` keeps the `provider:` prefix; `brain.yaml` gains `embeddingModel`.
2. Embedding profiles in `ai-service`; `OnlineEmbeddingProvider` reads limits and dimensions from the profile instead of module constants.
3. `migrateEmbeddingDatabase(client, { model, dimensions, promptRevision })` with an `embedding_meta` row.
4. `app-info.ts:45` reports the configured embedding model.
5. `openai-guest-pricing.ts` gains the `text-embedding-3-large` rate.

Flow when `embeddingModel` changes:

```
boot → migrate: stored identity ≠ configured identity
     → drop + recreate embeddings table, write meta
     → backfillMissing: every entity missing → enqueue embedding jobs
     → readiness gate holds chat until jobs drain
         ├─ provider reachable   → jobs succeed → index ready → chat opens
         └─ provider unreachable → jobs fail via existing failure path
                                 → readiness reports degraded
                                 → provider returns → retried jobs succeed
```

Acceptance: `bun start:personal` switched to `openai:text-embedding-3-large` rebuilds the index, and search returns the expected notes for known queries; an integration test covers both branches.

## Phase 2 — `local` provider: EmbeddingGemma 2 in a test app

Tests first:

- Local provider with an injected `fetch`: requests go to `modelRuntime.url` `/v1/embeddings` with the configured model.
- Profile templates: EmbeddingGemma queries become `task: search result | query: <text>`, documents become `title: <title or none> | text: <content>`; chunking budgets the template bytes; OpenAI profiles send text unchanged.
- `llama`/`mistral`/`phi-`/`qwen` model names resolve to `local`.

Build:

1. Add `@ai-sdk/openai-compatible`; `provider-clients.ts` creates a `local` client from `modelRuntime.url`.
2. `IEmbeddingService` splits `generateEmbedding` into `embedQuery(text)` and `embedDocuments(inputs)`, where a document input carries `title` and `content`. Call sites: `entity-search.ts:155` and `:525` → `embedQuery`; `embeddingJobHandler.ts:111` → `embedDocuments` with the entity's frontmatter title.
3. The `MODEL_PATTERNS` `ollama` entries become `local`.
4. Switch one test app to `embeddingModel: local:embeddinggemma-2` against a local Ollama; the docs give the `ollama pull` command.
5. Re-run the Phase 0 benchmark through the real provider and record the result here.

## Phase 3 — Runtime sidecar on the fleet

Tests first: deploy-support template tests assert the runtime accessory, its network address and the `modelRuntime.url` the brain receives; the pull step lists exactly the `local:` models named in `brain.yaml`.

Build:

1. `shared/deploy-support/src/kamal-deploy.yml` gains a `models` accessory: a pinned `ollama/ollama` image, a persistent `/opt/brain-models` volume and a healthcheck. The rover-pilot template in `packages/brains-ops` gets the same accessory.
2. The deploy pulls every `local:` model in `brain.yaml` into the volume before the brain starts. Brains with no `local:` model deploy without the accessory.
3. `openai-guest-pricing.ts` prices `local:` embedding models at 0.
4. Rollout, after the Phase 0 thresholds hold: smoke rover → rizom.ai, each verified by readiness reaching ready and search smoke queries. A fleet-wide switch is a separate, named decision.

## Phase 4 — Local text generation

Tests first: `model: local:<name>` resolves to the `local` client; the ai-evaluation multi-model runner accepts `local:` models.

Build:

1. `getLanguageModel` returns the `local` client for `local:` models over `/v1/chat/completions`.
2. Run the existing agent evals with a local model next to the current default, and record tool-calling pass rates in this plan before any brain switches.
3. The runtime accessory pulls the configured text model like an embedding model.

## Phase 5 — Configurable and local image generation

Tests first: `brain.yaml` `imageModel` reaches `AIModelConfig.imageModel`; `local:` image models resolve to the `local` client.

Build:

1. Wire `imageModel` through `resolveAIConfig` and `createAIModelConfig`, so a brain can pick `google:` or `openai:` image models.
2. `getImageModel` returns the `local` client for `local:` models over `/v1/images/generations`.
3. The runtime adds an image backend behind the same base URL. A runtime router image that dispatches per endpoint to Ollama and the image backend replaces the bare Ollama accessory; `modelRuntime.url` stays the same.

## Out of scope

- Multimodal embeddings (images, audio, video) from EmbeddingGemma 2's shared space; that is image search, its own plan.
- Automatic failover between providers.
