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

variable "ssh_private_key_path" {
  description = "Path to SSH private key"
  type        = string
  default     = ""
}


variable "env_file_path" {
  description = "Path to environment file relative to terraform module"
  type        = string
  default     = ""
}

variable "docker_image" {
  description = "Docker image to deploy"
  type        = string
}

variable "docker_registry" {
  description = "Docker registry URL (e.g., ghcr.io/username or docker.io)"
  type        = string
  default     = ""
}

variable "registry_user" {
  description = "Registry username for authentication"
  type        = string
  default     = ""
}

variable "registry_token" {
  description = "Registry token/password for authentication"
  type        = string
  default     = ""
  sensitive   = true
}

variable "domain" {
  description = "Domain name for HTTPS (e.g., brain.example.com)"
  type        = string
  default     = ""
}
