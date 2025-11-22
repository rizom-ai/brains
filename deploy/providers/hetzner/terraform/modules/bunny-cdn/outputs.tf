# Bunny CDN Module Outputs

output "cdn_enabled" {
  description = "Whether CDN is enabled"
  value       = local.cdn_enabled
}

output "pullzone_id" {
  description = "Bunny Pull Zone ID (empty if CDN disabled)"
  value       = local.cdn_enabled ? bunnynet_pullzone.main[0].id : ""
}

output "pullzone_name" {
  description = "Bunny Pull Zone name (empty if CDN disabled)"
  value       = local.cdn_enabled ? bunnynet_pullzone.main[0].name : ""
}

output "cdn_hostname" {
  description = "CDN hostname (.b-cdn.net) - Point your DNS CNAME to this"
  value       = local.cdn_enabled ? "${bunnynet_pullzone.main[0].name}.b-cdn.net" : ""
}

output "cdn_url" {
  description = "Full CDN URL with HTTPS (empty if CDN disabled)"
  value       = local.cdn_enabled ? "https://${bunnynet_pullzone.main[0].name}.b-cdn.net" : ""
}

output "origin_url" {
  description = "Origin URL being cached"
  value       = local.cdn_enabled ? local.origin_url : ""
}
