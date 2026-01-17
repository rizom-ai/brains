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
  default     = "cx33"
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

variable "domain" {
  description = "Domain name for the application (used for CDN custom hostname if CDN enabled)"
  type        = string
  default     = ""
}

# Optional: Bunny.net CDN configuration
variable "bunny_api_key" {
  description = "Bunny.net API key (optional - CDN disabled if empty)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "dns_enabled" {
  description = "Whether to enable Bunny DNS management (creates zone, records, auto-configures custom hostnames)"
  type        = bool
  default     = false
}

# Optional: Cloudflare Web Analytics configuration
variable "cloudflare_api_token" {
  description = "Cloudflare API token with Analytics permissions (optional - analytics disabled if empty)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID (optional - analytics disabled if empty)"
  type        = string
  default     = ""
}