# Route53 DNS Automation Module

This module provides **optional** AWS Route53 DNS automation for automatically configuring DNS records to point to your CDN or origin server.

## Features

- ✅ **Optional**: Completely disabled unless `ROUTE53_ZONE_ID` is set
- ✅ **Automatic**: DNS records auto-configured, no manual DNS updates needed
- ✅ **CDN-aware**: Automatically points to CDN when enabled, origin when disabled
- ✅ **WWW subdomain**: Automatically creates www.yourdomain.com → yourdomain.com
- ✅ **Preview subdomain**: Optional preview.yourdomain.com → origin IP
- ✅ **Updates automatically**: DNS changes when you enable/disable CDN

## How It Works

### Without CDN (Direct to origin):

```
yourdomain.com     → A record → 1.2.3.4 (origin IP)
www.yourdomain.com → CNAME → yourdomain.com
preview.yourdomain.com → A record → 1.2.3.4
```

### With CDN enabled:

```
yourdomain.com     → CNAME → yourapp.b-cdn.net
www.yourdomain.com → CNAME → yourdomain.com
preview.yourdomain.com → A record → 1.2.3.4 (direct to origin)
```

### WWW Redirect Behavior

When a user visits `www.yourdomain.com`:

1. DNS resolves through CNAME chain to CDN (or origin)
2. CDN (or origin) receives request with Host: www.yourdomain.com
3. Caddy returns 301 permanent redirect to `yourdomain.com`
4. Browser follows redirect to apex domain

This consolidates SEO value to the apex domain (modern best practice).

## Configuration

### 1. Get Route53 Zone ID

Find your hosted zone ID in AWS Console:

1. Go to: https://console.aws.amazon.com/route53/
2. Click "Hosted zones"
3. Click your domain name
4. Copy the "Hosted zone ID" (e.g., `Z1234567890ABC`)

### 2. Configure AWS Credentials

Route53 requires AWS API access. Choose one method:

**Option A: Environment Variables (Recommended)**

```bash
# Add to config.env
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

**Option B: AWS Profile**

```bash
# If you use ~/.aws/credentials
AWS_PROFILE=your-profile-name
```

**Option C: IAM Role** (if running on AWS)
No credentials needed - Terraform will use the instance role.

### 3. Enable DNS Automation

Add to your `config.env`:

```bash
# Required
DOMAIN=yourdomain.com
ROUTE53_ZONE_ID=Z1234567890ABC

# Optional
AWS_REGION=us-east-1  # Defaults to us-east-1
PREVIEW_SUBDOMAIN=preview  # Defaults to "preview", set to "" to disable
```

### 4. Run Terraform

```bash
cd deploy/providers/hetzner/terraform
terraform apply
```

Terraform will:

- Create DNS A record (or CNAME if CDN enabled) for your domain
- Create CNAME for www.yourdomain.com → yourdomain.com
- Create A record for preview.yourdomain.com (if enabled)
- Update records automatically when CDN is enabled/disabled

### 5. Verify DNS

Wait 1-5 minutes for DNS propagation, then verify:

```bash
# Check main domain
dig yourdomain.com

# Check www subdomain
dig www.yourdomain.com

# Check preview subdomain
dig preview.yourdomain.com
```

## What You Get

### Automatic DNS Records

1. **Main domain**: `yourdomain.com`
   - Points to CDN hostname if CDN enabled
   - Points to origin IP if CDN disabled

2. **WWW subdomain**: `www.yourdomain.com`
   - Always points to main domain (CNAME)
   - Follows main domain's routing (CDN or origin)

3. **Preview subdomain**: `preview.yourdomain.com` (optional)
   - Always points directly to origin IP
   - Never goes through CDN (for testing before CDN)

### Automatic Updates

When you enable/disable CDN, DNS automatically updates:

```bash
# Initially (no CDN)
yourdomain.com → A → 1.2.3.4

# Enable CDN in config.env + terraform apply
yourdomain.com → CNAME → yourapp.b-cdn.net

# Disable CDN (remove BUNNY_API_KEY) + terraform apply
yourdomain.com → A → 1.2.3.4  # Back to origin
```

## Disable DNS Automation

Simply remove `ROUTE53_ZONE_ID` from `config.env` and run:

```bash
terraform apply
```

**Warning**: This will **destroy** the DNS records managed by Terraform. Make sure to manually recreate DNS records if needed, or Terraform will leave your domain unresolvable.

## AWS Permissions Required

The AWS credentials need these Route53 permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "route53:GetHostedZone",
        "route53:ListResourceRecordSets",
        "route53:ChangeResourceRecordSets"
      ],
      "Resource": "arn:aws:route53:::hostedzone/YOUR_ZONE_ID"
    }
  ]
}
```

You can use an IAM user with these permissions, or attach this policy to an IAM role.

## Cost

- **Route53 Hosted Zone**: $0.50/month
- **DNS Queries**: $0.40 per million queries (first 1 billion queries/month)
- **Typical cost**: ~$0.50-1.00/month for most sites

## Troubleshooting

### DNS records not created

1. **Check AWS credentials**: Ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set
2. **Check zone ID**: Verify ROUTE53_ZONE_ID matches your hosted zone ID
3. **Check permissions**: Ensure IAM user/role has Route53 permissions
4. **Check terraform output**: Look for errors in `terraform apply` output

### DNS pointing to wrong target

1. **Check CDN status**: Run `terraform output cdn_enabled` to verify CDN state
2. **Check DNS records**: Run `terraform output dns_records` to see what was created
3. **Wait for propagation**: DNS changes can take 1-5 minutes (TTL is 300 seconds)

### WWW not working

1. **Check DNS**: `dig www.yourdomain.com` should show CNAME to yourdomain.com
2. **Check origin**: Ensure your web server responds to both yourdomain.com and www.yourdomain.com
3. **Check SSL**: If using HTTPS, ensure SSL certificate covers both domains

### Preview subdomain not working

1. **Check enabled**: Verify PREVIEW_SUBDOMAIN is set in config.env
2. **Check DNS**: `dig preview.yourdomain.com` should show A record to origin IP
3. **Check origin**: Ensure Caddy is configured to respond to preview subdomain

## Alternatives

If you don't use Route53:

### Option A: Use another DNS provider's Terraform module

- **Cloudflare DNS**: `cloudflare_record` resource
- **DigitalOcean DNS**: `digitalocean_record` resource
- **Google Cloud DNS**: `google_dns_record_set` resource
- Many others available in Terraform Registry

### Option B: Manual DNS configuration

Just disable this module (don't set ROUTE53_ZONE_ID) and manually create DNS records in your DNS provider's dashboard. Use the terraform output to see what DNS records to create:

```bash
terraform output dns_status  # Shows DNS target
```

## Module Variables

See `variables.tf` for full list. Key variables:

- `route53_zone_id` (required for automation): Route53 hosted zone ID
- `domain` (required): Your domain name
- `origin_ip` (required): Origin server IP address
- `cdn_enabled` (auto-detected): Whether CDN is active
- `cdn_hostname` (auto-provided): CDN hostname if CDN enabled
- `preview_subdomain` (optional): Preview subdomain name (default: "preview")
- `dns_ttl` (optional): DNS TTL in seconds (default: 300)

## Outputs

- `dns_enabled`: Whether DNS automation is active
- `dns_records_created`: List of DNS records created
- `dns_target`: What DNS is pointing to (CDN or origin IP)

## More Information

- **AWS Route53 docs**: https://docs.aws.amazon.com/route53/
- **Terraform AWS provider**: https://registry.terraform.io/providers/hashicorp/aws
- **DNS best practices**: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/best-practices-dns.html
