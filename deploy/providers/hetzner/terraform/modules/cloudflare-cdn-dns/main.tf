# Cloudflare CDN + DNS Module
# Manages DNS records (proxied for CDN), SSL settings, and MCP redirect rules.
# Cloudflare acts as both DNS and CDN when records are proxied (orange cloud).

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# =============================================================================
# DNS Records
# =============================================================================

# Apex domain → origin server (proxied = CDN enabled)
resource "cloudflare_dns_record" "apex" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "A"
  content = var.origin_ip
  proxied = true
  ttl     = 1 # Auto when proxied
}

# WWW → origin server (proxied, Caddy handles redirect to apex)
resource "cloudflare_dns_record" "www" {
  zone_id = var.cloudflare_zone_id
  name    = "www"
  type    = "A"
  content = var.origin_ip
  proxied = true
  ttl     = 1
}

# Preview subdomain → direct to server (not proxied, bypasses CDN)
resource "cloudflare_dns_record" "preview" {
  zone_id = var.cloudflare_zone_id
  name    = "preview"
  type    = "A"
  content = var.origin_ip
  proxied = false
  ttl     = 300
}

# =============================================================================
# SSL Settings
# =============================================================================

resource "cloudflare_zone_setting" "ssl" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "ssl"
  value      = "full_strict"
}

# Always redirect HTTP → HTTPS
resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "always_use_https"
  value      = "on"
}

# =============================================================================
# Edge Rules
# =============================================================================

# Redirect MCP API requests to preview subdomain (direct HTTPS to origin)
resource "cloudflare_ruleset" "mcp_redirect" {
  zone_id = var.cloudflare_zone_id
  name    = "${var.app_name}-mcp-redirect"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"

  rules = [
    {
      action      = "redirect"
      expression  = "(starts_with(http.request.uri.path, \"/mcp\"))"
      description = "Redirect MCP API to preview subdomain for end-to-end encryption"
      action_parameters = {
        from_value = {
          status_code = 302
          target_url = {
            expression = "concat(\"https://preview.${var.domain}\", http.request.uri.path)"
          }
          preserve_query_string = true
        }
      }
    }
  ]
}
