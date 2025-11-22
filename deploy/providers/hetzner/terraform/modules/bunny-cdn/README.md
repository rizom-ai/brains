# Bunny.net CDN Module

This module provides **optional** Bunny.net CDN integration for privacy-friendly edge analytics and performance optimization.

## Features

- ✅ **Privacy-first**: IP anonymization enabled by default
- ✅ **Optional**: Completely disabled unless `BUNNY_API_KEY` is set
- ✅ **GDPR Compliant**: EU-based (Slovenia), no US jurisdiction
- ✅ **Affordable**: ~$1-4/month for typical traffic
- ✅ **Edge Analytics**: Built-in privacy-friendly analytics dashboard
- ✅ **Auto SSL**: Let's Encrypt certificates auto-provisioned
- ✅ **Global**: 114+ PoPs worldwide

## How It Works

```
User → yourdomain.com (DNS → Bunny) → Bunny CDN → Hetzner Server → Caddy → App
                                       ↑
                          Collects analytics with privacy

WWW Redirect:
User → www.yourdomain.com → Bunny CDN → Caddy → 301 redirect → yourdomain.com
```

### WWW Subdomain Behavior

The module automatically configures `www.yourdomain.com`:

1. Bunny CDN accepts requests for both `yourdomain.com` and `www.yourdomain.com`
2. Caddy performs a 301 permanent redirect: `www.yourdomain.com` → `yourdomain.com`
3. This consolidates SEO value to the apex domain (modern best practice)

## Configuration

### 1. Enable CDN (Optional)

Add to your `config.env`:

```bash
# Required for CDN
BUNNY_API_KEY=your-api-key-here

# Required for custom hostname
DOMAIN=yourdomain.com
```

Get API key: https://dash.bunny.net/account/settings

### 2. Run Terraform

```bash
cd deploy/providers/hetzner/terraform
terraform apply
```

Terraform will:

- Create Bunny Pull Zone pointing to your Hetzner server
- Configure custom hostname (your domain)
- Enable privacy settings (IP anonymization)
- Output DNS configuration instructions

### 3. Update DNS

Point your domain to the CDN:

```
yourdomain.com → CNAME → yourapp.b-cdn.net
```

Or use the DNS instructions from terraform output:

```bash
terraform output dns_instructions
```

### 4. Wait for SSL

Bunny auto-provisions SSL certificates via Let's Encrypt. This takes 2-10 minutes after DNS propagation.

## What You Get

### Edge Analytics

Access analytics at: https://dash.bunny.net

- **Request metrics**: Total requests, unique visitors, bandwidth
- **Geographic data**: Country-level distribution
- **Cache performance**: Hit/miss ratios
- **Privacy-friendly**: Last IP octet anonymized by default

### Performance Benefits

- **Global caching**: Static assets cached at 114+ locations
- **SSL termination**: Handled at edge (faster)
- **Bandwidth savings**: Reduced origin traffic

## Disable CDN

Simply remove `BUNNY_API_KEY` from `config.env` and run:

```bash
terraform apply
```

Terraform will destroy CDN resources and revert to direct serving.

## Cost

- **Disabled**: $0
- **Enabled**: ~$1-4/month for 10-50GB traffic
- **Pricing**: $0.01/GB (Standard tier)

## Privacy & Security

### Privacy Features

- **IP anonymization**: Last octet removed (e.g., 192.168.1.x)
- **No data selling**: Explicit company policy
- **EU jurisdiction**: Protected from CLOUD Act
- **GDPR compliant**: Full compliance by default

### Security

- **DDoS protection**: Automatic at edge
- **SSL/TLS**: TLS 1.2+ only (old versions disabled)
- **Origin shield**: Optional (currently disabled)

## Architecture Details

### Origin Configuration

- **Origin URL**: `https://DOMAIN` (if provided) or `http://SERVER_IP`
- **Origin host header**: `DOMAIN` (if provided) or `SERVER_IP`
- **Protocol**: HTTPS to origin if domain configured, HTTP if IP only

### Geographic Distribution

All geographic zones enabled by default:

- ✅ North America
- ✅ Europe
- ✅ Asia
- ✅ South America
- ✅ Africa

### Caching

- **Cache slice**: Enabled (better performance for large files)
- **Smart cache**: Enabled (automatic optimization)
- **Error caching**: Disabled (don't cache 5xx errors)

## Troubleshooting

### CDN not working

1. **Check DNS**: `dig yourdomain.com` should show Bunny CNAME
2. **Check SSL**: Wait 2-10 minutes for Let's Encrypt provisioning
3. **Check origin**: Ensure your server responds to DOMAIN hostname

### Analytics not showing

1. **Wait**: Analytics can take 5-10 minutes to appear
2. **Check traffic**: CDN must receive traffic to show analytics
3. **Check dashboard**: https://dash.bunny.net

### Origin errors

If you see 5xx errors from CDN:

1. **Check Caddy**: Ensure Caddy is running and configured for DOMAIN
2. **Check firewall**: Hetzner firewall allows ports 80/443
3. **Check origin**: Test `curl http://SERVER_IP` or `curl https://DOMAIN`

## Alternatives

If you don't want CDN:

- **Server-side analytics**: Enable Caddy access logs + GoAccess
- **Client-side analytics**: Implement Umami (planned, not yet implemented)
- **No analytics**: Just disable CDN and run without analytics

## Module Variables

See `variables.tf` for full list. Key variables:

- `bunny_api_key` (required): Bunny.net API key
- `app_name` (required): Used as Pull Zone name
- `origin_ip` (required): Hetzner server IP
- `domain` (optional): Custom domain for CDN
- `enable_logging` (optional): Enable analytics logging (default: true)

## Outputs

- `cdn_enabled`: Whether CDN is active
- `cdn_hostname`: CDN hostname (your domain or .b-cdn.net)
- `cdn_url`: Full HTTPS URL
- `custom_hostname_configured`: Whether custom domain is set

## More Information

- **Bunny.net docs**: https://docs.bunny.net
- **Terraform provider**: https://registry.terraform.io/providers/BunnyWay/bunnynet
- **Privacy policy**: https://bunny.net/privacy
