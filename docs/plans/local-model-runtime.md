# Plan: Local Model Runtime

## Status

In progress. Phases 1, 2 and 4 are built and Phase 3 is built opt-in; Phase 0 has its first numbers.

- Embeddings: `embeddingModel` selects `openai:text-embedding-3-small`, `-large` or `local:embeddinggemma-2:270m` (served from `modelRuntime.url`), and the index records its identity and rebuilds on change. The Gemma profile chunks to 2,048 tokens: Ollama serves that context by default and silently truncates longer input on `/v1/embeddings`, ignoring per-request options. Failed embeddings retry on the next start.
- Text: `model: local:<name>` runs the agent on the runtime's chat API, with object generation constrained to its schema (`supportsStructuredOutputs`).
- Sidecar: naming a `local:` model in `brain.yaml` adds a pinned Ollama `models` accessory, pulls the models before Kamal starts the brain and passes `MODEL_RUNTIME_URL`; `local:` embeddings are priced at zero. No fleet brain has opted in.
- Images: open. `selectImageProvider` supports a model string, but no config sets `imageModel` (`createAIModelConfig` in `service-config.ts` omits it), so every brain uses `gpt-image-1.5`.

Embedding benchmark, 2026-10-31, through the real provider: the yeehaa rover corpus (`rizom-ai/professional-brain-content`, 237 entities, 0.9 MB; Obsidian templates, trash and traffic snapshots excluded), one cached `gpt-5.4-mini` question per entity, ranked by cosine over the whole corpus.

| Model                           | recall@5 | MRR   | Full embed: CPU, 16 threads | Full embed: Radeon 8060S (Vulkan) |
| ------------------------------- | -------- | ----- | --------------------------- | --------------------------------- |
| `openai:text-embedding-3-small` | 0.941    | 0.777 | 7.4 s (API)                 | 34.4 s (API)                      |
| `local:embeddinggemma-2:270m`   | 0.945    | 0.815 | 89.8 s                      | 18.2 s                            |
| `local:nomic-embed-text:v1.5`   | 0.907    | 0.752 | —                           | 11.4 s                            |

- Quality gate holds: Gemma MRR 0.815 ≥ 0.777 − 0.02, with 2,048-token chunks.
- `nomic-embed-text` (137M, Nomic) is 0.06 MRR below EmbeddingGemma 2, outside the 0.02 margin, so EmbeddingGemma 2 is the proof-of-concept embedder; the nomic row shows the embedder is replaceable by config. The Vulkan run scored Gemma at recall@5 0.949, MRR 0.814.
- Runtime RSS: 560 MB with the model loaded (Ollama 0.40.11 runner 506 MB, server 53 MB).
- Throughput gate fails for the largest production brain on CPU: Karl's corpus is 28.5 MB (5,733 entities), about 47 minutes at the measured 10 KB/s on 16 CPU threads, before the fleet's smaller servers; about 10 minutes on the Z13's iGPU. The fleet server type (`HCLOUD_SERVER_TYPE`) is not yet measured.

Agent evals, 2026-10-31, headless suite (27 runs), judge `gpt-5.4-mini`, `qwen3:8b` on Ollama 0.40.11 with Vulkan on the Z13's Radeon 8060S:

| Model                                | Pass  | Rate | Avg duration |
| ------------------------------------ | ----- | ---- | ------------ |
| `gpt-6-luna` (default)               | 26/27 | 96%  | 3.7 s        |
| `local:qwen3:8b`                     | 23/27 | 85%  | 34.2 s       |
| `local:qwen3:8b`, schema-constrained | 21/27 | 78%  | 25.3 s       |

- The schema-constrained run is what is built. Before the fix, every object generation on the local model (topic votes) failed validation on invented keys; with constrained output those failures are gone.
- `qwen3:8b` fails in both runs: the write–confirm–read-back case, the exact-note direct create, and the private note at admin and trusted (wrong `system_create` `source.kind`). Agent recommendation without a match and skill derivation fail in one run each.
- No brain switches its text model on these numbers.

**Deadline: 2026-11-20.** The Mozilla Foundation Human-Scale AI Incubator closes that day at 23:59 PST. Its form asks whether the project's core functionality depends on a frontier-model API and the largest parameter count of any core model, and the call excludes projects whose core depends on a frontier model or a slimmed-down one. The answers are fixed at submission, so the proof of concept must work and be measured before then.

| Target date | Done                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------- |
| 2026-11-06  | Phase 0 complete: non-Gemma embedding row, larger text candidates, no-key boot, laptop latency |
| 2026-11-11  | This branch merged; the chosen text model's evals recorded                                     |
| 2026-11-14  | Proof-of-concept brain runs fully local on the Z13; its validation recorded in this Status     |
| 2026-11-18  | Demo video recorded from it; parameter counts and eval numbers go into the application draft   |

