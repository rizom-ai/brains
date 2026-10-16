---
"@rizom/brain": patch
"@rizom/ops": patch
---

Harden deployed process ownership by draining aborted Git subprocesses, cancelling and awaiting active Git work during directory-sync shutdown, bounding initialization network probes, and running the packaged Brain entry point under `tini`.
