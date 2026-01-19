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

# Optional: Bunny.net CDN + DNS
# Only provisions CDN resources if bunny_api_key is provided
# If dns_enabled=true, also creates DNS zone, records, and auto-configures custom hostnames
module "bunny_cdn" {
  source = "./modules/bunny-cdn"

  # Required
  bunny_api_key = var.bunny_api_key
  app_name      = var.app_name
  origin_ip     = hcloud_server.main.ipv4_address

  # Optional: domain for DNS zone, custom hostname, and origin hostname
  domain = var.domain

  # DNS management (creates zone, records, auto-configures custom hostnames)
  dns_enabled = var.dns_enabled

  # Privacy & performance settings
  enable_logging = true  # With IP anonymization by default

  # Geographic zones (enable all by default for global distribution)
  enable_geo_zone_us   = true
  enable_geo_zone_eu   = true
  enable_geo_zone_asia = true
  enable_geo_zone_sa   = true
  enable_geo_zone_af   = true
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
  value       = module.bunny_cdn.cdn_enabled
  description = "Whether Bunny CDN is enabled"
  sensitive   = true
}

output "cdn_hostname" {
  value       = module.bunny_cdn.cdn_hostname
  description = "CDN hostname (empty if CDN disabled)"
  sensitive   = true
}

output "cdn_url" {
  value       = module.bunny_cdn.cdn_url
  description = "Full CDN URL (empty if CDN disabled)"
  sensitive   = true
}

output "site_endpoint" {
  value       = module.bunny_cdn.cdn_enabled ? module.bunny_cdn.cdn_url : "http://${hcloud_server.main.ipv4_address}"
  description = "Primary site endpoint (CDN URL if enabled, otherwise server IP)"
  sensitive   = true
}

output "cdn_status" {
  value       = module.bunny_cdn.cdn_enabled ? "Enabled (Bunny.net) - Privacy-friendly analytics available at bunny.net dashboard" : "Disabled (Direct to origin)"
  description = "CDN status and analytics info"
  sensitive   = true
}

# DNS Outputs
output "dns_enabled" {
  value       = module.bunny_cdn.dns_enabled
  description = "Whether Bunny DNS management is enabled"
  sensitive   = true
}

output "dns_zone_id" {
  value       = module.bunny_cdn.dns_zone_id
  description = "Bunny DNS Zone ID (empty if DNS disabled)"
  sensitive   = true
}

output "nameservers" {
  value       = module.bunny_cdn.nameservers
  description = "Bunny nameservers to configure at your registrar"
  sensitive   = true
}

output "dns_instructions" {
  value       = module.bunny_cdn.dns_instructions
  description = "Instructions for completing DNS migration"
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

