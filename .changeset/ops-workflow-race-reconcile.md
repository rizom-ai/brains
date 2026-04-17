---
"@rizom/ops": patch
---

Fix the rover-pilot generated deploy and reconcile workflows so generated config commits rebase onto the latest branch tip before pushing, and let `brains-ops init` reconcile the older direct-push workflow shape on rerun.
