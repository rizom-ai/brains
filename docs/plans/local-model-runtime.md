# Plan: Local Model Runtime

## Status

In progress. Phases 1, 2 and 4 are built and Phase 3 is built opt-in; Phase 0 has its numbers except the laptop check, and the proof-of-concept configuration is chosen.

- Embeddings: `embeddingModel` selects `openai:text-embedding-3-small`, `-large` or `local:embeddinggemma-2:270m` (served from `modelRuntime.url`), and the index records its identity and rebuilds on change. The Gemma profile chunks to 2,048 tokens: Ollama serves that context by default and silently truncates longer input on `/v1/embeddings`, ignoring per-request options. Failed embeddings retry on the next start.
- Text: `model: local:<name>` runs the agent on the runtime's chat API, with object generation constrained to its schema (`supportsStructuredOutputs`); `reasoningEffort` reaches the runtime as `reasoning_effort`, and `none` turns a model's thinking off.
- Answer model: `answerModel` names a `local:` model that writes while `model` chooses tools: it answers tool results and runs text and object generation (background derivations, drafts). Without it, a local `model` answers tool results with reasoning off. A local text model's searches return five hits of at most 800 characters.
- Vision model: `visionModel` names a `local:` model that describes uploaded images for a local `model`; the description, cached per image, reaches `model` in place of the image, and without it an image reaches a local `model` as its name and type.
- No key: a brain whose `model` and `embeddingModel` are both `local:` starts without `AI_API_KEY`; `no-cloud-key-boot.test.ts` boots one against an OpenAI-compatible runtime, indexes and answers a chat turn with no request leaving the runtime.
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

Agent evals, 2026-10-31 to 2026-11-05, headless suite (27 runs), judge `gpt-5.4-mini`, local models on Ollama (0.40.11, then 0.40.13) with Vulkan on the Z13's Radeon 8060S:

| Model                                                                              | Pass  | Rate | Avg duration   |
| ---------------------------------------------------------------------------------- | ----- | ---- | -------------- |
| `gpt-6-luna` (default)                                                             | 26/27 | 96%  | 3.7 s          |
| `local:qwen3:8b`                                                                   | 23/27 | 85%  | 34.2 s         |
| `local:qwen3:8b`, schema-constrained                                               | 21/27 | 78%  | 25.3 s         |
| `local:qwen3:14b`, schema-constrained                                              | 25/27 | 93%  | 53.2 s         |
| `local:qwen3:14b`, thinking off                                                    | 22/27 | 81%  | 9.4 s          |
| `local:qwen3:14b`, step thinking, compact search                                   | 25/27 | 93%  | 32.3 s         |
| `local:qwen3:30b-a3b` (Thinking-2507)                                              | 25/27 | 93%  | 18.4 s         |
| `local:qwen3:30b-a3b-instruct-2507`, two runs                                      | 24/27 | 89%  | 4.6 s, 3.3 s   |
| `qwen3:30b-a3b` deciding, `qwen3:30b-a3b-instruct-2507` as `answerModel`, two runs | 27/27 | 100% | 15.1 s, 12.2 s |
| `local:gpt-oss:120b` (116.8B, 5.1B active, MXFP4, 65.4 GB), alone                  | 26/27 | 96%  | 13.9 s         |

- The schema-constrained run is what is built. Before the fix, every object generation on the local model (topic votes) failed validation on invented keys; with constrained output those failures are gone.
- `qwen3:8b` fails in both runs: the write–confirm–read-back case, the exact-note direct create, and the private note at admin and trusted (wrong `system_create` `source.kind`). Agent recommendation without a match and skill derivation fail in one run each.
- `qwen3:8b` copies pasted text into `system_create` arguments instead of using `source.kind: user-message`, although the tool's descriptions ask for it; the tool contract stays strict.
- `qwen3:14b` (14.8B, Q4_K_M) uses `user-message` and passes those cases. It fails the write–confirm–read-back case (no pending confirmation was created) and the private note at trusted (the reply claims a save the server refused).
- With `reasoningEffort: none` (thinking off) `qwen3:14b` is 5.7× faster and loses three cases: it does not clearly decline a delete at public and trusted, and the admin private-note `system_create` is refused.
- The instruct model fails the same three cases in both runs: it declines to delete a note it assumes is missing without calling the tool, and at public it misstates why it cannot update a link or save a note. The thinking model gets those decisions right; with it choosing tools and the instruct model writing, every case passes.
- Step thinking, compact search and the answer model change behavior only for `local:` models.

