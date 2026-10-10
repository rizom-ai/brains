---
"@brains/a2a": patch
---

Being asked over A2A is bounded. Public callers answer under a daily allowance kept in runtime state (`a2a.publicAsks`): questions and answer tokens per caller domain and for all public callers together, with `enabled` as the switch that stops answering public questions at all. Unsigned callers share one anonymous allowance and trusted callers are not counted. A caller over its allowance gets a failed task that says why, and the network-ask channel treats any peer task that did not complete as no answer.
