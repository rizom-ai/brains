---
"@rizom/brain": minor
---

`brain.yaml` takes `imageModel`, the model that generates images as `provider:model`. An `openai:` or `google:` model uses the provider's key; a `local:` model runs on the model runtime's OpenAI-compatible images API at `modelRuntime.url`, with no image provider key. A brain can generate images when its image model's provider is available, rather than whenever an OpenAI or Google key is set.
