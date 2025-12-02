# Bunny CDN + DNS Module Variables

variable "bunny_api_key" {
  description = "Bunny.net API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "app_name" {
  description = "Application name (used as pullzone name)"
  type        = string
}

variable "origin_ip" {
  description = "Origin server IP address"
  type        = string
}

variable "domain" {
  description = "Domain name (used for DNS zone, custom hostname, and origin hostname)"
  type        = string
  default     = ""
}

variable "dns_enabled" {
  description = "Enable Bunny DNS management (creates zone, records, and auto-configures custom hostnames)"
  type        = bool
  default     = false
}

variable "enable_logging" {
  description = "Enable CDN access logging (with IP anonymization)"
  type        = bool
  default     = true
}

# Geographic zone settings
variable "enable_geo_zone_us" {
  description = "Enable US geographic zone"
  type        = bool
  default     = true
}

variable "enable_geo_zone_eu" {
  description = "Enable EU geographic zone"
  type        = bool
  default     = true
}

variable "enable_geo_zone_asia" {
  description = "Enable Asia geographic zone"
  type        = bool
  default     = true
}

variable "enable_geo_zone_sa" {
  description = "Enable South America geographic zone"
  type        = bool
  default     = true
}

variable "enable_geo_zone_af" {
  description = "Enable Africa geographic zone"
  type        = bool
  default     = true
}
