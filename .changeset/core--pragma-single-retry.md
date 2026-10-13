---
"@rizom/brain": patch
---

Connection pragmas refused by a held lock are retried once, by the local client, instead of again on top of it; a locked database delayed startup by two retry budgets.
