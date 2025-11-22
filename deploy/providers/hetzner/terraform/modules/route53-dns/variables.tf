# Route53 DNS Module Variables

variable "route53_zone_id" {
  description = "AWS Route53 hosted zone ID (leave empty to disable DNS automation)"
  type        = string
  default     = ""
}

variable "domain" {
  description = "Domain name to configure DNS for"
  type        = string
  default     = ""
}

variable "origin_ip" {
  description = "Origin server IP address"
  type        = string
}

variable "cdn_enabled" {
  description = "Whether CDN is enabled (affects DNS target)"
  type        = bool
  default     = false
}

variable "cdn_hostname" {
  description = "CDN hostname (if CDN is enabled)"
  type        = string
  default     = ""
}

variable "preview_subdomain" {
  description = "Preview subdomain name (e.g., 'preview' for preview.yourdomain.com). Leave empty to disable."
  type        = string
  default     = "preview"
}

variable "dns_ttl" {
  description = "DNS TTL in seconds"
  type        = number
  default     = 300  # 5 minutes
}
