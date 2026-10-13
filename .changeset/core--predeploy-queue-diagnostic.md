---
"@brains/deploy-support": patch
"@rizom/ops": patch
"@rizom/brain": patch
---

The pre-deploy snapshot's refusal "job queue is not idle" now names the queue it saw (pending, processing and abandoned counts) and says to rerun once it drains, so a deploy that stops on a busy brain explains itself in the workflow log.
