# Plan: Hosted Rovers on Kubernetes

## Context

The original hosted-rovers plan used a custom "Cluster" service with `Bun.spawn()` to manage rover child processes. This required building custom process lifecycle management, health checks, port allocation, cgroup limits, multi-host orchestration, and on-demand spawning — all problems Kubernetes already solves.

This updated plan replaces the Cluster service entirely with Kubernetes, keeping everything else: Ranger's role, Turso databases, brain.yaml config model, shared Discord gateway, A2A communication, and the existing Docker image.

## Architecture

```
*.rover.rizom.ai (wildcard DNS)
        |
  Ingress-NGINX (LoadBalancer, TLS via cert-manager)
    /          |          \
rover-alice  rover-bob  rover-carol   (0-N Pods, scale-to-zero)
    |          |          |
  Turso      Turso      Turso         (per-rover remote DB)

Ranger Pod (always-on)
  - Discord gateway
  - A2A server
  - rover-provisioner plugin → K8s API
```

### What K8s replaces

| Original plan               | K8s equivalent                |
| --------------------------- | ----------------------------- |
| Cluster service (Bun.spawn) | Deployment (replicas: 0/1)    |
| Port allocation             | Service + Ingress             |
| Health checks + restart     | livenessProbe + restartPolicy |
| cgroup resource limits      | resources.limits              |
| Multi-host orchestration    | Node pool autoscaling         |
| On-demand spawning          | Scale 0→1 via K8s API         |
| Custom process monitor      | K8s controller                |

### What stays the same

- Ranger handles onboarding, Discord gateway, provisioning decisions
- Turso for per-rover databases (DATABASE_URL in env)
- brain.yaml + env var configuration (mounted as ConfigMap + Secret)
- A2A communication between Ranger and rovers
- The Docker image (`Dockerfile.model` with built-in Caddy)

## Per-Rover K8s Resources

Ranger creates 4 resources per rover via K8s API:

1. **ConfigMap** — contains brain.yaml (preset, domain, database URL, plugin config)
2. **Secret** — env vars (API keys, tokens, database auth)
3. **Deployment** — single-replica Pod with resource limits (256Mi request, 512Mi limit)
4. **Ingress** — routes `{name}.rover.rizom.ai` to the Pod's ports (8080 web, 3334 A2A, 3333 MCP)

Service is created alongside the Deployment for internal DNS: `rover-{name}.rovers.svc.cluster.local`.

No changes needed to brain-resolver or instance-overrides — ConfigMap mounts brain.yaml at `/app/brain.yaml`, Secret provides env vars, existing `${VAR}` interpolation works.

## Ranger's Provisioner Plugin

New IntegrationPlugin: `plugins/rover-provisioner/`

### K8s API access

Uses `@kubernetes/client-node` with in-cluster ServiceAccount auth. Ranger's Pod gets RBAC scoped to the `rovers` namespace (Deployments, Services, ConfigMaps, Secrets, Ingresses).

### Tools

| Tool                | Description                                   |
| ------------------- | --------------------------------------------- |
| `rover_provision`   | Create Turso DB + GitHub repo + K8s resources |
| `rover_deprovision` | Delete rover and all resources                |
| `rover_list`        | List rovers with status                       |
| `rover_status`      | Health check for specific rover               |
| `rover_wake`        | Scale 0→1                                     |
| `rover_sleep`       | Scale 1→0                                     |

### Provisioning flow

1. User says "I want a rover" in Discord
2. Ranger creates Turso DB, GitHub content repo
3. Ranger creates ConfigMap + Secret + Deployment + Ingress via K8s API
4. Wildcard DNS already resolves — no DNS step needed
5. cert-manager provisions TLS cert automatically
6. Pod starts (~10-15s cold start, image cached on node)
7. Ranger confirms with URL: `https://alice.rover.rizom.ai`

## Scale-to-Zero

Simple approach — no KEDA, no Knative:

**Idle detection**: Provisioner daemon checks every 5 minutes. Each rover Deployment has a `last-activity` annotation. If idle > 30 minutes, patch `replicas: 0`.

**Wake-on-demand**: Ingress NGINX returns 503 when rover Pod is scaled to zero. Custom error page calls Ranger's wake endpoint, which patches `replicas: 1` and returns an auto-refresh page. Pod starts in ~10-15s.

Activity tracking: Ranger updates the annotation when routing Discord messages via A2A. For direct MCP/A2A access, a lightweight middleware in the brain could update it, or Ranger periodically pings.

## DNS + TLS

- **Wildcard DNS**: `*.rover.rizom.ai` A record → Ingress LoadBalancer IP (set once)
- **TLS**: cert-manager with Let's Encrypt, per-Ingress certs (individual up to ~50 rovers, wildcard cert via DNS-01 challenge beyond that)
- **No per-rover DNS changes** — wildcard handles everything

## Cluster Setup

Hetzner K8s (free managed control plane):

| Node pool | Spec                                | Purpose                            |
| --------- | ----------------------------------- | ---------------------------------- |
| system    | 1x CX22 (2 vCPU, 4GB)               | Ingress, cert-manager, kube-system |
| ranger    | 1x CX22 (2 vCPU, 4GB)               | Ranger Pod (always-on)             |
| rovers    | 1-5x CX22 (2 vCPU, 4GB), autoscaled | Rover Pods                         |

Each CX22 hosts ~6-8 active rovers at 512MB limit. With scale-to-zero, most rovers use 0 resources.

## Cost

| Scale     | Concurrent | Nodes          | Turso        | Total   |
| --------- | ---------- | -------------- | ------------ | ------- |
| 10 users  | 5          | 3x CX22 (~€18) | Free         | ~€24/mo |
| 50 users  | 10         | 3x CX22 (~€18) | Free         | ~€24/mo |
| 200 users | 20         | 4x CX22 (~€24) | Free         | ~€30/mo |
| 500 users | 50         | 6x CX22 (~€36) | Scaler (€29) | ~€71/mo |

~2-3x more than bare child processes, but eliminates ~2000 lines of custom orchestration code.

## Implementation Phases

### Phase 1: Cluster infrastructure

- Hetzner K8s cluster via Terraform
- Ingress-NGINX + cert-manager (Helm)
- Wildcard DNS for `*.rover.rizom.ai`
- `rovers` namespace + shared secrets + RBAC

### Phase 2: Migrate Ranger to K8s

- Ranger Deployment/Service/Ingress
- Verify identical behavior to current Docker Compose

### Phase 3: Provisioner plugin

- `plugins/rover-provisioner/` — K8s client, templates, Turso client, tools
- Test: provision a rover via MCP, verify it starts and responds

### Phase 4: Scale-to-zero + wake

- Idle detection daemon in provisioner
- Wake endpoint in Ranger
- NGINX custom error page for 503

### Phase 5: Discord routing

- Rover user mapping in Ranger
- Message forwarding via A2A (Ranger → rover)
- End-to-end: Discord → Ranger → rover → response → Discord

## Files

| File                             | Action                                                      |
| -------------------------------- | ----------------------------------------------------------- |
| `plugins/rover-provisioner/src/` | New plugin: K8s client, templates, Turso client, tools      |
| `brains/ranger/src/index.ts`     | Register rover-provisioner plugin                           |
| `deploy/k8s/`                    | New: Terraform for Hetzner K8s, Helm values, base manifests |
| `deploy/docker/Dockerfile.model` | Already includes /health via Caddy → 8080 proxy             |
| `docs/plans/hosted-rovers.md`    | Update with K8s architecture                                |
