# Cloudflare CDN + DNS Module Variables

variable "cloudflare_api_token" {
  description = "Cloudflare API token"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for the domain"
  type        = string
}

variable "app_name" {
  description = "Application name (used for rule descriptions)"
  type        = string
}

variable "origin_ip" {
  description = "Origin server IP address"
  type        = string
}

variable "domain" {
  description = "Domain name"
  type        = string
}
