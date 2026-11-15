---
"@rizom/brain": minor
"@rizom/ops": minor
---

Each AI provider now reads its own key: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`. `AI_API_KEY` and `AI_IMAGE_KEY` are no longer read. Rename them to the variable of the provider your models use; the default chat, image and embedding models are OpenAI's, so for most brains `AI_API_KEY` becomes `OPENAI_API_KEY`. A brain with only the old names stops at `brain start`, naming the variable it needs.

`brain start` checks every model in `brain.yaml` before boot and names each missing key; a missing image key only turns image generation off. A key only ever reaches its own provider. `brain init` asks for one key per distinct provider and takes `--openai-api-key`, `--anthropic-api-key`, `--google-api-key`, `--model` and `--image-model` in place of `--ai-api-key`.

Pilot repos: before deploying this version, run `brains-ops migrate:provider-keys <repo>`, then `brains-ops init <repo>`. `pilot.yaml` takes `openaiApiKey` (overrides: `openaiApiKeyOverride`), and deploys pass `OPENAI_API_KEY`.
