# Bunny.net CDN Module
# Creates a Pull Zone that acts as a CDN in front of the origin server

locals {
  # Auto-detect if CDN should be enabled (if API key is provided)
  cdn_enabled = var.bunny_api_key != ""

  # Origin URL construction - use domain if provided, otherwise IP
  origin_url         = var.domain != "" ? "https://${var.domain}" : "http://${var.origin_ip}"
  origin_host_header = var.domain != "" ? var.domain : var.origin_ip
}

# Bunny.net Pull Zone (CDN)
# Only created if CDN is enabled
resource "bunnynet_pullzone" "main" {
  count = local.cdn_enabled ? 1 : 0

  name               = var.app_name
  origin_url         = local.origin_url
  origin_host_header = local.origin_host_header

  # Privacy settings (enabled by default)
  log_anonymize_type = 1  # Anonymize last octet of IP
  enable_logging     = var.enable_logging

  # Performance settings
  enable_cache_slice = true
  cache_error_responses = false

  # Security settings
  enable_origin_shield = false  # Enable if needed for additional origin protection
  enable_smart_cache   = true

  # SSL/TLS
  enable_tls_1_1 = false  # Disable old TLS versions
  enable_tls_1   = false

  # Geographic settings (optional - can enable EU-only routing)
  enable_geo_zone_us = var.enable_geo_zone_us
  enable_geo_zone_eu = var.enable_geo_zone_eu
  enable_geo_zone_asia = var.enable_geo_zone_asia
  enable_geo_zone_sa = var.enable_geo_zone_sa
  enable_geo_zone_af = var.enable_geo_zone_af
}

# Optional: Custom hostname for main domain (yourdomain.com)
# Add your domain to the Pull Zone so visitors can access via your domain
# Bunny will auto-provision SSL certificate for your domain
resource "bunnynet_pullzone_hostname" "custom" {
  count = local.cdn_enabled && var.domain != "" ? 1 : 0

  pullzone_id = bunnynet_pullzone.main[0].id
  hostname    = var.domain

  # Force SSL (recommended)
  force_ssl = true

  # SSL certificate will be auto-provisioned by Bunny via Let's Encrypt
  # This can take a few minutes after DNS is pointed to Bunny
}

# Optional: Custom hostname for WWW subdomain (www.yourdomain.com)
# Allows Bunny to forward www requests to Caddy, which handles the 301 redirect
resource "bunnynet_pullzone_hostname" "www" {
  count = local.cdn_enabled && var.domain != "" ? 1 : 0

  pullzone_id = bunnynet_pullzone.main[0].id
  hostname    = "www.${var.domain}"

  # Force SSL (recommended)
  force_ssl = true

  # SSL certificate will be auto-provisioned by Bunny via Let's Encrypt
}
