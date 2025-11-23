# Bunny.net CDN Module
# Creates a Pull Zone that acts as a CDN in front of the origin server

terraform {
  required_providers {
    bunnynet = {
      source  = "BunnyWay/bunnynet"
      version = "~> 0.8"
    }
  }
}

locals {
  # Auto-detect if CDN should be enabled (if API key is provided)
  cdn_enabled = var.bunny_api_key != ""

  # Origin URL must use server IP (not domain) to avoid circular DNS dependency
  # Use HTTP because Caddy can't serve HTTPS on IP address (no certificate for IP)
  # This is industry standard - user→CDN is encrypted, CDN→origin can be HTTP
  origin_url         = "http://${var.origin_ip}"
  # Host header tells origin server which virtual host to serve
  origin_host_header = var.domain != "" ? var.domain : var.origin_ip
}

# Bunny.net Pull Zone (CDN)
# Only created if CDN is enabled
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
  log_enabled    = var.enable_logging
  log_anonymized = true  # Anonymize IP addresses
  log_anonymized_style = "OneDigit"  # Remove last octet of IPv4 (options: "OneDigit" or "Drop")

  # Cache settings
  cache_enabled = true
  cache_errors  = false
}

# Edge Rule: Redirect MCP API to direct HTTPS origin
# For security, MCP requests should use end-to-end encryption
resource "bunnynet_pullzone_edgerule" "mcp_redirect" {
  count = local.cdn_enabled ? 1 : 0

  pullzone    = bunnynet_pullzone.main[0].id
  enabled     = true
  description = "Redirect MCP API to direct HTTPS origin for end-to-end encryption"
  match_type  = "MatchAll"

  action            = "Redirect"
  action_parameter1 = "https://${local.origin_host_header}{{path}}"  # Redirect URL with path variable
  action_parameter2 = "302"                                            # HTTP status code

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

# NOTE: Custom hostnames are DISABLED for initial deployment
# After DNS is pointed to Bunny, add custom hostnames via Bunny dashboard:
# 1. Deploy this to get the .b-cdn.net hostname
# 2. Point your DNS (CNAME) to the .b-cdn.net hostname
# 3. Wait for DNS to propagate (check with: dig yourdomain.com)
# 4. Add custom hostname in Bunny dashboard: Security > Custom Hostnames
# 5. Enable Force SSL in Bunny dashboard after certificate provisions
#
# Terraform can't add custom hostnames automatically because Bunny requires
# DNS to be pointing to them BEFORE accepting the custom hostname.
