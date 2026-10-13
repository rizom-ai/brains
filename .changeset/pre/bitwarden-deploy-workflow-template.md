---
"@rizom/brain": patch
---

Update generated deploy workflows to run the current Varlock CLI, support Bitwarden-backed schemas with only `BWS_ACCESS_TOKEN` in GitHub Actions secrets, keep `.env.schema` tracked by default, retry Varlock resolution, mask resolved secrets before exporting them to `$GITHUB_ENV`, preserve multiline values, and release stale Kamal deploy locks before deploy.
