terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
    bunnynet = {
      source  = "BunnyWay/bunnynet"
      version = "~> 0.8"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # Local backend - path is configured via -backend-config during init
  backend "local" {}
}

provider "hcloud" {
  token = var.hcloud_token
}

# Optional: Bunny.net CDN provider (only used if bunny_api_key is set)
provider "bunnynet" {
  api_key = var.bunny_api_key
}

# Optional: Cloudflare provider (only used if cloudflare_api_token is set)
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# Look up existing SSH key instead of creating one
# This key should be uploaded once using setup-ssh-key.sh
data "hcloud_ssh_key" "deploy" {
  name = var.ssh_key_name
}

# Firewall for the server
resource "hcloud_firewall" "main" {
  name = "${var.app_name}-firewall"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "3333"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # Additional ports for preview and production sites
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "8080"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "4321"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

# The server
resource "hcloud_server" "main" {
  name         = var.app_name
  server_type  = var.server_type
  location     = var.location
  image        = var.server_image
  ssh_keys     = [data.hcloud_ssh_key.deploy.id]
  firewall_ids = [hcloud_firewall.main.id]

  labels = {
    app        = var.app_name
    managed_by = "terraform"
  }
}

# =============================================================================
# CDN Provider Selection
# =============================================================================

# Bunny.net CDN + DNS (when cdn_provider = "bunny")
module "bunny_cdn" {
  source = "./modules/bunny-cdn"
  count  = var.cdn_provider == "bunny" ? 1 : 0

  bunny_api_key = var.bunny_api_key
  app_name      = var.app_name
  origin_ip     = hcloud_server.main.ipv4_address
  domain        = var.domain
  dns_enabled   = var.dns_enabled

  enable_logging       = true
  enable_geo_zone_us   = true
  enable_geo_zone_eu   = true
  enable_geo_zone_asia = true
  enable_geo_zone_sa   = true
  enable_geo_zone_af   = true
}

# Cloudflare CDN + DNS (when cdn_provider = "cloudflare")
module "cloudflare_cdn_dns" {
  source = "./modules/cloudflare-cdn-dns"
  count  = var.cdn_provider == "cloudflare" ? 1 : 0

  cloudflare_api_token = var.cloudflare_api_token
  cloudflare_zone_id   = var.cloudflare_zone_id
  app_name             = var.app_name
  origin_ip            = hcloud_server.main.ipv4_address
  domain               = var.domain
}

# Optional: Cloudflare Web Analytics
# Only provisions if cloudflare credentials are provided
module "cloudflare_analytics" {
  source = "./modules/cloudflare-analytics"
  count  = var.cloudflare_api_token != "" && var.cloudflare_account_id != "" ? 1 : 0

  cloudflare_account_id = var.cloudflare_account_id
  cloudflare_api_token  = var.cloudflare_api_token
  domain                = var.domain
}

# Outputs
output "server_ip" {
  value       = hcloud_server.main.ipv4_address
  description = "IPv4 address of the server"
}

output "server_id" {
  value       = hcloud_server.main.id
  description = "ID of the server"
}

output "server_name" {
  value       = hcloud_server.main.name
  description = "Name of the server"
}

# CDN Outputs
output "cdn_enabled" {
  value       = var.cdn_provider != "none"
  description = "Whether CDN is enabled"
}

output "cdn_provider" {
  value       = var.cdn_provider
  description = "Active CDN provider"
}

output "cdn_url" {
  value = (
    var.cdn_provider == "cloudflare" ? module.cloudflare_cdn_dns[0].cdn_url :
    var.cdn_provider == "bunny" ? module.bunny_cdn[0].cdn_url :
    ""
  )
  description = "Full CDN URL (empty if CDN disabled)"
  sensitive   = true
}

output "site_endpoint" {
  value = (
    var.cdn_provider == "cloudflare" ? module.cloudflare_cdn_dns[0].cdn_url :
    var.cdn_provider == "bunny" ? module.bunny_cdn[0].cdn_url :
    "http://${hcloud_server.main.ipv4_address}"
  )
  description = "Primary site endpoint"
  sensitive   = true
}

output "dns_instructions" {
  value = (
    var.cdn_provider == "cloudflare" ? module.cloudflare_cdn_dns[0].dns_instructions :
    var.cdn_provider == "bunny" ? module.bunny_cdn[0].dns_instructions :
    "No CDN/DNS provider configured."
  )
  description = "Instructions for completing DNS setup"
  sensitive   = true
}

# Analytics Outputs
output "analytics_enabled" {
  value       = length(module.cloudflare_analytics) > 0
  description = "Whether Cloudflare Web Analytics is enabled"
}

output "analytics_site_tag" {
  value       = length(module.cloudflare_analytics) > 0 ? module.cloudflare_analytics[0].site_tag : ""
  description = "Cloudflare Analytics site tag for API queries (empty if disabled)"
  sensitive   = true
}

output "analytics_tracking_script" {
  value       = length(module.cloudflare_analytics) > 0 ? module.cloudflare_analytics[0].tracking_script : ""
  description = "Cloudflare Analytics tracking script for site injection (empty if disabled)"
  sensitive   = true
}

