# SSL and CDN Deployment Plan for Test-Brain App

## Executive Summary

This document outlines two primary approaches for adding SSL certificates and CDN capabilities to the test-brain application currently deployed on Hetzner Cloud at `91.99.153.102:3333`.

### Current State

- **Infrastructure**: Hetzner Cloud VM running Docker
- **Application**: Personal Brain app exposed on port 3333
- **Security**: HTTP only, no SSL/TLS encryption
- **Access**: Direct IP access, no domain configured

### Recommended Approaches

1. **Caddy (Self-Hosted)**: Maximum privacy and control
2. **Cloudflare**: Ease of use with global CDN

### Decision Criteria

- **Privacy requirements**: How important is data sovereignty?
- **Technical expertise**: Comfort with self-hosting vs managed services
- **Performance needs**: Local vs global content distribution
- **Budget**: Free options available for both

## Option 1: Caddy (Self-Hosted)

### Architecture Overview

```
[User] -> [Domain] -> [Caddy:443] -> [Personal-Brain:3333]
                           |
                      [Auto SSL/TLS]
```

### Advantages

- **Privacy**: Complete control, no third-party traffic inspection
- **Simplicity**: Automatic HTTPS with zero configuration
- **Cost**: Free (only server costs)
- **Flexibility**: Easy to customize and extend

### Disadvantages

- **No CDN**: Content served from single location
- **Maintenance**: You manage updates and security
- **DDoS Protection**: Limited to basic rate limiting

### Implementation Steps

#### Step 1: Update Docker Compose

```yaml
version: "3.8"

services:
  personal-brain:
    build:
      context: ../..
      dockerfile: deploy/docker/runtime/Dockerfile
    image: personal-brain:latest
    container_name: personal-brain
    # Remove external port exposure
    # ports:
    #   - "3333:3333"
    expose:
      - "3333"
    volumes:
      - brain-data:/app/data
      - brain-repo:/app/brain-repo
      - brain-website:/app/website
    environment:
      - DATABASE_URL=file:/app/data/brain.db
      - DATA_DIR=/app/data
      - BRAIN_REPO_PATH=/app/brain-repo
      - PUBLIC_WEBSITE_PATH=/app/website
      - NODE_ENV=production
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3333/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
    networks:
      - brain-network

  caddy:
    image: caddy:2-alpine
    container_name: caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    environment:
      - DOMAIN=${DOMAIN:-brain.example.com}
    restart: unless-stopped
    depends_on:
      - personal-brain
    networks:
      - brain-network

volumes:
  brain-data:
  brain-repo:
  brain-website:
  caddy_data:
  caddy_config:

networks:
  brain-network:
    driver: bridge
```

#### Step 2: Create Caddyfile

```caddyfile
{$DOMAIN} {
    # Enable compression
    encode gzip

    # Reverse proxy to application
    reverse_proxy personal-brain:3333 {
        # Health check
        health_uri /health
        health_interval 30s
        health_timeout 5s

        # Headers
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    # Security headers
    header {
        # HSTS
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"

        # Prevent clickjacking
        X-Frame-Options "DENY"

        # Prevent MIME sniffing
        X-Content-Type-Options "nosniff"

        # XSS protection
        X-XSS-Protection "1; mode=block"

        # Referrer policy
        Referrer-Policy "strict-origin-when-cross-origin"

        # Remove server header
        -Server
    }

    # Logging
    log {
        output file /data/access.log {
            roll_size 10mb
            roll_keep 10
        }
    }
}
```

#### Step 3: Configure Environment

```bash
# Create .env file
echo "DOMAIN=brain.yourdomain.com" >> deploy/docker/.env
```

#### Step 4: Update Firewall Rules

```hcl
# In terraform/main.tf, add HTTPS rules
resource "hcloud_firewall" "main" {
  name = "${var.app_name}-firewall"

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}
```

#### Step 5: Deploy

```bash
# SSH to server
ssh root@91.99.153.102

# Navigate to deployment directory
cd /opt/personal-brain/deploy/docker

# Pull latest changes
git pull

# Deploy with Caddy
docker-compose down
docker-compose up -d

# Check logs
docker-compose logs -f caddy
```

### Maintenance Tasks

