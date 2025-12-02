# Bunny.net CDN + DNS Module
# Supports two modes:
# 1. CDN only (dns_enabled=false): Creates pull zone, manual DNS setup required
# 2. CDN + DNS (dns_enabled=true): Creates DNS zone, records, pull zone, and custom hostname automatically

terraform {
  required_providers {
    bunnynet = {
      source  = "BunnyWay/bunnynet"
      version = "~> 0.8"
    }
  }
}

locals {
  # CDN enabled if API key provided
  cdn_enabled = var.bunny_api_key != ""

  # DNS enabled if explicitly requested AND we have API key AND domain
  dns_enabled = var.dns_enabled && var.bunny_api_key != "" && var.domain != ""

  # Custom hostname can be automated when DNS is managed by Bunny
  custom_hostname_enabled = local.cdn_enabled && local.dns_enabled && var.domain != ""

  # Origin URL must use server IP (not domain) to avoid circular DNS dependency
  # Use HTTP because Caddy can't serve HTTPS on IP address (no certificate for IP)
  origin_url         = "http://${var.origin_ip}"
  # Host header tells origin server which virtual host to serve
  origin_host_header = var.domain != "" ? var.domain : var.origin_ip

  # CDN hostname for CNAME records
  cdn_hostname = local.cdn_enabled ? "${bunnynet_pullzone.main[0].name}.b-cdn.net" : ""
}

# =============================================================================
# DNS Zone (only when dns_enabled=true)
# =============================================================================

resource "bunnynet_dns_zone" "main" {
  count = local.dns_enabled ? 1 : 0

  domain = var.domain
}

# =============================================================================
# DNS Records (only when dns_enabled=true)
# =============================================================================

# Apex domain → CDN (CNAME flattening handled by Bunny)
resource "bunnynet_dns_record" "apex" {
  count = local.dns_enabled ? 1 : 0

  zone  = bunnynet_dns_zone.main[0].id
  name  = ""
  type  = "CNAME"
  value = local.cdn_hostname
  ttl   = 300
}

# WWW subdomain → CDN (Caddy handles redirect to apex)
resource "bunnynet_dns_record" "www" {
  count = local.dns_enabled ? 1 : 0

  zone  = bunnynet_dns_zone.main[0].id
  name  = "www"
  type  = "CNAME"
  value = local.cdn_hostname
  ttl   = 300
}

# Preview subdomain → direct to server IP (bypasses CDN)
resource "bunnynet_dns_record" "preview" {
  count = local.dns_enabled ? 1 : 0

  zone  = bunnynet_dns_zone.main[0].id
  name  = "preview"
  type  = "A"
  value = var.origin_ip
  ttl   = 300
}

# =============================================================================
# CDN Pull Zone
# =============================================================================

resource "bunnynet_pullzone" "main" {
  count = local.cdn_enabled ? 1 : 0

  name = var.app_name

  # Origin configuration
  origin {
    type             = "OriginUrl"
    url              = local.origin_url
    host_header      = local.origin_host_header
    # Don't follow Caddy's HTTP→HTTPS redirect, Bunny handles SSL to users
    follow_redirects = false
  }

  # Routing configuration
  routing {
    tier = "Standard"  # Options: "Standard" or "Volume" (cheaper for high traffic)
  }

  # Privacy settings (enabled by default)
  log_enabled          = var.enable_logging
  log_anonymized       = true  # Anonymize IP addresses
  log_anonymized_style = "OneDigit"  # Remove last octet of IPv4

  # Cache settings
  cache_enabled = true
  cache_errors  = false
}

# =============================================================================
# Custom Hostnames (only when DNS is managed by Bunny)
# =============================================================================

# Apex domain custom hostname
resource "bunnynet_pullzone_hostname" "apex" {
  count = local.custom_hostname_enabled ? 1 : 0

  pullzone    = bunnynet_pullzone.main[0].id
  name        = var.domain
  tls_enabled = true
  force_ssl   = true

  depends_on = [bunnynet_dns_record.apex]
}

# WWW subdomain custom hostname
resource "bunnynet_pullzone_hostname" "www" {
  count = local.custom_hostname_enabled ? 1 : 0

  pullzone    = bunnynet_pullzone.main[0].id
  name        = "www.${var.domain}"
  tls_enabled = true
  force_ssl   = true

  depends_on = [bunnynet_dns_record.www]
}

# =============================================================================
# Edge Rules
# =============================================================================

# Edge Rule: Redirect MCP API to direct HTTPS origin
# For security, MCP requests should use end-to-end encryption
resource "bunnynet_pullzone_edgerule" "mcp_redirect" {
  count = local.cdn_enabled ? 1 : 0

  pullzone    = bunnynet_pullzone.main[0].id
  enabled     = true
  description = "Redirect MCP API to direct HTTPS origin for end-to-end encryption"
  match_type  = "MatchAll"

  action            = "Redirect"
  action_parameter1 = "https://${local.origin_host_header}{{path}}"
  action_parameter2 = "302"

  triggers = [
    {
      type       = "Url"
      match_type = "MatchAny"
      patterns   = ["/mcp*"]
      parameter1 = null
      parameter2 = null
    }
  ]
}
