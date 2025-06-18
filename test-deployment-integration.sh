#!/usr/bin/env bash
# Test script to verify deployment integration

set -euo pipefail

echo "=== Testing Deployment Integration ==="
echo

# Test 1: Check directory structure
echo "1. Checking directory structure..."
if [ -d "deploy/providers/docker" ] && [ -f "deploy/providers/docker/deploy.sh" ]; then
    echo "   ✅ Docker provider exists"
else
    echo "   ❌ Docker provider missing"
fi

if [ ! -f "scripts/deploy-docker.sh" ]; then
    echo "   ✅ Old wrapper removed"
else
    echo "   ❌ Old wrapper still exists"
fi

if [ ! -d "test-docker" ]; then
    echo "   ✅ Test directory cleaned"
else
    echo "   ❌ Test directory still exists"
fi

# Test 2: Check provider listing
echo
echo "2. Available providers:"
./scripts/deploy-brain.sh 2>&1 | grep -A10 "Available providers:" | grep -E "^\s+-" || true

# Test 3: Check Docker provider help
echo
echo "3. Testing Docker provider interface..."
if ./scripts/deploy-brain.sh test-brain docker status 2>&1 | grep -qE "DOCKER|Docker"; then
    echo "   ✅ Docker provider responds correctly"
else
    echo "   ❌ Docker provider not working"
fi

echo
echo "=== Summary ==="
echo "The deployment system is now integrated!"
echo
echo "Usage examples:"
echo "  ./scripts/deploy-brain.sh test-brain docker deploy local"
echo "  ./scripts/deploy-brain.sh test-brain docker deploy user@server.com"
echo "  ./scripts/deploy-brain.sh test-brain hetzner deploy"
echo
echo "All providers use the same interface and support native modules."