---
"@brains/ai-evaluation": minor
---

Evaluate a model by pass rate over independent runs. `--samples <n>` (or `samples:` in brain.eval.yaml) runs each model's suite n times, each in a fresh environment, and the model comparison reports passes out of runs per test. `--min-pass-rate <r>` sets the share of a test's runs that must pass; the default of 1 keeps single-run behaviour unchanged. Sampling requires the `models:` path.
