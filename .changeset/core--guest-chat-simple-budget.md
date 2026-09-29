---
"@rizom/brain": patch
---

Guest chat's budget works simply. A question is admitted while guest chat is on and the month's spend is under the owner's budget; nothing is reserved up front. Each answer runs within fixed limits (prompt size, answer length, model steps, searches) that hold it to about two cents, and when it finishes its measured cost is added to the month, or $0.05 when the provider reports no usage. The per-call cost quotes that refused real answers are gone from `GuestTurnBudget` (its accounting now only prices a settled turn), and changing the configured limits no longer locks out sessions or the owner's approval. The Studio budget starts at $0.05.
