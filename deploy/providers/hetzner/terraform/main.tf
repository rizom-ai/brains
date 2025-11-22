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
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
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

# Optional: AWS provider for Route53 DNS automation (only used if route53_zone_id is set)
provider "aws" {
  region = var.aws_region
  # AWS credentials can be provided via:
  # - AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables
  # - AWS_PROFILE environment variable
  # - ~/.aws/credentials file
  # - IAM role (if running on AWS)
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

# Optional: Route53 DNS Automation
# Only provisions DNS records if route53_zone_id is provided
# Automatically points domain to CDN (if enabled) or origin server
module "route53_dns" {
  source = "./modules/route53-dns"

  # Required
  route53_zone_id = var.route53_zone_id
  origin_ip       = hcloud_server.main.ipv4_address

  # Optional: domain configuration
  domain            = var.domain
  preview_subdomain = var.preview_subdomain

  # CDN integration (DNS points to CDN if enabled)
  cdn_enabled  = module.bunny_cdn.cdn_enabled
  cdn_hostname = module.bunny_cdn.cdn_hostname
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
}

output "cdn_hostname" {
  value       = module.bunny_cdn.cdn_hostname
  description = "CDN hostname (empty if CDN disabled)"
}

output "cdn_url" {
  value       = module.bunny_cdn.cdn_url
  description = "Full CDN URL (empty if CDN disabled)"
}

output "site_endpoint" {
  value       = module.bunny_cdn.cdn_enabled ? module.bunny_cdn.cdn_url : "http://${hcloud_server.main.ipv4_address}"
  description = "Primary site endpoint (CDN URL if enabled, otherwise server IP)"
}

output "cdn_status" {
  value       = module.bunny_cdn.cdn_enabled ? "Enabled (Bunny.net) - Privacy-friendly analytics available at bunny.net dashboard" : "Disabled (Direct to origin)"
  description = "CDN status and analytics info"
}

# DNS Outputs
output "dns_enabled" {
  value       = module.route53_dns.dns_enabled
  description = "Whether Route53 DNS automation is enabled"
}

output "dns_records" {
  value       = module.route53_dns.dns_records_created
  description = "DNS records created by automation"
}

output "dns_status" {
  value       = module.route53_dns.dns_enabled ? "Automated (Route53) - DNS records auto-configured" : "Manual - Update DNS manually to point to ${module.bunny_cdn.cdn_enabled ? "CDN" : "origin IP"}"
  description = "DNS configuration status"
}
