---
"@rizom/ops": patch
---

Add `resolveImageBuilds` and `runResolveMissingImages` (also on the `/deploy` entry): the Build workflow's resolve step as ops logic — derive the declared image set from the pilot registry, probe the container registry per tag, and emit the missing ones as a GitHub Actions build matrix, with dispatch inputs forcing a single explicit build. rover-pilot's build.yml becomes a thin caller.
