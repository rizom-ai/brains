---
"@rizom/brain": patch
---

Keep SQLite pragma setup within one contention retry policy. Managed local clients retain their configured statement budget, including an explicit zero budget, instead of receiving a second outer retry window. Unmanaged pragma clients retain the helper's bounded retries; remote clients and statements inside admitted transactions are unchanged.

Add real-SQLite coverage for a held lock, exact refusal attempts, and connection recovery after release.
