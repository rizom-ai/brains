---
"@brains/core": patch
"@brains/job-queue": patch
"@brains/plugins": patch
"@brains/topics": patch
"@rizom/brain": patch
---

Run background jobs with schema-configured bounded parallelism and honor the existing topic source-change batch delay before projection-wave admission, preventing parallel imports from causing repeated full-corpus topic extraction.
