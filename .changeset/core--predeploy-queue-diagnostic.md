---
"@rizom/ops": patch
"@rizom/brain": patch
---

Pre-deploy snapshot refusals now name the observed pending, processing and abandoned job counts and advise rerunning once the queue drains. Missing totals display `?`. Readiness decisions, abandoned-lease handling and snapshot behavior are unchanged. Both generated-project script copies stay synchronized with the canonical implementation; this change does not run or enable a deployment or operational snapshot.
