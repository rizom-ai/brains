# Route53 DNS Module Outputs

output "dns_enabled" {
  description = "Whether DNS automation is enabled"
  value       = local.dns_enabled
}

output "dns_records_created" {
  description = "List of DNS records created"
  value = local.dns_enabled && var.domain != "" ? [
    "${var.domain} (${local.dns_type})",
    "www.${var.domain} (CNAME)",
    var.preview_subdomain != "" ? "${var.preview_subdomain}.${var.domain} (A)" : ""
  ] : []
}

output "dns_target" {
  description = "DNS target (CDN hostname or origin IP)"
  value       = local.dns_enabled ? local.dns_target : ""
}