Proof-of-concept chat turns, 2026-11-05, on the separate brain holding the yeehaa rover's 221 public entities, Z13 iGPU, Ollama 0.40.13 Vulkan with flash attention: three known searches and one listing, each answered correctly. Warm turns; the first turn after a model switch or a background burst processes the whole prompt again (30–36 s).

| Configuration                                                 | Turn     |
| ------------------------------------------------------------- | -------- |
| `qwen3:14b`, background derivations off                       | 58–111 s |
| + step thinking                                               | 25–76 s  |
| + compact search                                              | 33–58 s  |
| `qwen3:30b-a3b` (Thinking-2507)                               | 22–65 s  |
| `qwen3:30b-a3b-instruct-2507`                                 | 3–6 s    |
| `qwen3:30b-a3b` + `answerModel` instruct-2507, derivations on | 12–16 s  |

- A turn's cost is generation, not the prompt: Ollama reuses the cached system prompt (17–29 new tokens per first call). On 14B, thinking was 1,100–1,400 tokens per turn at ~20 tokens/s and the search results 6–10k tokens at ~240 tokens/s; the MoE generates at ~55–60 tokens/s with 3B parameters active.
- Flash attention and a q8 KV cache made no measurable difference on Vulkan. ROCm (`gfx1151`) processes prompts 19–44% faster and generates ~10% slower, so Vulkan stays.
- With derivations on, the brain is ready 50 s after a clean start; the first boot's derivation backlog then runs about 8.5 minutes, during which chat turns take 43–181 s.
- The proof of concept runs `model: local:qwen3:30b-a3b` and `answerModel: local:qwen3:30b-a3b-instruct-2507-q4_K_M` (each 30.5B total, 3B active, Q4_K_M, 18.6 GB; both fit the Z13 together) with `embeddingModel: local:embeddinggemma-2:270m`. The largest core model is 30.5B, within the 32B cap. No production brain switches its text model on these numbers.

Agent evals, 2026-11-05 to 2026-11-06, personal suite (33 runs: uploads, long-note edits, verbatim saves), judge `gpt-5.4-mini`, same runtime:

