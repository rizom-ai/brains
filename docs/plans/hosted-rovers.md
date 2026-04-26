# Plan: Hosted Rovers on Kubernetes

## Goal

Run many hosted rovers using Kubernetes rather than a custom in-process cluster/orchestration layer.

## Open work

### 1. Stand up the base cluster platform

Needed infrastructure:

- Hetzner Kubernetes cluster
- ingress controller
- cert-manager
- wildcard DNS for rover subdomains
- namespace / RBAC model for rover workloads

### 2. Run Ranger on the cluster

Ranger needs to run as the always-on control plane for hosted rovers.

Responsibilities include:

- onboarding and provisioning decisions
- shared gateway/interface responsibilities
- control-plane APIs for rover lifecycle actions

### 3. Build the rover provisioner

Ranger needs a provisioner plugin or equivalent control-plane component that can create and manage per-rover resources.

Per-rover resources include:

- config
- secrets
- deployment / pod lifecycle
- service / ingress routing
- database wiring

### 4. Define the wake/sleep model

Hosted rovers need a clear scale-to-zero story.

Open decisions/work:

- how idleness is detected
- how rover activity updates last-activity state
- how a scaled-to-zero rover wakes on demand
- what user-facing wake latency is acceptable

### 5. Verify end-to-end routing

The hosted path is only real when all of this works together:

- user reaches Ranger
- Ranger routes or provisions correctly
- rover becomes reachable at its assigned subdomain
- Rover and Ranger can communicate over the expected control/data paths

### 6. Prove operational viability

Before treating this as the production destination, validate:

- resource footprint per rover
- safe concurrency assumptions per node
- cold-start behavior
- cost at realistic user counts
- failure and recovery behavior

## Non-goals

- reviving a custom `Bun.spawn()`-based cluster manager
- premature platform complexity beyond what the first hosted cohort needs
- treating Kubernetes as mandatory for self-hosted standalone brains

## Dependencies

- `docs/plans/rover-pilot.md`
- current published-package / standalone app repo deploy contract
- `docs/plans/monetization.md`

## Done when

1. Ranger can provision and manage rover workloads on Kubernetes
2. hosted rovers are reachable via managed subdomains
3. wake/sleep behavior is acceptable for real users
4. operational cost and reliability are understood well enough to offer hosted rovers confidently
