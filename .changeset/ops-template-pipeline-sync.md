---
"@rizom/ops": patch
---

Sync the rover-pilot scaffold templates to the running pipeline design: build.yml resolves the declared image set from the registry and matrix-builds missing images (replacing the batched resolve-build-config design, which leaked every same-version site override into one shared image), deploy.yml waits long enough for a concurrent build and drops the per-step shared-secret plumbing in favor of varlock, and the deploy scripts derive tags through the shared @rizom/ops helpers. Remaining drift in six templated scripts (update-dns, decrypt-user-secrets, resolve-deploy-handles, sync-content-repo, provision-server, validate-secrets) is bidirectional and tracked as a follow-up.
