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

# Shared SSH key that all deployments will reference
resource "hcloud_ssh_key" "shared_deploy" {
  name       = var.ssh_key_name
  public_key = file(var.ssh_public_key_path)
}

output "ssh_key_name" {
  value       = hcloud_ssh_key.shared_deploy.name
  description = "Name of the SSH key to use in deployments"
}

output "ssh_key_id" {
  value       = hcloud_ssh_key.shared_deploy.id
  description = "ID of the SSH key"
}