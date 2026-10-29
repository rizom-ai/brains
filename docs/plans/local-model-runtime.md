# Plan: Local Model Runtime

## Status

Proposed. Nothing implemented. Every brain still calls Anthropic, OpenAI or Google:

- Text: `brain.yaml` `model` resolves through `resolveTextProvider` (`provider-selection.ts`) to Anthropic, OpenAI or Google.
- Images: `brain.yaml` `imageModel` resolves through `selectImageProvider` to OpenAI or Google; the default is `gpt-image-1.5`.
- Embeddings: `brain.yaml` `embeddingModel` exists but `resolveEmbeddingModel` (`provider-keys.ts`) accepts only OpenAI `text-embedding-3-small`/1536.
- Keys: each capability uses its model provider's key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`) via `resolveCapabilityKeys`; legacy `AI_API_KEY` / `AI_IMAGE_KEY` fill in for unset ones. Rover pilot fleet deploys still pass only `AI_API_KEY`.
- `resolveAIConfig` (`shell/app/src/ai-config.ts`) strips an explicit `provider:` prefix from `model`, so the provider is re-guessed from the bare name.
- `MODEL_PATTERNS` maps `llama`, `mistral`, `phi-` and `qwen` to provider `ollama`, but `provider-clients.ts` has no ollama client and `getLanguageModel` sends those models to Anthropic.

**Deadline: 2026-11-20.** The Mozilla Foundation Human-Scale AI Incubator closes that day at 23:59 PST. Its form asks whether the project's core functionality depends on a frontier-model API and the largest parameter count of any core model, and the call excludes projects whose core depends on a frontier model or a slimmed-down one. The answers are fixed at submission, so the proof of concept below must work and be measured before then.

| Target date | Done                                                                                   |
| ----------- | -------------------------------------------------------------------------------------- |
| 2026-11-06  | Phase 0 numbers recorded; text and embedding models chosen                             |
| 2026-11-11  | Phases 1, 2 and 4 merged; `local:` text and embeddings work in a test app              |
| 2026-11-14  | Proof-of-concept brain runs fully local on the Z13; evals recorded in this Status      |
| 2026-11-18  | Demo video recorded from it; parameter counts and eval numbers go into the application |

## Goal

Each brain picks its embedding, text and image model in `brain.yaml`. Cloud providers stay available, and a new `local` provider serves open models from a runtime next to the brain.

By the deadline: a proof of concept. A separate brain, not the team brain or any other production brain, runs with no cloud AI key on hardware the operator already owns: chat, tool calling, generation and search on open models, with image generation unavailable rather than cloud-backed (`canGenerateImages` already returns false without an image client). It does not need to be always on or serve users; it needs to work, be measured, and be shown. It holds a copy of the yeehaa rover's public entities only, so nothing shared or restricted reaches the demo video.

## Non-goals

- No production brain switches to local models before the deadline; the fleet keeps its cloud defaults.
- No rented GPU hardware for the proof of concept.
- No multimodal embeddings (images, audio, video) from EmbeddingGemma 2's shared space; that is image search, its own plan.
- No automatic failover between providers.

## Decisions

