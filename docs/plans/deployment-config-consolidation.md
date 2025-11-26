# Deployment Configuration Consolidation

## Problem Statement

Currently, deployment configuration is split between two files:

1. **`brain.config.ts`** - Runtime configuration (plugins, routes, themes, ports)
2. **`deploy.config.json`** - Build/deploy configuration (server size, docker settings, paths)

This causes:

- **Duplication**: name, ports defined in both places
- **Maintenance burden**: Two files to keep in sync
- **Wrong abstraction**: Some deployment concerns (ports) leak into runtime config
- **Limited extensibility**: Adding CDN/DNS per-app requires changes to both systems

## Goals

1. Single source of truth in `brain.config.ts`
2. Per-app control over CDN and DNS (not global env vars)
3. Deploy scripts extract config automatically (no manual steps)
4. Clean migration - no fallback complexity

## Decision: Refactor First, Then DNS

DNS without per-app config isn't useful (same global setting). The refactor is well-scoped and having the right config shape makes DNS implementation cleaner.

## Design Decisions

1. **Ports**: `deployment.ports` auto-configures WebserverInterface (no duplication)
2. **Credentials**: Validate at startup - fail fast if CDN/DNS enabled but `BUNNY_API_KEY` missing
3. **Domain**: Goes in `brain.config.ts` as `deployment.domain`
4. **Config extraction**: Deploy script runs `brain.config.ts --export-deploy-config` automatically

## Implementation Plan

### Phase 1: Extend AppConfig Schema

Add deployment configuration to `shell/app/src/types.ts`:

```typescript
const deploymentConfigSchema = z.object({
  // Server configuration
  provider: z.enum(["hetzner", "docker"]).default("hetzner"),
  serverSize: z.string().default("cx33"),
  location: z.string().default("fsn1"),

  // Domain
  domain: z.string().optional(),

  // Docker configuration
  docker: z
    .object({
      enabled: z.boolean().default(true),
      image: z.string().optional(), // defaults to app name
    })
    .default({}),

  // Port configuration (also used by WebserverInterface)
  ports: z
    .object({
      default: z.number().default(3333),
      preview: z.number().default(4321),
      production: z.number().default(8080),
    })
    .default({}),

  // CDN configuration
  cdn: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(["bunny", "none"]).default("none"),
    })
    .default({}),

  // DNS configuration
  dns: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(["bunny", "none"]).default("none"),
    })
    .default({}),

  // Paths (with sensible defaults based on app name)
  paths: z
    .object({
      install: z.string().optional(), // defaults to /opt/{app-name}
      data: z.string().optional(), // defaults to /opt/{app-name}/data
    })
    .default({}),
});
```

### Phase 2: Add `--export-deploy-config` Flag

Add to CLI in `shell/app/src/cli.ts`:

```typescript
if (args.includes("--export-deploy-config")) {
  const deployConfig = {
    name: config.name,
    version: config.version,
    ...config.deployment,
    paths: {
      install: config.deployment?.paths?.install ?? `/opt/${config.name}`,
      data: config.deployment?.paths?.data ?? `/opt/${config.name}/data`,
    },
    docker: {
      enabled: config.deployment?.docker?.enabled ?? true,
      image: config.deployment?.docker?.image ?? config.name,
    },
  };
  console.log(JSON.stringify(deployConfig, null, 2));
  process.exit(0);
}
```

### Phase 3: Add Credential Validation

In app startup (only when not exporting config):

```typescript
function validateDeploymentCredentials(config: AppConfig) {
  const { cdn, dns } = config.deployment ?? {};

  if (cdn?.enabled && cdn?.provider === "bunny") {
    if (!process.env.BUNNY_API_KEY) {
      throw new Error("CDN enabled with Bunny but BUNNY_API_KEY not set");
    }
  }

  if (dns?.enabled && dns?.provider === "bunny") {
    if (!process.env.BUNNY_API_KEY) {
      throw new Error("DNS enabled with Bunny but BUNNY_API_KEY not set");
    }
  }
}
```

### Phase 4: Auto-Configure WebserverInterface

WebserverInterface reads from deployment config if not explicitly set:

```typescript
const ports = config.deployment?.ports ?? {};
const webserverConfig = {
  previewPort: explicitConfig.previewPort ?? ports.preview ?? 4321,
  productionPort: explicitConfig.productionPort ?? ports.production ?? 8080,
};
```

### Phase 5: Update Deploy Scripts

Replace `deploy.config.json` reads with automatic extraction.

`deploy/scripts/lib/config.sh`:

