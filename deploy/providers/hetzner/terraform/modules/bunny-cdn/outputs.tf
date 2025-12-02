# Bunny CDN + DNS Module Outputs

# =============================================================================
# CDN Outputs
# =============================================================================

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

# =============================================================================
# DNS Outputs
# =============================================================================

output "dns_enabled" {
  description = "Whether DNS management is enabled"
  value       = local.dns_enabled
}

output "dns_zone_id" {
  description = "Bunny DNS Zone ID (empty if DNS disabled)"
  value       = local.dns_enabled ? bunnynet_dns_zone.main[0].id : ""
}

output "nameservers" {
  description = "Bunny nameservers to configure at your registrar"
  value       = local.dns_enabled ? ["kiki.bunny.net", "coco.bunny.net"] : []
}

output "custom_hostname_enabled" {
  description = "Whether custom hostnames are auto-configured"
  value       = local.custom_hostname_enabled
}

# =============================================================================
# DNS Migration Instructions
# =============================================================================

output "dns_instructions" {
  description = "Instructions for completing DNS migration"
  value = local.dns_enabled ? join("\n", [
    "DNS zone created for ${var.domain}",
    "",
    "To complete the migration:",
    "1. Update nameservers at your domain registrar to:",
    "   - kiki.bunny.net",
    "   - coco.bunny.net",
    "",
    "2. Wait for DNS propagation (can take up to 48 hours)",
    "   Check with: dig ${var.domain} NS",
    "",
    "3. Once propagated, the following records are configured:",
    "   - ${var.domain} -> CDN (${local.cdn_hostname})",
    "   - www.${var.domain} -> CDN (${local.cdn_hostname})",
    "   - preview.${var.domain} -> Server (${var.origin_ip})",
    "",
    "4. Custom hostnames will auto-provision SSL certificates"
  ]) : "DNS management not enabled. Set dns_enabled = true to enable."
}