- **One selection scheme for every capability.** `brain.yaml` takes `model`, `embeddingModel` and `imageModel`, each a `provider:model` string resolved by `provider-selection.ts`. Explicit prefixes are kept end to end. An unknown provider is a config error, never a silent fallback to Anthropic.
- **OpenAI stays the default and the fallback.** `embeddingModel` defaults to `openai:text-embedding-3-small`; `local:` models are opt-in per brain. Switching back is a config change.
- **Embedding fallback is a config switch, not request failover.** Vectors from different models live in different spaces, so a query can only be embedded by the model that built the index. Changing `embeddingModel` rebuilds the index.
- **Supported embedding models are profiles.** A profile in `ai-service` holds dimensions, input limit, request limits and query/document templates. `text-embedding-3-small`, `text-embedding-3-large` and the chosen local embedding model ship first; config rejects an embedding model without a profile. Adding a model means adding a profile and its tests.
- **The runtime contract is the OpenAI-compatible HTTP API** (`/v1/embeddings`, `/v1/chat/completions`, `/v1/images/generations`) at one base URL, `modelRuntime.url` in `brain.yaml`. The brain talks to it with `@ai-sdk/openai-compatible`; `@ai-sdk/openai` targets OpenAI's Responses API, which local servers do not fully implement. The brain never knows which server sits behind the URL.
- **The first runtime is Ollama**, which serves embeddings and chat over that contract. Image generation adds a backend behind the same URL in Phase 5; the brain side does not change.
- **Model identity is stored with the index.** The embedding DB records model, dimensions and prompt revision; any change drops and rebuilds. The boot backfill (`shellBootloader.ts:278`, `backfillMissing`) re-queues every entity without a current embedding, and the readiness gate holds chat until the index is ready.
- **Local models come from outside the frontier families.** The Mozilla form names GPT, Claude, Gemini/DeepMind and Llama as frontier families, and the call rejects slimmed-down frontier models. Candidates are open-weight models from other labs (Qwen, Mistral, OLMo); Gemma and Llama variants are measured only as baselines. This applies to the embedding model too, so EmbeddingGemma 2 competes with a non-Gemma embedder in Phase 0 instead of being assumed.
- **Small means 7–32B.** The text model is the smallest one that passes the agent evals, capped at 32B. The chosen parameter count is what the application reports.
- **The proof of concept runs on owned hardware.** The host is the ASUS ROG Flow Z13 with 128 GB of unified memory (AMD Ryzen AI Max+ 395, Radeon 8060S), which fits every candidate up to 32B; Ollama runs natively on it. The i7-1355U laptop (16 GB, no discrete GPU) is the minimum-hardware check for the smallest candidate. The fleet's server type is measured only for the fleet switch after the deadline.
- **Cloud models stay in the eval harness.** The eval judge (`multi-model-runner.ts:189`, `claude-haiku-4-5`) runs at development time and is not part of a brain's core loop.

## Phase 0 — Measurement

Throwaway spike in a worktree; nothing merges. Numbers are recorded in Status. They pick the models for the proof of concept and gate the fleet switch in Phase 3.

Embeddings:

1. Run EmbeddingGemma 2 and at least one non-Gemma embedder (Qwen3-Embedding or nomic-embed-text) in Ollama on the Z13, using the model tags that will ship.
2. Export the yeehaa rover's public entities, the corpus the proof-of-concept brain will hold.
3. Generate one question per note with an LLM, once, cached, so all models face the same queries. Target = the source note.
4. Embed corpus and questions with each model, using the query/document prompts from each model card.
5. Measure recall@5 and MRR per model, embedding throughput and runtime RSS.

Text:

1. Pull two or three tool-calling candidates between 7B and 32B into the same Ollama.
2. Run `brain-eval --suite personal` against each through a local OpenAI-compatible client in the spike, next to the current default model.
3. Record tool-calling pass rate, median turn latency and runtime RSS per model on the Z13, and the smallest candidate's latency on the i7 laptop.

Choosing for the proof of concept: the embedding model with the best MRR among non-frontier candidates, and the smallest text model whose personal-suite pass rate the team accepts. Both choices and their numbers go in Status.

Fleet switch (Phase 3, after the deadline) requires all three, measured on the fleet server type:

- Local embedding MRR ≥ OpenAI MRR − 0.02.
- Full re-embed of the largest production brain ≤ 10 minutes.
- Runtime RSS fits alongside the brain without a server upgrade.

## Phase 1 — Configurable embedding model (cloud only)

Tests first:

- Selection: `embeddingModel` resolves `openai:text-embedding-3-large`; a prefixed `model` keeps its provider through `resolveAIConfig`; an unknown provider or an embedding model without a profile fails config validation.
- `migrateEmbeddingDatabase`: fresh DB writes meta; same identity keeps rows; changed model, dimensions or prompt revision drops rows, recreates `F32_BLOB(<dims>)` and writes meta; existing rows without meta are read as `text-embedding-3-small`/1536.
- Provider: requests carry the profile's model and dimensions; usage is recorded under the configured model.

Build:

