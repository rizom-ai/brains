variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "app_name" {
  description = "Application name"
  type        = string
}

variable "server_type" {
  description = "Server type"
  type        = string
  default     = "cpx11"
}

variable "location" {
  description = "Server location"
  type        = string
  default     = "fsn1"
}

variable "server_image" {
  description = "Server OS image"
  type        = string
  default     = "ubuntu-22.04"
}

variable "ssh_key_name" {
  description = "Name of the SSH key in Hetzner (should already exist)"
  type        = string
  default     = "personal-brain-deploy"
}