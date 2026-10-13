---
"@rizom/brain": minor
---

The default text model is now `gpt-6-luna` at low reasoning, replacing `gpt-5.6-luna`. On the canonical eval suites it passes at the same rate (98.7% against 98.8%) at about half the cost. Guest chat prices GPT-6 Luna turns at its published rates, so guest costs stay known after the switch; a turn answered from the FAQ without a model call is labelled `no-model-call`. Instances that set `model` keep their model.