- Monitor Caddy logs for SSL renewal
- Update Caddy image periodically
- Review security headers quarterly
- Monitor disk space for logs

## Option 2: Cloudflare

### Architecture Overview

#### 2A: Cloudflare Tunnels (Recommended)

```
[User] -> [Cloudflare Edge] -> [Cloudflare Tunnel] -> [Personal-Brain:3333]
              |                         |
         [SSL/CDN/DDoS]          [Encrypted Tunnel]
```

#### 2B: Traditional CDN

```
[User] -> [Cloudflare CDN] -> [Your Server:443] -> [Personal-Brain:3333]
              |                      |
         [SSL/CDN/Cache]        [Origin SSL]
```

### Advantages

- **Global CDN**: Content cached at edge locations worldwide
- **DDoS Protection**: Enterprise-grade protection included
- **Zero-Config SSL**: Automatic certificate management
- **Analytics**: Detailed traffic and security insights
- **No Port Exposure**: (Tunnels only) Enhanced security

### Disadvantages

- **Privacy**: Traffic passes through Cloudflare
- **Dependency**: Reliance on third-party service
- **Cost**: Free tier limitations, paid features

### Implementation: Cloudflare Tunnels

#### Step 1: Create Cloudflare Account and Add Domain

1. Sign up at https://cloudflare.com
2. Add your domain
3. Update nameservers at your registrar

#### Step 2: Create Tunnel

```bash
# On Cloudflare Dashboard
# 1. Go to Zero Trust > Access > Tunnels
# 2. Create a tunnel named "test-brain"
# 3. Copy the tunnel token
```

#### Step 3: Update Docker Compose

```yaml
version: "3.8"

services:
  personal-brain:
    build:
      context: ../..
      dockerfile: deploy/docker/runtime/Dockerfile
    image: personal-brain:latest
    container_name: personal-brain
    expose:
      - "3333"
    volumes:
      - brain-data:/app/data
      - brain-repo:/app/brain-repo
      - brain-website:/app/website
    environment:
      - DATABASE_URL=file:/app/data/brain.db
      - DATA_DIR=/app/data
      - BRAIN_REPO_PATH=/app/brain-repo
      - PUBLIC_WEBSITE_PATH=/app/website
      - NODE_ENV=production
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3333/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
    networks:
      - brain-network

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    restart: unless-stopped
    depends_on:
      - personal-brain
    networks:
      - brain-network

volumes:
  brain-data:
  brain-repo:
  brain-website:

networks:
  brain-network:
    driver: bridge
```

#### Step 4: Configure Tunnel Routing

```yaml
# In Cloudflare Dashboard, configure public hostname:
# - Subdomain: brain
# - Domain: yourdomain.com
# - Service: http://personal-brain:3333
```

#### Step 5: Deploy

```bash
# Add tunnel token to .env
echo "CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token-here" >> deploy/docker/.env

# Deploy
docker-compose down
docker-compose up -d

# Check tunnel status
docker logs cloudflared
```

### Cloudflare Configuration Options

#### Caching Rules

```
# Page Rules (Free tier: 3 rules)
1. brain.yourdomain.com/api/* - Cache Level: Bypass
2. brain.yourdomain.com/static/* - Cache Level: Standard, Edge TTL: 1 month
3. brain.yourdomain.com/* - Cache Level: Standard, Edge TTL: 1 hour
```

#### Security Settings

- **SSL/TLS**: Full (strict)
- **Always Use HTTPS**: On
- **Automatic HTTPS Rewrites**: On
- **Min TLS Version**: 1.2

## Comparison Analysis

### Feature Comparison

| Feature                 | Caddy         | Cloudflare Tunnels | Cloudflare CDN |
| ----------------------- | ------------- | ------------------ | -------------- |
| **SSL Certificate**     | Let's Encrypt | Cloudflare         | Cloudflare     |
| **Certificate Renewal** | Automatic     | Automatic          | Automatic      |
| **Global CDN**          | ❌            | ✅                 | ✅             |
| **DDoS Protection**     | Basic         | Advanced           | Advanced       |
| **WebSocket Support**   | ✅            | ✅                 | ✅             |
| **Traffic Analytics**   | Basic logs    | Detailed           | Detailed       |
| **Port Exposure**       | 80/443        | None               | 80/443         |
| **Configuration**       | Simple        | Simple             | Moderate       |
| **Privacy**             | Full control  | CF processes       | CF processes   |

