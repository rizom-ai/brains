---
"@rizom/brain": patch
---

Fix saved-agent routing for documentation brains and follow-up requests. Exact saved agent ids such as `docs.rizom.ai` now route through A2A instead of local-memory or save-first fallbacks, A2A failures are surfaced directly rather than answered from local docs, and bare affirmative follow-ups after a save-first refusal correctly save the referenced agent.
