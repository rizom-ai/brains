#!/bin/bash
# Test script for MCP server using the official MCP inspector

echo "🧠 Brain MCP Server Test"
echo "========================"
echo ""
echo "This script will test the Brain MCP server using the MCP inspector."
echo "Make sure you have the MCP CLI installed:"
echo "  npm install -g @modelcontextprotocol/inspector"
echo ""
echo "Starting MCP inspector..."
echo ""

# Run the MCP inspector with our server
npx @modelcontextprotocol/inspector bun run examples/brain-mcp-server.ts