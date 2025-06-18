variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "app_name" {
  description = "Application name"
  type        = string
}

variable "app_port" {
  description = "Application port"
  type        = string
}

variable "server_type" {
  description = "Server type"
  type        = string
  default     = "cx22"
}

variable "location" {
  description = "Server location"
  type        = string
  default     = "fsn1"
}

variable "ssh_public_key_path" {
  description = "Path to SSH public key"
  type        = string
}
