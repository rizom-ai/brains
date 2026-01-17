# Cloudflare Web Analytics Module
#
# Provisions Cloudflare Web Analytics for privacy-friendly website tracking.
# Outputs site_tag for API queries and tracking_script for site injection.
#
# Usage:
#   module "cloudflare_analytics" {
#     source = "./modules/cloudflare-analytics"
#
#     cloudflare_account_id = var.cloudflare_account_id
#     cloudflare_api_token  = var.cloudflare_api_token
#     domain                = var.domain
#   }

# Web Analytics site
# For domains NOT on Cloudflare DNS, use host parameter
resource "cloudflare_web_analytics_site" "main" {
  account_id   = var.cloudflare_account_id
  host         = var.domain
  auto_install = false # We inject manually via site-builder for more control
}