### Cost Analysis

| Component        | Caddy | Cloudflare Free | Cloudflare Pro |
| ---------------- | ----- | --------------- | -------------- |
| **SSL**          | Free  | Free            | Free           |
| **CDN**          | N/A   | Limited         | Unlimited      |
| **DDoS**         | N/A   | Basic           | Advanced       |
| **Analytics**    | N/A   | Basic           | Advanced       |
| **Monthly Cost** | $0    | $0              | $25            |

### Performance Comparison

| Metric                    | Caddy     | Cloudflare        |
| ------------------------- | --------- | ----------------- |
| **TTFB (Same Region)**    | 10-50ms   | 20-100ms          |
| **TTFB (Global)**         | 100-500ms | 20-100ms          |
| **Static Asset Delivery** | Good      | Excellent         |
| **Dynamic Content**       | Direct    | +10-30ms overhead |

## Decision Framework

### Choose Caddy When:

- Privacy is paramount
- You want full control
- Traffic is regional
- You're comfortable with Linux administration
- You want to avoid third-party dependencies

### Choose Cloudflare When:

- You need global performance
- DDoS protection is important
- You want detailed analytics
- Easy setup is prioritized
- You're okay with traffic inspection

### Hybrid Approach

Consider using Caddy for SSL termination with Cloudflare in DNS-only mode:

- Get Cloudflare's DDoS protection
- Maintain SSL control with Caddy
- No traffic inspection by Cloudflare

## Implementation Timeline

### Phase 1: Basic SSL (Day 1)

- [ ] Choose approach (Caddy or Cloudflare)
- [ ] Configure DNS records
- [ ] Deploy chosen solution
- [ ] Verify SSL works

### Phase 2: Optimization (Day 2-3)

- [ ] Configure caching rules
- [ ] Set up monitoring
- [ ] Test performance
- [ ] Document configuration

### Phase 3: Production (Day 4-5)

- [ ] Update application URLs
- [ ] Configure redirects
- [ ] Monitor for issues
- [ ] Plan maintenance schedule

## Testing and Validation

### SSL Certificate Testing

```bash
# Check certificate
openssl s_client -connect brain.yourdomain.com:443 -servername brain.yourdomain.com

# Test SSL Labs
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=brain.yourdomain.com
```

### Performance Testing

```bash
# Test TTFB
curl -w "@curl-format.txt" -o /dev/null -s https://brain.yourdomain.com

# Load testing
ab -n 1000 -c 10 https://brain.yourdomain.com/
```

### Security Headers

```bash
# Check headers
curl -I https://brain.yourdomain.com

# Security scanner
# Visit: https://securityheaders.com/?q=brain.yourdomain.com
```

## Rollback Procedures

### Caddy Rollback

```bash
# Revert to direct access
docker-compose stop caddy
docker-compose up -d personal-brain

# Update docker-compose.yml to expose port 3333
# Restart with exposed port
```

### Cloudflare Rollback

```bash
# Disable tunnel in Cloudflare dashboard
# Or remove cloudflared container
docker-compose stop cloudflared
docker-compose rm cloudflared

# Switch to DNS-only mode in Cloudflare
```

## Monitoring and Maintenance

### Caddy Monitoring

- Check certificate expiry: `docker exec caddy caddy list-certificates`
- Monitor logs: `docker logs caddy --tail 100 -f`
- Disk usage: `df -h /var/lib/docker/volumes/`

### Cloudflare Monitoring

- Dashboard: Analytics, Security Events
- Tunnel health: Zero Trust dashboard
- API monitoring: Use Cloudflare API for automation

## Conclusion

Both Caddy and Cloudflare offer reliable SSL solutions with different trade-offs:

- **Caddy**: Choose for privacy, simplicity, and control
- **Cloudflare**: Choose for global performance, protection, and features

Start with the option that best matches your immediate needs. Both solutions allow migration to the other approach if requirements change.

## Next Steps

1. Review this plan and choose your preferred approach
2. Prepare DNS records and domain configuration
3. Follow the implementation steps for your chosen option
4. Test thoroughly before switching production traffic
5. Document any customizations for future reference
