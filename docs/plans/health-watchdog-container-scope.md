# Plan: Scope the host health watchdog to Brain containers

## Status

Implemented and validated through package, scaffold, runtime-image, and local Docker isolation checks. A remote generated-deployment smoke remains pending. The host watchdog was shipped and restart-budgeted, but its Docker query selected every unhealthy container with any `service` label. Kamal's generic `service` label is not a Brain ownership marker.

## Problem

`brains-health-watchdog` is installed as one host-level systemd timer. Every run executes the equivalent of:

```bash
docker ps --filter health=unhealthy --filter label=service
```

On a shared Docker host, an unrelated Kamal or service-labelled workload can therefore be inspected, logged, restart-budgeted, and restarted by Brain deployment automation. The unit description and deployment documentation claim Brain-container recovery, but selection is broader than that ownership boundary.

The restart budget does not make the selection safe: it merely limits how often the unrelated container is restarted. Incident logs and state files are also created for that unrelated service.

## Goal

Make host recovery act only on containers explicitly identifying themselves as Brain workloads while preserving:

- Docker health as the liveness signal;
- diagnostics-before-restart;
- the existing three-per-hour per-container restart budget;
- one global systemd timer per host;
- support for multiple Brain containers/services on one host; and
- generated standalone and fleet deployment paths.

## Architecture decisions

### 1. Use a dedicated immutable ownership label

Add a reverse-DNS Docker image label to the shared runtime image:

```dockerfile
LABEL ai.rizom.brain.watchdog="true"
```

Containers created from the standalone and fleet stages inherit this label. The watchdog query requires the exact value:

```bash
docker ps \
  --filter health=unhealthy \
  --filter label=ai.rizom.brain.watchdog=true
```

Do not filter by a service-name prefix, image repository, container name, or the existence of Kamal's generic `service` label. Those values are deployment-specific and can collide. An explicit label also supports multiple differently named Brain services on one host.

The key/value is a deployment contract and should be exported as one shared constant for tests/template generation where practical. It is not an operator configuration option.

### 2. Preserve per-container state identity

Continue deriving restart-budget state from inspected service/container identity so multiple Brain containers receive independent budgets. Append the immutable Docker container ID as a disambiguating suffix so empty fields, ambiguous concatenation, or sanitized service/name collisions cannot merge budgets. The ownership label decides eligibility only; it does not replace the state key.

If service inspection is empty, the watchdog still operates on an explicitly labelled Brain container using its container name and ID.

### 3. Keep the image and script sources canonical

`shared/deploy-support/src/Dockerfile` and `shared/deploy-support/src/deploy-scripts/install-health-watchdog.ts` are the canonical sources. The CLI and ops package copy deploy scripts/templates during their builds.

Implementation must regenerate and verify:

- `packages/brain-cli/templates/deploy/scripts/install-health-watchdog.ts`;
- `packages/brains-ops/templates/rover-pilot/deploy/scripts/install-health-watchdog.ts`; and
- any packed Dockerfile/template snapshots derived from deploy-support.

Do not hand-maintain different selectors for standalone and fleet deployment.

### 4. Roll out in deployment order

Generated workflows run `kamal setup --skip-push` before installing the watchdog. Preserve and test that order:

1. deploy the image containing the ownership label;
2. install/update the stricter host watchdog; and
3. verify the running container is visible to the exact-label query.

This avoids replacing the watchdog before the target container carries the label. Existing generated repositories must first be reconciled with the updated `brain init --deploy` or `brains-ops init` path, then deployed normally; redeploying an unchanged old Dockerfile cannot add an image label. The generated-Dockerfile stale detector must recognize the previously unlabelled runtime so reconciliation updates it. No second migration daemon is required.

The installer should run a non-fatal post-install diagnostic that reports when zero labelled Brain containers are present. It must not broaden the filter as a fallback. A missing label is a deployment/configuration defect, not permission to restart arbitrary service containers.

### 5. Test selection behavior, not only script text

Extend the fake Docker harness to return at least:

- one unhealthy container with the exact Brain label;
- one unhealthy container with only `service=...`;
- one healthy Brain-labelled container; and
- optionally one Brain-labelled container with a different/non-true value.

Only the unhealthy exact-labelled Brain container may be inspected for diagnostics, assigned restart state, or restarted. Tests must assert negative behavior for unrelated containers, not merely check that the new filter string exists.

### 6. Keep liveness and operational health separate

The ownership correction does not change which endpoint drives Docker health. Docker and the host watchdog continue to act on `/health/live`; worker/queue/projection degradation remains visible through `/health/operate` and does not trigger container restart.

