variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with Analytics permissions"
  type        = string
  sensitive   = true
}

variable "domain" {
  description = "Domain to track (e.g., yeehaa.io)"
  type        = string
}
