---
"@rizom/brain": minor
---

Each AI capability now uses its own provider's key: `brain.yaml` gains `embeddingModel` and `imageModel` next to `model`, and keys come from `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`. `brain init` asks for one key per provider, so an all-OpenAI brain still needs only one. `AI_API_KEY` and `AI_IMAGE_KEY` keep working for any provider key left unset. Embeddings are OpenAI-only: `brain init`, `brain start` and the embedding provider accept only a key in an OpenAI format for them.
