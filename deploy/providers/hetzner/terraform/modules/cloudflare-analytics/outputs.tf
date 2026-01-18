output "site_tag" {
  value       = cloudflare_web_analytics_site.main.site_tag
  description = "Site tag for API queries"
}

output "site_token" {
  value       = cloudflare_web_analytics_site.main.site_token
  description = "Site token for tracking script"
  sensitive   = true
}

output "tracking_script" {
  value       = "<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{\"token\": \"${cloudflare_web_analytics_site.main.site_token}\"}'></script>"
  description = "Cloudflare Web Analytics tracking script for site-builder injection"
}
