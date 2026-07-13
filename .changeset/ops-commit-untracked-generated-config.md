---
"@rizom/ops": patch
---

Fix new users being skipped by every deploy after onboarding. The reconcile and deploy workflows committed generated output via `git diff`, which is blind to untracked files — so a newly added user's generated `users/<handle>/` directory was silently dropped and never appeared in any commit range the deploy handle-resolver inspects. Both workflow templates now stage generated paths with `git add --intent-to-add` before the diff dance.
