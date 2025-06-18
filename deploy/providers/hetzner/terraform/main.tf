terraform {
  required_providers {
    hcloud = {
      source = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

resource "hcloud_ssh_key" "deploy" {
  name       = "${var.app_name}-key"
  public_key = file(var.ssh_public_key_path)
}

resource "hcloud_firewall" "main" {
  name = "${var.app_name}-firewall"

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = var.app_port
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "main" {
  name        = var.app_name
  server_type = var.server_type
  location    = var.location
  image       = "ubuntu-22.04"
  ssh_keys    = [hcloud_ssh_key.deploy.id]
  firewall_ids = [hcloud_firewall.main.id]
}

output "server_ip" {
  value = hcloud_server.main.ipv4_address
}
