terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
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
