---
"@brains/dashboard": patch
---

Register configured dashboard theme styles before the HTTP route snapshot is finalized so rendered theme asset URLs remain servable.
