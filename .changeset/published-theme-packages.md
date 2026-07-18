---
"@rizom/theme-default": patch
"@rizom/theme-rizom-ai": patch
"@rizom/brain": patch
"@brains/rover": patch
---

Themes become independently published npm packages, completing the
published-package model for brain.yaml: `@rizom/theme-default` (the editorial
base) and `@rizom/theme-rizom-ai` (the consolidated rizom.ai theme, depending
on the base so fixes flow via npm resolution) publish dist-only artifacts with
their CSS inlined. The brain entrypoint registers `@rizom/theme-default` and
keeps a `@brains/theme-default` alias for pre-rename brain.yaml files; hosted
deployments install `@rizom/*` theme refs next to the brain instead of
requiring themes to be bundled into a brain release.