## Implementation phases

### Phase 0 — Characterize the unsafe scope

1. Extend the watchdog test harness so `docker ps` models several labelled and unlabelled containers.
2. Add a failing test proving a generic unhealthy `service` container is currently eligible.
3. Pin diagnostics-before-restart, restart budget, locking, and per-container state behavior.
4. Pin workflow ordering: Kamal setup precedes watchdog installation in standalone and fleet scaffolds.

Gate:

- The test fails because of container selection, not because the fake omits unrelated script behavior.
- Existing recovery semantics remain characterized.

### Phase 1 — Add and consume the ownership label

1. Add `ai.rizom.brain.watchdog=true` to the shared runtime Dockerfile.
2. Change the Docker query to require the exact ownership label and unhealthy health state.
3. Keep generic service/name inspection only for diagnostics and state identity.
4. Ensure an eligible Brain container without a service label still receives a unique safe state key.
5. Add the zero-match post-install diagnostic without falling back to generic selection.

Gate:

- Only exact-labelled unhealthy Brain containers restart.
- Unrelated Kamal containers are untouched even after repeated timer runs.
- Multiple Brain services receive independent restart budgets.

### Phase 2 — Propagate generated deployment artifacts

1. Run the canonical deploy-support copy/build path for `@rizom/brain` and `@rizom/ops`.
2. Verify generated scripts exactly match the canonical watchdog source.
3. Verify standalone and fleet Docker builds inherit the label in final runtime containers.
4. Reconcile the previously generated unlabelled Dockerfile instead of treating it as current.
5. Add package metadata/scaffold tests so future generation cannot drop the label or selector.
6. Update the deployment guide to name the ownership label and shared-host safety behavior.

Gate:

- Freshly scaffolded standalone and fleet deployments contain the same exact selector.
- Packed artifacts include the labelled Dockerfile and scoped installer.

### Phase 3 — Deployment smoke

1. Build the real deploy image.
2. Start an unhealthy Brain-labelled container and an unhealthy unrelated service-labelled container on one test host or isolated Docker environment.
3. Run the generated watchdog script repeatedly.
4. Verify Brain diagnostics and restart-budget state, and verify zero restart/log/state effects for the unrelated container.
5. Verify `/health/operate` degradation alone does not make the Docker container unhealthy.

Gate:

- The host smoke demonstrates both positive recovery and negative isolation.
- The generated deployment flow installs the watchdog only after the labelled container is deployed.

## Validation matrix

- unhealthy exact-labelled Brain container;
- healthy exact-labelled Brain container;
- unhealthy generic Kamal/service container;
- unhealthy container with label value `false` or another value;
- multiple Brain service/container names;
- empty service label with valid Brain ownership label;
- state-key sanitization collisions;
- restart budget exhaustion and window expiry;
- diagnostic capture failure;
- no matching Brain containers after installation;
- standalone scaffold and packed CLI;
- fleet scaffold and packed ops package;
- real Docker image label inspection.

## Non-goals

- Restarting non-Brain services.
- Moving health supervision into a second container.
- Changing liveness/readiness/operational endpoint semantics.
- Adding operator-configurable label names.
- Replacing systemd, Docker health checks, or the existing restart budget.
- Discovering Brain containers from image names or deployment directories.

## Risks and mitigations

- **Existing containers lack the label.** Reconcile generated Dockerfiles, preserve deploy-before-install ordering, and report zero matches; do not use an unsafe fallback.
- **Generated copies drift.** Treat deploy-support as canonical and verify copied templates in package tests.
- **Kamal overrides image labels.** Confirm the final running container with `docker inspect` in smoke tests; add a deploy-level label only if inheritance is disproven.
- **A malicious/unrelated image copies the label.** The label expresses opt-in ownership, not authentication. Host root/Docker access is already trusted; exact scoping prevents accidental generic selection.
- **Multiple Brain containers share a restart budget.** Keep container identity in the state key and add collision coverage.
- **The watchdog starts acting on operational degradation.** Keep Docker health tied to `/health/live` and test the separation.

## Acceptance criteria

1. The watchdog selects only unhealthy containers with `ai.rizom.brain.watchdog=true`.
2. An unrelated unhealthy `service`-labelled container is never inspected, logged, state-tracked, or restarted.
3. Standalone and fleet images inherit the ownership label.
4. Multiple Brain containers retain independent restart budgets.
5. Existing diagnostics-before-restart and three-per-hour behavior remain intact.
6. Generated CLI and ops deployment artifacts cannot drift from the canonical source.
7. Deployment order prevents a stricter watcher from being installed before the labelled container exists.