1. `resolveAIConfig` keeps the `provider:` prefix; `brain.yaml` gains `embeddingModel`.
2. Embedding profiles in `ai-service`; `OnlineEmbeddingProvider` reads limits and dimensions from the profile instead of module constants.
3. `migrateEmbeddingDatabase(client, { model, dimensions, promptRevision })` with an `embedding_meta` row.
4. `app-info.ts:45` and `embeddingJobHandler.ts:117` report the configured embedding model.
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

## Phase 2 — `local` provider: embeddings

Tests first:

- Local provider with an injected `fetch`: requests go to `modelRuntime.url` `/v1/embeddings` with the configured model.
- Profile templates: each local profile applies its model card's query/document templates (for EmbeddingGemma, queries become `task: search result | query: <text>` and documents `title: <title or none> | text: <content>`); chunking budgets the template bytes; OpenAI profiles send text unchanged.
- `llama`/`mistral`/`phi-`/`qwen` model names resolve to `local`.

Build:

1. Add `@ai-sdk/openai-compatible`; `provider-clients.ts` creates a `local` client from `modelRuntime.url`.
2. `IEmbeddingService` splits `generateEmbedding` into `embedQuery(text)` and `embedDocuments(inputs)`, where a document input carries `title` and `content`. Call sites: `entity-search.ts:155` and `:525` → `embedQuery`; `embeddingJobHandler.ts:111` → `embedDocuments` with the entity's frontmatter title.
3. The `MODEL_PATTERNS` `ollama` entries become `local`.
4. The docs give the `ollama pull` command for the chosen embedding model.

## Phase 3 — Runtime sidecar for the fleet

After the deadline.

Tests first: deploy-support template tests assert the runtime accessory, its network address and the `modelRuntime.url` the brain receives; the pull step lists exactly the `local:` models named in `brain.yaml`; a brain with only `local:` models deploys without `AI_API_KEY`.

Build:

1. `shared/deploy-support/src/kamal-deploy.yml` gains a `models` accessory: a pinned `ollama/ollama` image, a persistent `/opt/brain-models` volume and a healthcheck.
2. The deploy pulls every `local:` model in `brain.yaml` into the volume before the brain starts. Brains with no `local:` model deploy without the accessory.
3. `openai-guest-pricing.ts` prices `local:` models at 0.
4. The rover-pilot template in `packages/brains-ops` gets the accessory; rollout smoke rover → rizom.ai once the Phase 0 fleet thresholds hold. A fleet-wide switch is a separate, named decision.

## Phase 4 — Local text generation

Tests first: `model: local:<name>` resolves to the `local` client; the ai-evaluation multi-model runner accepts `local:` models; a brain with a `local:` text model and no AI key boots without constructing any cloud text client.

Build:

1. `getLanguageModel` returns the `local` client for `local:` models over `/v1/chat/completions`.
2. Run the existing agent evals (`brain-eval --suite personal`, then `team`) with the Phase 0 text model next to the current default, and record tool-calling pass rates in Status.

## Phase 5 — Configurable and local image generation

After the deadline.

Tests first: `brain.yaml` `imageModel` reaches `AIModelConfig.imageModel`; `local:` image models resolve to the `local` client.

Build:

1. Wire `imageModel` through `resolveAIConfig` and `createAIModelConfig`, so a brain can pick `google:` or `openai:` image models.
2. `getImageModel` returns the `local` client for `local:` models over `/v1/images/generations`.
3. The runtime adds an image backend behind the same base URL. A runtime router image that dispatches per endpoint to Ollama and the image backend replaces the bare Ollama accessory; `modelRuntime.url` stays the same.

## Validation

- Phase 1: `bun start:personal` switched to `openai:text-embedding-3-large` rebuilds the index, and search returns the expected notes for known queries; an integration test covers both branches of the flow above.
- Phase 2: a test app on the chosen local embedding model against Ollama re-runs the Phase 0 benchmark through the real provider, with the result recorded in Status.
- Phase 4: the personal and team eval pass rates for the local text model are recorded next to the cloud default.
- Proof of concept: the separate brain on the Z13, holding only the rover's public entities, boots with `model` and `embeddingModel` both `local:` and no `AI_API_KEY`; readiness reaches ready, search answers known queries, and a chat turn completes with tool calls. The demo video is recorded from this run.
- Phase 3: readiness reaches ready and search smoke queries pass on the smoke rover, then rizom.ai.
