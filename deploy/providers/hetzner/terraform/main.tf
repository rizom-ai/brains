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
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

# Optional: Bunny.net CDN provider (only used if bunny_api_key is set)
provider "bunnynet" {
  api_key = var.bunny_api_key
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

# Optional: Bunny.net CDN
# Only provisions CDN resources if bunny_api_key is provided
# Uses DOMAIN env var for custom hostname and origin
module "bunny_cdn" {
  source = "./modules/bunny-cdn"

  # Required
  bunny_api_key = var.bunny_api_key
  app_name      = var.app_name
  origin_ip     = hcloud_server.main.ipv4_address

  # Optional: domain for custom hostname + origin hostname
  domain = var.domain

  # Privacy & performance settings
  enable_logging = true  # With IP anonymization by default

  # Geographic zones (enable all by default for global distribution)
  enable_geo_zone_us   = true
  enable_geo_zone_eu   = true
  enable_geo_zone_asia = true
  enable_geo_zone_sa   = true
  enable_geo_zone_af   = true
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

