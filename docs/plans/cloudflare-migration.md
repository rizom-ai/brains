# CDN Provider Options: Cloudflare and Bunny.net

## Summary

Add Cloudflare as the default CDN/DNS provider for new deployments while keeping Bunny.net available as an alternative. This gives developers flexibility to choose based on their needs.

## Provider Comparison

| Aspect           | Cloudflare (Default)       | Bunny.net (Alternative)            |
| ---------------- | -------------------------- | ---------------------------------- |
| **Network size** | 300+ PoPs globally         | 114+ PoPs                          |
| **Pricing**      | Free tier available        | Pay-per-GB (cheap)                 |
| **HQ / Data**    | US-based                   | EU-based (Slovenia)                |
| **Edge rules**   | 10 on free plan            | Unlimited                          |
| **Developer UX** | Familiar, widely used      | Niche, extra account needed        |
| **Best for**     | Most users, cost-conscious | EU data residency, many edge rules |

## When to Choose Each

**Choose Cloudflare (default) if:**

- You want zero cost for basic CDN
- You already have a Cloudflare account
- You prefer unified dashboard with analytics
- You don't have strict EU data residency requirements

**Choose Bunny.net if:**

- You need EU-based data processing (GDPR)
- You need more than 10 edge rules
- You prefer usage-based pricing over free tiers
- You're already using Bunny.net for other projects

## Current State

**Bunny.net module:** `deploy/providers/hetzner/terraform/modules/bunny-cdn/`

**Cloudflare module:** `deploy/providers/hetzner/terraform/modules/cloudflare-analytics/` (analytics only, CDN to be added)

## Feature Mapping

| Bunny.net                 | Cloudflare Equivalent                  |
| ------------------------- | -------------------------------------- |
| CDN Pull Zone             | Cloudflare Proxy (orange cloud)        |
| DNS Zone                  | `cloudflare_zone` resource             |
| A/CNAME Records           | `cloudflare_record` resources          |
| Edge Caching              | Cloudflare's 300+ global PoPs          |
| Auto SSL                  | Universal SSL (free)                   |
| Edge Rules (MCP redirect) | `cloudflare_ruleset` (Transform Rules) |

## Files to Create

| File                                      | Description                                             |
| ----------------------------------------- | ------------------------------------------------------- |
| `modules/cloudflare-cdn-dns/main.tf`      | DNS records, cache rules, transform rules, SSL settings |
| `modules/cloudflare-cdn-dns/variables.tf` | Input variables                                         |
| `modules/cloudflare-cdn-dns/outputs.tf`   | Nameservers, URLs, instructions                         |

## Files to Modify

| File                                              | Changes                                                 |
| ------------------------------------------------- | ------------------------------------------------------- |
| `deploy/providers/hetzner/terraform/main.tf`      | Add cloudflare_cdn_dns module, update conditional logic |
| `deploy/providers/hetzner/terraform/variables.tf` | Add cdn_provider variable, cloudflare_zone_id           |
| `modules/cloudflare-analytics/main.tf`            | Support zone_tag for integrated analytics               |

## Implementation

### Step 1: Create `cloudflare-cdn-dns` Module

**main.tf** - Key resources:

```hcl
# DNS Records (proxied = CDN enabled)
resource "cloudflare_record" "apex" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "A"
  content = var.origin_ip
  proxied = true
}

resource "cloudflare_record" "www" {
  zone_id = var.cloudflare_zone_id
  name    = "www"
  type    = "A"
  content = var.origin_ip
  proxied = true
}

resource "cloudflare_record" "preview" {
  zone_id = var.cloudflare_zone_id
  name    = "preview"
  type    = "A"
  content = var.origin_ip
  proxied = false  # Direct access, bypass CDN
}

# MCP API redirect (replaces Bunny edge rule)
resource "cloudflare_ruleset" "transform_rules" {
  zone_id = var.cloudflare_zone_id
  name    = "${var.app_name}-transform-rules"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"

  rules {
    action = "redirect"
    action_parameters {
      from_value {
        status_code = 302
        target_url {
          expression = "concat(\"https://preview.\", http.host, http.request.uri.path)"
        }
        preserve_query_string = true
      }
    }
    expression  = "(starts_with(http.request.uri.path, \"/mcp\"))"
    description = "Redirect MCP API to preview subdomain"
  }
}

# SSL settings
resource "cloudflare_zone_setting" "ssl" {
  zone_id = var.cloudflare_zone_id
  setting = "ssl"
  value   = "full_strict"
}
```

### Step 2: Update main.tf

