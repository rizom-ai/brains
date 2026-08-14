---
"@rizom/brain": patch
"@rizom/ops": patch
---

Pin the canonical deploy image to Bun 1.3.14. Deployed images took the Dockerfile default because the fleet build passes only `BRAIN_VERSION` and `SITE_PACKAGES`, so they were running 1.3.10 rather than the version the Git broker's acceptance matrix covers. 1.3.14 is the newest release that still carries the lost-completion defect, which the broker removes independently of the runtime, so the shipped image is now a runtime that matrix actually proves.
