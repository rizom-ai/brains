---
"@brains/ai-service": patch
---

Chat token usage now covers every model call of a turn — each tool-loop step and, for a guest, the screening judgment — instead of only the final answer's call. A turn that reads a note and then answers previously reported only the answer's tokens. Guest settlement already priced every step and is unchanged. Evaluation token budgets measured against the old figure undercount and are recalibrated separately.
