---
"@rizom/brain": patch
---

Guest chat is quieter and more honest.

- A guest lookup that finds nothing now tells the model that nothing public matches. Before, every failed lookup read as "Public retrieval unavailable", so the model told visitors that retrieval was down.
- A lookup past the turn's limit, or with an oversized result, now says so, so the model can answer with what it found.
- The homepage atlas scrolls a docked conversation only with its text column, with a thin themed scrollbar; the answer area no longer has a scrollbar of its own.
- The box drops "You can draft while you wait."
- The recording notice now reads "Questions are kept for the site owner for N days, even if you delete this chat."
