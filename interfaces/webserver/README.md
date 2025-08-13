# @brains/webserver

HTTP/WebSocket server interface for Personal Brain applications.

## Overview

This package provides a web server interface that exposes Brain functionality through REST APIs and WebSocket connections. It enables web-based clients and third-party integrations.

## Features

- RESTful API endpoints
- WebSocket real-time updates
- Static file serving
- CORS configuration
- Authentication middleware
- Rate limiting
- API documentation
- Health checks

## Installation

```bash
bun add @brains/webserver
```

## Usage

```typescript
import { WebServerInterface } from "@brains/webserver";

const webserver = new WebServerInterface({
  port: 3000,
  host: "localhost",
  cors: {
    origin: ["http://localhost:5173"],
    credentials: true,
  },
});

// Register with shell
await shell.registerPlugin(webserver);

// Server starts automatically
console.log("Server running at http://localhost:3000");
```

## Configuration

```typescript
interface WebServerConfig {
  port?: number; // Server port (default: 3000)
  host?: string; // Host binding (default: "localhost")
  staticDir?: string; // Static files directory
  apiPrefix?: string; // API route prefix (default: "/api")
  cors?: CorsOptions; // CORS configuration
  auth?: AuthConfig; // Authentication settings
  rateLimit?: RateLimitConfig; // Rate limiting
}
```

### Environment Variables

```bash
WEBSERVER_PORT=3000
WEBSERVER_HOST=0.0.0.0
WEBSERVER_API_KEY=your-api-key
WEBSERVER_STATIC_DIR=./public
```

## API Endpoints

### Entity Operations

```
GET    /api/entities          # List entities
POST   /api/entities          # Create entity
GET    /api/entities/:id      # Get entity
PUT    /api/entities/:id      # Update entity
DELETE /api/entities/:id      # Delete entity
GET    /api/entities/search   # Search entities
```

### Commands

```
POST   /api/commands          # Execute command
GET    /api/commands          # List available commands
```

### System

```
GET    /api/health            # Health check
GET    /api/status            # System status
GET    /api/plugins           # List plugins
```

## WebSocket API

Real-time updates via WebSocket:

```typescript
const ws = new WebSocket("ws://localhost:3000/ws");

ws.on("message", (data) => {
  const event = JSON.parse(data);

  switch (event.type) {
    case "entity:created":
    case "entity:updated":
    case "entity:deleted":
      updateUI(event.entity);
      break;
    case "job:progress":
      showProgress(event.progress);
      break;
  }
});

// Send commands
ws.send(
  JSON.stringify({
    type: "command",
    name: "search",
    params: { query: "typescript" },
  }),
);
```

## Authentication

### API Key

```typescript
const webserver = new WebServerInterface({
  auth: {
    type: "apikey",
    apiKey: process.env.API_KEY,
  },
});

// Client usage
fetch("http://localhost:3000/api/entities", {
  headers: {
    "X-API-Key": "your-api-key",
  },
});
```

### Bearer Token

```typescript
const webserver = new WebServerInterface({
  auth: {
    type: "bearer",
    validateToken: async (token) => {
      // Validate JWT or other token
      return isValid;
    },
  },
});
```

## CORS Configuration

```typescript
const webserver = new WebServerInterface({
  cors: {
    origin: [
      "http://localhost:5173", // Dev server
      "https://yourdomain.com", // Production
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  },
});
```

## Rate Limiting

Protect against abuse:

```typescript
const webserver = new WebServerInterface({
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: "Too many requests",
  },
});
```

## Static Files

Serve static content:

```typescript
const webserver = new WebServerInterface({
  staticDir: "./public",
  // Files served from http://localhost:3000/
});
```

## Error Handling

Standardized error responses:

```json
{
  "error": {
    "code": "ENTITY_NOT_FOUND",
    "message": "Entity with id 'xyz' not found",
    "status": 404
  }
}
```

## Middleware

Add custom middleware:

```typescript
webserver.use(async (req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  await next();
});
```

## Testing

```typescript
import { WebServerInterface } from "@brains/webserver";
import { TestClient } from "@brains/webserver/test";

const webserver = WebServerInterface.createFresh({
  port: 0, // Random port
});

const client = new TestClient(webserver);

// Test API calls
const response = await client.get("/api/entities");
expect(response.status).toBe(200);
```

## OpenAPI Documentation

Auto-generated API docs:

```typescript
// Access at http://localhost:3000/api/docs
const webserver = new WebServerInterface({
  openapi: {
    enabled: true,
    title: "Brain API",
    version: "1.0.0",
  },
});
```

## Exports

- `WebServerInterface` - Main interface plugin class
- `Router` - Express-like router
- `TestClient` - Testing utilities
- Middleware functions
- Type definitions

## License

MIT