```bash
# Extract deployment config from brain.config.ts
get_deploy_config() {
    local app_name="$1"
    local config_file="apps/$app_name/brain.config.ts"

    if [ ! -f "$config_file" ]; then
        log_error "Config not found: $config_file"
        return 1
    fi

    bun run "$config_file" --export-deploy-config
}

load_app_config() {
    local app_name="$1"

    log_info "Loading config from brain.config.ts..."
    local config_json=$(get_deploy_config "$app_name")

    if [ -z "$config_json" ]; then
        log_error "Failed to extract deployment config"
        return 1
    fi

    # Export all config as env vars
    export APP_NAME=$(echo "$config_json" | jq -r '.name')
    export APP_VERSION=$(echo "$config_json" | jq -r '.version // "0.1.0"')
    export APP_INSTALL_PATH=$(echo "$config_json" | jq -r '.paths.install')
    export APP_DATA_PATH=$(echo "$config_json" | jq -r '.paths.data')
    export APP_DEFAULT_PORT=$(echo "$config_json" | jq -r '.ports.default')
    export APP_PREVIEW_PORT=$(echo "$config_json" | jq -r '.ports.preview')
    export APP_PRODUCTION_PORT=$(echo "$config_json" | jq -r '.ports.production')
    export DOCKER_ENABLED=$(echo "$config_json" | jq -r '.docker.enabled')
    export DOCKER_IMAGE=$(echo "$config_json" | jq -r '.docker.image')
    export CDN_ENABLED=$(echo "$config_json" | jq -r '.cdn.enabled')
    export CDN_PROVIDER=$(echo "$config_json" | jq -r '.cdn.provider')
    export DNS_ENABLED=$(echo "$config_json" | jq -r '.dns.enabled')
    export DNS_PROVIDER=$(echo "$config_json" | jq -r '.dns.provider')
    export DOMAIN=$(echo "$config_json" | jq -r '.domain // empty')
    export SERVER_SIZE=$(echo "$config_json" | jq -r '.serverSize // "cx33"')

    log_info "Loaded config for $APP_NAME"
}
```

### Phase 6: Update Terraform

Pass per-app settings to Terraform:

```bash
terraform apply \
    -var="app_name=$APP_NAME" \
    -var="server_type=$SERVER_SIZE" \
    -var="domain=$DOMAIN" \
    -var="cdn_enabled=$CDN_ENABLED" \
    -var="dns_enabled=$DNS_ENABLED" \
    -var="bunny_api_key=${BUNNY_API_KEY:-}"
```

Update `variables.tf`:

```hcl
variable "cdn_enabled" {
  description = "Enable Bunny CDN for this app"
  type        = bool
  default     = false
}

variable "dns_enabled" {
  description = "Enable Bunny DNS for this app"
  type        = bool
  default     = false
}
```

### Phase 7: Migrate App Configs

Example `professional-brain/brain.config.ts`:

```typescript
const config = defineConfig({
  name: "professional-brain",
  version: "0.1.0",

  deployment: {
    provider: "hetzner",
    serverSize: "cx33",
    domain: "yeehaa.io",
    docker: {
      enabled: true,
    },
    ports: {
      default: 3333,
      preview: 4321,
      production: 8080,
    },
    cdn: {
      enabled: true,
      provider: "bunny",
    },
    dns: {
      enabled: false,
      provider: "bunny",
    },
  },

  plugins: [
    // WebserverInterface no longer needs port config
    new WebserverInterface({
      previewDistDir: "./dist/site-preview",
    }),
    // ...
  ],
});
```

### Phase 8: Add DNS Module

Create `deploy/providers/hetzner/terraform/modules/bunny-dns/`:

- `main.tf` - DNS zone and records
- `variables.tf` - Input variables
- `outputs.tf` - Nameservers, zone ID

### Phase 9: Cleanup

- Delete all `deploy.config.json` files
- Remove old config loading code
- Update documentation

## Migration Checklist

- [ ] Add `deploymentConfigSchema` to `shell/app/src/types.ts`
- [ ] Add `--export-deploy-config` CLI flag
- [ ] Add credential validation
- [ ] Update WebserverInterface to read deployment ports
- [ ] Add tests for new config schema
- [ ] Migrate `professional-brain/brain.config.ts`
- [ ] Update `deploy/scripts/lib/config.sh`
- [ ] Test deployment with new config
- [ ] Update Terraform variables for per-app CDN/DNS
- [ ] Migrate `team-brain` and `collective-brain`
- [ ] Create `bunny-dns` module
- [ ] Delete `deploy.config.json` files
- [ ] Update documentation
