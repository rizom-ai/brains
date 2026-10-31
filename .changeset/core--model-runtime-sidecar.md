---
"@rizom/brain": patch
"@rizom/ops": patch
"@brains/deploy-support": patch
"@brains/app": patch
---

A brain opts into a local model runtime by naming a `local:` model in `brain.yaml`; every other brain deploys as before. For such a brain, the generated Kamal deploy pulls its local models into `/opt/brain-models` before Kamal starts it, runs a `models` accessory (`ollama/ollama:0.40.11`) beside it, and passes `MODEL_RUNTIME_URL`, which the brain uses when `brain.yaml` sets no `modelRuntime.url`. Fleet users opt in with `embeddingModel` in the registry. Deploy configs generated before the accessory are reconciled on rerun.