```hcl
# CDN Provider Selection
module "cloudflare_cdn_dns" {
  source = "./modules/cloudflare-cdn-dns"
  count  = var.cdn_provider == "cloudflare" ? 1 : 0

  cloudflare_api_token  = var.cloudflare_api_token
  cloudflare_account_id = var.cloudflare_account_id
  cloudflare_zone_id    = var.cloudflare_zone_id
  app_name              = var.app_name
  origin_ip             = hcloud_server.main.ipv4_address
  domain                = var.domain
}

module "bunny_cdn" {
  source = "./modules/bunny-cdn"
  count  = var.cdn_provider == "bunny" ? 1 : 0

  bunny_api_key = var.bunny_api_key
  app_name      = var.app_name
  origin_ip     = hcloud_server.main.ipv4_address
  domain        = var.domain
}
```

### Step 3: Add Variables

```hcl
variable "cdn_provider" {
  description = "CDN provider to use: 'cloudflare' (default) or 'bunny'"
  type        = string
  default     = "cloudflare"

  validation {
    condition     = contains(["cloudflare", "bunny", "none"], var.cdn_provider)
    error_message = "cdn_provider must be 'cloudflare', 'bunny', or 'none'"
  }
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for the domain (required if cdn_provider = 'cloudflare')"
  type        = string
  default     = ""
}
```

## Configuration Guide

### New Deployments (Cloudflare - Default)

1. Create a Cloudflare account (if you don't have one)
2. Add your domain to Cloudflare and note the Zone ID
3. Create API token with required permissions (see below)
4. Configure your deployment:

```bash
# config.env
cdn_provider=cloudflare
cloudflare_zone_id=your_zone_id_here
cloudflare_api_token=your_token_here
cloudflare_account_id=your_account_id_here
```

5. Deploy:

```bash
terraform apply
```

### New Deployments (Bunny.net - Alternative)

1. Create a Bunny.net account
2. Generate an API key
3. Configure your deployment:

```bash
# config.env
cdn_provider=bunny
bunny_api_key=your_api_key_here
```

4. Deploy:

```bash
terraform apply
```

### Migrating Existing Bunny Deployments to Cloudflare (Zero-Downtime)

For users with existing Bunny.net deployments who want to switch:

#### Phase 1: Preparation

1. Create Cloudflare zone - note Zone ID
2. Create API token with required permissions (see below)
3. Add Cloudflare credentials to config.env (keep Bunny credentials too)
4. Set `cdn_provider=bunny` initially (no change yet)

#### Phase 2: Deploy Cloudflare Resources in Parallel

```bash
# Temporarily enable both for parallel operation
# In main.tf, temporarily change count logic to enable both
terraform apply  # Creates CF resources, Bunny still active
```

#### Phase 3: DNS Cutover

1. Update nameservers at registrar: Bunny → Cloudflare
2. Allow 24-48 hours for propagation
3. Monitor both dashboards during transition

#### Phase 4: Cleanup

1. Verify all traffic via Cloudflare (`dig domain.com NS`)
2. Set `cdn_provider=cloudflare` in config.env
3. Run `terraform apply` to destroy Bunny resources

## Required Cloudflare API Permissions

Add to existing token:

- Zone > Zone: Read
- Zone > Zone Settings: Edit
- Zone > DNS: Edit
- Zone > Cache Purge: Purge
- Zone > Dynamic Redirect: Edit

## Verification

### Cloudflare

1. **Check DNS propagation:**

   ```bash
   dig yourdomain.com NS +short
   # Should show Cloudflare nameservers
   ```

2. **Verify CDN is working:**

   ```bash
   curl -I https://yourdomain.com | grep cf-cache-status
   # Should show: cf-cache-status: HIT or MISS or DYNAMIC
   ```

3. **Test SSL:**

   ```bash
   curl -vI https://yourdomain.com 2>&1 | grep "SSL certificate"
   ```

4. **Test MCP redirect:**

   ```bash
   curl -I https://yourdomain.com/mcp
   # Should redirect to preview.yourdomain.com/mcp
   ```

### Bunny.net

1. **Check DNS propagation:**

   ```bash
   dig yourdomain.com NS +short
   # Should show Bunny nameservers
   ```

2. **Verify CDN is working:**

   ```bash
   curl -I https://yourdomain.com | grep -i cdn-cache
   # Should show cache headers from Bunny
   ```

3. **Test MCP redirect:**

   ```bash
   curl -I https://yourdomain.com/mcp
   # Should redirect to preview.yourdomain.com/mcp
   ```
