# Bunny.net to Cloudflare Migration Plan

## Summary

Migrate from Bunny.net to Cloudflare for CDN and DNS services, consolidating with existing Cloudflare Analytics.

## Current State

**Bunny.net provides:**

- CDN Pull Zones with edge caching (5 geographic zones)
- DNS zone management (A/CNAME records)
- Custom hostnames with auto SSL (Let's Encrypt)
- Edge rules for MCP API redirect
- Terraform module: `deploy/providers/hetzner/terraform/modules/bunny-cdn/`

**Cloudflare currently provides:**

- Web Analytics only
- Terraform module: `deploy/providers/hetzner/terraform/modules/cloudflare-analytics/`

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

| File                                              | Changes                                        |
| ------------------------------------------------- | ---------------------------------------------- |
| `deploy/providers/hetzner/terraform/main.tf`      | Add cloudflare_cdn_dns module                  |
| `deploy/providers/hetzner/terraform/variables.tf` | Add cloudflare_zone_id, cloudflare_cdn_enabled |
| `modules/cloudflare-analytics/main.tf`            | Support zone_tag for integrated analytics      |

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
module "cloudflare_cdn_dns" {
  source = "./modules/cloudflare-cdn-dns"
  count  = var.cloudflare_cdn_enabled ? 1 : 0

  cloudflare_api_token  = var.cloudflare_api_token
  cloudflare_account_id = var.cloudflare_account_id
  cloudflare_zone_id    = var.cloudflare_zone_id
  app_name              = var.app_name
  origin_ip             = hcloud_server.main.ipv4_address
  domain                = var.domain
}
```

### Step 3: Add Variables

```hcl
variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for the domain"
  type        = string
  default     = ""
}

variable "cloudflare_cdn_enabled" {
  description = "Enable Cloudflare CDN/DNS (disables Bunny)"
  type        = bool
  default     = false
}
```

## Migration Steps (Zero-Downtime)

### Phase 1: Preparation

1. Create Cloudflare zone (if not exists) - note Zone ID
2. Create API token with required permissions (see below)
3. Add `cloudflare_zone_id` to config.env
4. Keep `bunny_api_key` active (parallel operation)

### Phase 2: Deploy Cloudflare Resources

```bash
terraform apply  # Creates CF resources, Bunny still active
```

### Phase 3: DNS Cutover

1. Update nameservers at registrar: Bunny → Cloudflare
2. Allow 24-48 hours for propagation
3. Monitor both dashboards during transition

### Phase 4: Cleanup

1. Verify all traffic via Cloudflare (`dig domain.com NS`)
2. Set `bunny_cdn_enabled = false`
3. Run `terraform apply` to destroy Bunny resources

## Required Cloudflare API Permissions

Add to existing token:

- Zone > Zone: Read
- Zone > Zone Settings: Edit
- Zone > DNS: Edit
- Zone > Cache Purge: Purge
- Zone > Dynamic Redirect: Edit

## Tradeoffs

| Aspect       | Bunny.net     | Cloudflare             |
| ------------ | ------------- | ---------------------- |
| Network size | 114+ PoPs     | 300+ PoPs              |
| Pricing      | Per GB        | Free for basic CDN     |
| HQ location  | EU (Slovenia) | US                     |
| Edge rules   | Unlimited     | 10 on free plan        |
| Dashboard    | Separate      | Unified with Analytics |

## Verification

1. **Check DNS propagation:**

   ```bash
   dig yourdomain.com NS +short
   ```

2. **Verify CDN is working:**

   ```bash
   curl -I https://yourdomain.com | grep cf-cache-status
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
