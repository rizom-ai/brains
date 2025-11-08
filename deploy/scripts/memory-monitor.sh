#!/usr/bin/env bash
# Smart memory monitor - checks container memory and restarts if threshold exceeded
# Add to crontab: 0 */6 * * * /opt/personal-brain/memory-monitor.sh >> /var/log/memory-monitor.log 2>&1
# This runs every 6 hours

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/personal-brain}"
MEMORY_THRESHOLD="${MEMORY_THRESHOLD:-75}" # Restart if container uses >75% of available memory
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

echo "$LOG_PREFIX Memory monitor check starting..."

# Navigate to app directory
cd "$APP_DIR"

# Get container memory usage in MB
CONTAINER_MEM=$(docker stats --no-stream --format "{{.MemUsage}}" personal-brain 2>/dev/null | awk '{print $1}' | sed 's/GiB/*1024/;s/MiB//;s/KiB\/1024/' | bc 2>/dev/null || echo "0")

# Get container memory limit in MB
CONTAINER_LIMIT=$(docker stats --no-stream --format "{{.MemUsage}}" personal-brain 2>/dev/null | awk '{print $3}' | sed 's/GiB/*1024/;s/MiB//;s/KiB\/1024/' | bc 2>/dev/null || echo "3726")

# Calculate percentage
if [ "$CONTAINER_LIMIT" -gt 0 ]; then
    MEMORY_PERCENT=$(echo "scale=2; ($CONTAINER_MEM / $CONTAINER_LIMIT) * 100" | bc)
    MEMORY_PERCENT_INT=$(echo "$MEMORY_PERCENT" | cut -d. -f1)
else
    MEMORY_PERCENT_INT=0
fi

echo "$LOG_PREFIX Container memory: ${CONTAINER_MEM}MB / ${CONTAINER_LIMIT}MB (${MEMORY_PERCENT}%)"

# Check if threshold exceeded
if [ "$MEMORY_PERCENT_INT" -ge "$MEMORY_THRESHOLD" ]; then
    echo "$LOG_PREFIX ⚠️  Memory usage ${MEMORY_PERCENT}% exceeds threshold ${MEMORY_THRESHOLD}%"
    echo "$LOG_PREFIX Triggering container restart to free memory..."

    # Log detailed stats before restart
    echo "$LOG_PREFIX Full stats before restart:"
    docker stats --no-stream || true

    # Restart the application container
    echo "$LOG_PREFIX Restarting personal-brain container..."
    docker compose restart personal-brain

    # Wait for health check
    echo "$LOG_PREFIX Waiting for container to become healthy..."
    sleep 10

    for i in {1..30}; do
        HEALTH=$(docker inspect --format='{{.State.Health.Status}}' personal-brain 2>/dev/null || echo "unknown")
        if [ "$HEALTH" = "healthy" ]; then
            echo "$LOG_PREFIX ✓ Container is healthy!"
            break
        fi
        echo "$LOG_PREFIX Waiting for health check... ($i/30) Status: $HEALTH"
        sleep 2
    done

    # Log memory after restart
    AFTER_MEM=$(docker stats --no-stream --format "{{.MemUsage}}" personal-brain 2>/dev/null | awk '{print $1}')
    echo "$LOG_PREFIX Memory after restart: $AFTER_MEM"
    echo "$LOG_PREFIX Restart complete - memory freed successfully"
else
    echo "$LOG_PREFIX ✓ Memory usage ${MEMORY_PERCENT}% is below threshold ${MEMORY_THRESHOLD}%"
    echo "$LOG_PREFIX No action needed"
fi

echo "$LOG_PREFIX Memory monitor check complete"
echo ""
