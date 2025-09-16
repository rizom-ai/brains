variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "ssh_key_name" {
  description = "Name for the shared SSH key"
  type        = string
  default     = "personal-brain-deploy"
}

variable "ssh_public_key_path" {
  description = "Path to SSH public key"
  type        = string
}