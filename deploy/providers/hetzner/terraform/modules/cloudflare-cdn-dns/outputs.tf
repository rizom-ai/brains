# Cloudflare CDN + DNS Module Outputs

output "cdn_url" {
  description = "Site URL (via Cloudflare CDN)"
  value       = "https://${var.domain}"
}

output "preview_url" {
  description = "Preview URL (direct to origin, bypasses CDN)"
  value       = "https://preview.${var.domain}"
}

output "nameservers" {
  description = "Cloudflare nameservers — set these at your domain registrar"
  value       = ["Check Cloudflare dashboard for assigned nameservers"]
}

output "dns_instructions" {
  value = join("\n", [
    "Cloudflare CDN + DNS configured for ${var.domain}",
    "",
    "DNS records created:",
    "  ${var.domain}         → ${var.origin_ip} (proxied, CDN enabled)",
    "  www.${var.domain}     → ${var.origin_ip} (proxied, CDN enabled)",
    "  preview.${var.domain} → ${var.origin_ip} (direct, no CDN)",
    "",
    "To activate:",
    "1. Go to your Cloudflare dashboard and note the assigned nameservers",
    "2. Update nameservers at your domain registrar (e.g. AWS Route 53)",
    "3. Wait for propagation: dig ${var.domain} NS +short",
    "",
    "SSL: Full (strict) — Cloudflare ↔ origin uses verified certificates",
    "MCP: /mcp* requests redirect to preview.${var.domain} (direct HTTPS)",
  ])
}