| Model                                                                        | Pass  | Rate | Avg duration |
| ---------------------------------------------------------------------------- | ----- | ---- | ------------ |
| `gpt-6-luna` (default)                                                       | 33/33 | 100% | 7.6 s        |
| `qwen3:30b-a3b` deciding, `qwen3:30b-a3b-instruct-2507` as `answerModel`     | 8/33  | 24%  | 76.3 s       |
| the same, uploads as text and tools handed back to the deciding model        | 7/33  | 21%  | 130.5 s      |
| + invalid tool calls repaired by the answer model, output constrained        | 17/33 | 52%  | 56.4 s       |
| + repaired by the deciding model instead                                     | 17/33 | 52%  | 60.8 s       |
| `local:gpt-oss:120b` alone, with the repair                                  | 14/33 | 42%  | 56.5 s       |
| Qwen pair, with the flat upload source and kind-free update operation (#841) | 19/33 | 58%  | 47.4 s       |

- In the first run, 11 failures were the runtime refusing the request: Ollama's chat API takes no PDF parts and the Qwen3 models read no images. Uploads now reach a local model as text: a PDF as its extracted text, any other file as its name and type.
- After any tool result, the answer model took every later step and made the retries; a tool it calls now hands the next step back to `model`. `system_get` asks for a fresh read whenever the user asks to read.
- Both models misshape nested arguments: upload saves write `source: { kind: "upload", id }` for `source.upload: { kind, id }`, and edits omit `operation.kind`; retrying against the validation error, they looped up to ten times. A local model's call that fails validation is now generated again with the tool's input schema constraining the output, and the loops are gone.
- Constrained, the answer model repaired an exact edit as a source replacement with an invented message id in every probe (3 of 3) and in the eval; the deciding model, reasoning as when it chooses tools, kept the edit (3 of 3, 11–15 s). The repair runs on `model`.
- What fails now is the models' own choices: 4 long-note edits patch without the read the user asked for; 3 verbatim and long-note updates pick a different operation; 4 image cases need a model that sees images; 2 multi-file saves never call `system_create`; 3 others choose the wrong entity type or save when they should only answer.
- `gpt-oss:120b`, four times the size, makes the same first attempts: upload saves write `source: { kind: "upload", id }` and edits omit `operation.kind`. Its repairs return no output inside an agent conversation ("the model did not return a response") while the same repair outside one returns the right arguments (4 of 4, 8–23 s); the cause is not found, and no request reached the 32,768-token context. On the headless suite it matches the cloud model alone, at 37 tokens/s and 64.4 GB resident.
- With #841's shapes (`source: { kind: "upload", id, transform }`, an operation named by its one field) no call fails validation. What fails is choice: 6 edits skip the read the user asked for, 4 image cases need a model that sees images, 2 multi-file saves never call `system_create`, and 2 pick a different operation or transform.

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

- **One selection scheme for every capability.** `brain.yaml` takes `model`, `answerModel`, `embeddingModel` and `imageModel`, each a `provider:model` string resolved by `provider-selection.ts`. Explicit prefixes are kept end to end. An unknown provider is a config error, never a silent fallback to Anthropic.
- **OpenAI stays the default and the fallback.** `embeddingModel` defaults to `openai:text-embedding-3-small`; `local:` models are opt-in per brain. Switching back is a config change.
- **Embedding fallback is a config switch, not request failover.** Vectors from different models live in different spaces, so a query can only be embedded by the model that built the index. Changing `embeddingModel` rebuilds the index.
- **Supported embedding models are profiles.** A profile in `ai-service` holds dimensions, input limit, request limits and query/document templates; config rejects an embedding model without a profile. Adding a model means adding a profile and its tests.
- **The runtime contract is the OpenAI-compatible HTTP API** (`/v1/embeddings`, `/v1/chat/completions`, `/v1/images/generations`) at one base URL, `modelRuntime.url` in `brain.yaml`. The brain talks to it with `@ai-sdk/openai-compatible`; the brain never knows which server sits behind the URL.
- **The first runtime is Ollama**, which serves embeddings and chat over that contract. Image generation adds a backend behind the same URL in Phase 5; the brain side does not change.
- **Model identity is stored with the index.** The embedding DB records model, dimensions and prompt revision; any change drops and rebuilds, and the readiness gate holds chat until the index is ready.
- **Text models come from outside the frontier families.** The Mozilla form names GPT, Claude, Gemini/DeepMind and Llama as frontier families, and the call rejects slimmed-down frontier models. Text candidates are open-weight models from other labs (Qwen, Mistral, OLMo).
- **The proof of concept embeds outside the frontier families when it can.** The call rejects slimmed-down frontier models, and EmbeddingGemma 2 is a 270M model from Google DeepMind's Gemma family. `nomic-embed-text` runs the same benchmark; if its MRR is within 0.02 of EmbeddingGemma 2's, it is the proof-of-concept embedder, so no core model comes from a frontier family. Otherwise EmbeddingGemma 2 stays and the application shows the embedder is replaceable by config.
- **A local brain may split choosing from writing.** `answerModel` is an optional `local:` model that writes while `model` chooses tools: it answers each tool result and runs text and object generation, which choose no tools. It exists because a fast local model writes well but chooses badly at refusal and permission edges, and a reasoning model chooses well but writes slowly; the pair passes the headless suite 27/27 at 12–15 s per case, against 25/27 at 18 s for the reasoning model alone and 24/27 at 3–5 s for the fast one. Code-based tool selection does not replace it: offering the fast model only the tools nearest each message (17 → 9) scored 23/27, because its failures are judgment, not choice among too many tools. `answerModel` is rejected unless it is `local:`, and a brain without it behaves as before.
- **Small means 7–32B.** The text model is the smallest one whose evals the team accepts for the proof of concept, capped at 32B. Its parameter count is what the application reports.
- **The proof of concept runs on owned hardware.** The host is the ASUS ROG Flow Z13 with 128 GB of unified memory (AMD Ryzen AI Max+ 395, Radeon 8060S), which fits every candidate up to 32B. The i7-1355U laptop (16 GB, no discrete GPU) is the minimum-hardware check for the smallest candidate. The fleet's server type is measured only for the fleet rollout after the deadline.
- **Cloud models stay in the eval harness.** The eval judge runs at development time and is not part of a brain's core loop.

## Phase 0 — Remaining measurement

By 2026-11-06, on the Z13 unless stated; numbers go in Status.

1. Run the proof-of-concept configuration's smallest viable variant on the i7 laptop (16 GB): the two MoE models need ~37 GB, so the laptop runs `qwen3:8b` or `qwen3:14b` alone; record its average turn duration.

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
