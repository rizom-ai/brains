# Route53 DNS Automation Module
# Automatically creates DNS records pointing to CDN or origin server

locals {
  # DNS automation enabled if zone ID is provided
  dns_enabled = var.route53_zone_id != ""

  # Determine DNS target for main domain
  # If CDN is enabled, point to CDN hostname (.b-cdn.net), otherwise point to origin IP
  dns_target = var.cdn_enabled && var.cdn_hostname != "" ? var.cdn_hostname : var.origin_ip
  dns_type   = var.cdn_enabled && var.cdn_hostname != "" ? "CNAME" : "A"
}

# Main domain record (yourdomain.com)
resource "aws_route53_record" "main" {
  count = local.dns_enabled && var.domain != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.domain
  type    = local.dns_type
  ttl     = var.dns_ttl

  records = [local.dns_target]
}

# WWW subdomain (www.yourdomain.com → yourdomain.com)
resource "aws_route53_record" "www" {
  count = local.dns_enabled && var.domain != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = "www.${var.domain}"
  type    = "CNAME"
  ttl     = var.dns_ttl

  records = [var.domain]
}

# Optional: Preview subdomain (preview.yourdomain.com → origin IP)
# Preview always points directly to origin, never through CDN
resource "aws_route53_record" "preview" {
  count = local.dns_enabled && var.preview_subdomain != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = "${var.preview_subdomain}.${var.domain}"
  type    = "A"
  ttl     = var.dns_ttl

  records = [var.origin_ip]
}
