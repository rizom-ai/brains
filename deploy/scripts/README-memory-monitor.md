# Memory Monitor Script

Smart monitoring script that checks container memory usage and automatically restarts when threshold is exceeded.

## Features

- Checks container memory every 6 hours (configurable)
- Only restarts if memory usage exceeds 75% threshold (configurable)
- Waits for health check after restart
- Logs all actions for debugging
- Prevents unnecessary restarts when memory is healthy

## Installation

### 1. Deploy script to server

The script is automatically copied to `/opt/personal-brain/memory-monitor.sh` during deployment.

Or manually:

```bash
scp deploy/scripts/memory-monitor.sh root@SERVER_IP:/opt/personal-brain/
ssh root@SERVER_IP "chmod +x /opt/personal-brain/memory-monitor.sh"
```

### 2. Add to crontab

```bash
# SSH to server
ssh root@SERVER_IP

# Add cron job (runs every 6 hours)
crontab -e

# Add this line:
0 */6 * * * /opt/personal-brain/memory-monitor.sh >> /var/log/memory-monitor.log 2>&1
```

### Alternative frequencies:

```bash
# Every 4 hours
0 */4 * * * /opt/personal-brain/memory-monitor.sh >> /var/log/memory-monitor.log 2>&1

# Every 12 hours (twice daily)
0 */12 * * * /opt/personal-brain/memory-monitor.sh >> /var/log/memory-monitor.log 2>&1

# Daily at 3 AM
0 3 * * * /opt/personal-brain/memory-monitor.sh >> /var/log/memory-monitor.log 2>&1
```

## Configuration

Environment variables (set in crontab or script):

```bash
# Memory threshold (default: 75%)
MEMORY_THRESHOLD=75

# App directory (default: /opt/personal-brain)
APP_DIR=/opt/personal-brain
```

Example crontab with custom threshold:

```bash
0 */6 * * * MEMORY_THRESHOLD=80 /opt/personal-brain/memory-monitor.sh >> /var/log/memory-monitor.log 2>&1
```

## Monitoring

### View logs:

```bash
tail -f /var/log/memory-monitor.log
```

### Check if it's running:

```bash
crontab -l | grep memory-monitor
```

### Test manually:

```bash
/opt/personal-brain/memory-monitor.sh
```

### Force restart (override threshold):

```bash
MEMORY_THRESHOLD=0 /opt/personal-brain/memory-monitor.sh
```

## Log Output Examples

### Memory below threshold (no action):

```
[2025-11-07 12:00:00] Memory monitor check starting...
[2025-11-07 12:00:00] Container memory: 542MB / 3726MB (14.55%)
[2025-11-07 12:00:00] ✓ Memory usage 14.55% is below threshold 75%
[2025-11-07 12:00:00] No action needed
[2025-11-07 12:00:00] Memory monitor check complete
```

### Memory exceeds threshold (restart triggered):

```
[2025-11-07 18:00:00] Memory monitor check starting...
[2025-11-07 18:00:00] Container memory: 3104MB / 3726MB (83.30%)
[2025-11-07 18:00:00] ⚠️  Memory usage 83.30% exceeds threshold 75%
[2025-11-07 18:00:00] Triggering container restart to free memory...
[2025-11-07 18:00:01] Restarting personal-brain container...
[2025-11-07 18:00:15] ✓ Container is healthy!
[2025-11-07 18:00:16] Memory after restart: 124MiB
[2025-11-07 18:00:16] Restart complete - memory freed successfully
```

## Troubleshooting

### Script not running:

- Check crontab: `crontab -l`
- Check cron service: `systemctl status cron`
- Check script permissions: `ls -la /opt/personal-brain/memory-monitor.sh`

### Health check fails:

- Ensure app has `/health` endpoint
- Check docker-compose.yml has healthcheck configured
- Increase wait time in script if needed

### False positives:

- Increase `MEMORY_THRESHOLD` (e.g., 80% or 85%)
- Reduce check frequency to every 12 hours

## Recommended Setup

**Team-Brain (recall.rizom.ai):**

- Frequency: Every 6 hours
- Threshold: 75%
- Heavy workload justifies frequent checks

**Collective-Brain (public website):**

- Frequency: Every 12 hours
- Threshold: 80%
- Lighter workload, less frequent restarts needed
