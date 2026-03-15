# @brains/a2a

A2A (Agent-to-Agent) interface plugin. Enables brain instances to discover and communicate with each other using the [A2A protocol](https://a2a-protocol.org/latest/specification/).

## What it does

- Serves an **Agent Card** at `/.well-known/agent-card.json` for discovery
- Accepts **JSON-RPC 2.0** requests at `/a2a` (message/send, tasks/get, tasks/cancel)
- Routes tasks through AgentService for AI-powered responses
- Provides an **a2a_call** tool for calling remote A2A agents

## Configuration

```yaml
# brain.yaml
plugins:
  a2a:
    port: 3334
    domain: yeehaa.io
    organization: rizom.ai
```

## Testing with A2A Inspector

The [A2A Inspector](https://github.com/a2aproject/a2a-inspector) is the official debugging tool for A2A agents (like MCP Inspector for MCP).

### Run with Docker

```bash
git clone https://github.com/a2aproject/a2a-inspector
cd a2a-inspector
docker build -t a2a-inspector .
docker run -d --network=host a2a-inspector uv run -- uvicorn app:app --host 0.0.0.0 --port 5001
```

Open `http://localhost:5001` and connect to `http://localhost:3334`.

### Manual testing

```bash
# Fetch Agent Card
curl http://localhost:3334/.well-known/agent-card.json | jq

# Send a message
curl -X POST http://localhost:3334/a2a \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "test-1",
        "role": "user",
        "parts": [{"kind": "text", "text": "Hello, what can you do?"}]
      }
    }
  }'
```