## Goal

Each brain picks its embedding, text and image model in `brain.yaml`. Cloud providers stay available, and a `local` provider serves open models from a runtime next to the brain.

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
- **Supported embedding models are profiles.** A profile in `ai-service` holds dimensions, input limit, request limits and query/document templates; config rejects an embedding model without a profile. Adding a model means adding a profile and its tests.
- **The runtime contract is the OpenAI-compatible HTTP API** (`/v1/embeddings`, `/v1/chat/completions`, `/v1/images/generations`) at one base URL, `modelRuntime.url` in `brain.yaml`. The brain talks to it with `@ai-sdk/openai-compatible`; the brain never knows which server sits behind the URL.
- **The first runtime is Ollama**, which serves embeddings and chat over that contract. Image generation adds a backend behind the same URL in Phase 5; the brain side does not change.
- **Model identity is stored with the index.** The embedding DB records model, dimensions and prompt revision; any change drops and rebuilds, and the readiness gate holds chat until the index is ready.
- **Text models come from outside the frontier families.** The Mozilla form names GPT, Claude, Gemini/DeepMind and Llama as frontier families, and the call rejects slimmed-down frontier models. Text candidates are open-weight models from other labs (Qwen, Mistral, OLMo).
- **The proof of concept embeds outside the frontier families when it can.** The call rejects slimmed-down frontier models, and EmbeddingGemma 2 is a 270M model from Google DeepMind's Gemma family. `nomic-embed-text` runs the same benchmark; if its MRR is within 0.02 of EmbeddingGemma 2's, it is the proof-of-concept embedder, so no core model comes from a frontier family. Otherwise EmbeddingGemma 2 stays and the application shows the embedder is replaceable by config.
- **Small means 7–32B.** The text model is the smallest one whose evals the team accepts for the proof of concept, capped at 32B. Its parameter count is what the application reports.
- **The proof of concept runs on owned hardware.** The host is the ASUS ROG Flow Z13 with 128 GB of unified memory (AMD Ryzen AI Max+ 395, Radeon 8060S), which fits every candidate up to 32B. The i7-1355U laptop (16 GB, no discrete GPU) is the minimum-hardware check for the smallest candidate. The fleet's server type is measured only for the fleet rollout after the deadline.
- **Cloud models stay in the eval harness.** The eval judge runs at development time and is not part of a brain's core loop.

## Phase 0 — Remaining measurement

By 2026-11-06, on the Z13 unless stated; numbers go in Status.

1. Run the headless suite on `qwen3:14b` and `qwen3:32b`, schema-constrained, next to the default; record pass rate and average duration.
2. Find why `qwen3:8b` passes the wrong `system_create` `source.kind` in the private-note cases; if the tool schema or instructions mislead it, fix them and rerun the headless suite before choosing a larger model.
3. Boot a brain with `model` and `embeddingModel` both `local:` and no `AI_API_KEY`: a test proves it boots, indexes and answers a chat turn with no cloud provider configured; fix whatever still requires a key.
4. Run the smallest accepted text model on the i7 laptop and record its average turn duration.

## Phase 3 — Fleet rollout

After the deadline. Rollout is opt-in per brain: a brain switches by naming a `local:` model in `brain.yaml`, and every other brain deploys as before. The re-embed threshold fails for the largest brains, so large brains stay on OpenAI; the first opt-ins are the smoke rover, then rizom.ai, each verified by readiness reaching ready and search smoke queries. The fleet server type is measured first. A fleet-wide switch is a separate, named decision.

## Phase 5 — Configurable and local image generation

After the deadline.

Tests first: `brain.yaml` `imageModel` reaches `AIModelConfig.imageModel`; `local:` image models resolve to the `local` client.

Build:

1. Wire `imageModel` through `resolveAIConfig` and `createAIModelConfig`, so a brain can pick `google:` or `openai:` image models.
2. `getImageModel` returns the `local` client for `local:` models over `/v1/images/generations`.
3. The runtime adds an image backend behind the same base URL. A runtime router image that dispatches per endpoint to Ollama and the image backend replaces the bare Ollama accessory; `modelRuntime.url` stays the same.

## Validation

- Phase 0: the embedding table carries the non-Gemma row, the eval table carries the 14B and 32B rows and the laptop duration, and the no-key boot test passes.
- Proof of concept: the separate brain on the Z13, holding only the rover's public entities, boots with `model` and `embeddingModel` both `local:` and no `AI_API_KEY`; readiness reaches ready, search answers known queries, and a chat turn completes with tool calls. The demo video is recorded from this run.
- Phase 3: readiness reaches ready and search smoke queries pass on the smoke rover, then rizom.ai.
