# Test Brain Application

The test-brain app is a minimal but complete brain implementation designed to validate the entire architecture. It serves as both a testing tool and a reference implementation.

## Purpose

1. **Architecture Validation**: Ensures all components work together correctly
2. **Integration Testing**: Tests the full stack from MCP server to entity storage
3. **Reference Implementation**: Shows how to build a brain app
4. **Development Tool**: Helps debug issues across the entire system

## Structure

```
apps/test-brain/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Main entry point
│   ├── app.ts            # Application setup
│   └── contexts/
│       └── test/         # Test context implementation
│           ├── index.ts
│           ├── entity.ts
│           ├── adapter.ts
│           └── service.ts
└── test/
    └── test-brain.test.ts
```

## Implementation

### Package Configuration

```json
// apps/test-brain/package.json
{
  "name": "@brains/test-brain",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun run src/index.ts",
    "build": "bun build src/index.ts --compile --outfile test-brain",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@brains/shell": "workspace:*",
    "@brains/mcp-server": "workspace:*",
    "@brains/utils": "workspace:*",
    "@libsql/client": "^0.14.0",
    "drizzle-orm": "^0.38.3"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.7.3"
  }
}
```

### Main Entry Point

```typescript
// apps/test-brain/src/index.ts
import { TestBrainApp } from "./app";
import { createLogger } from "@brains/utils";

async function main() {
  const logger = createLogger("test-brain");
  
  try {
    const app = new TestBrainApp({
      dbPath: process.env.TEST_DB_PATH || ":memory:",
      mcpPort: parseInt(process.env.MCP_PORT || "3000"),
      enableStdio: process.env.MCP_STDIO === "true",
      logLevel: process.env.LOG_LEVEL || "info",
    });
    
    await app.start();
    
    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      logger.info("Shutting down test-brain...");
      await app.stop();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error("Failed to start test-brain", error);
    process.exit(1);
  }
}

main();
```

### Application Setup

```typescript
// apps/test-brain/src/app.ts
import { Shell } from "@brains/shell";
import { MCPServer } from "@brains/mcp-server";
import { Logger, createLogger } from "@brains/utils";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { testContextPlugin } from "./contexts/test";
import { registerShellMCP } from "@brains/shell";

export interface TestBrainConfig {
  dbPath: string;
  mcpPort: number;
  enableStdio: boolean;
  logLevel: string;
}

export class TestBrainApp {
  private shell: Shell;
  private mcpServer: MCPServer;
  private logger: Logger;
  
  constructor(private config: TestBrainConfig) {
    this.logger = createLogger("TestBrainApp");
  }
  
  async start(): Promise<void> {
    // Initialize database
    const client = createClient({
      url: this.config.dbPath,
    });
    const db = drizzle(client);
    
    // Create mock services for testing
    const mockEmbeddingService = {
      generateEmbedding: async () => new Float32Array(384).fill(0.1),
      generateEmbeddings: async (texts: string[]) =>
        texts.map(() => new Float32Array(384).fill(0.1)),
    };
    
    const mockAIService = {
      generateObject: async (_sys: string, _user: string, schema: any) => ({
        object: schema.parse({
          answer: "Test response",
          summary: "Test summary",
        }),
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }),
      generateText: async () => ({
        text: "Test response",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }),
    };
    
    // Initialize shell
    this.shell = Shell.createFresh({
      db,
      logger: this.logger,
      embeddingService: mockEmbeddingService,
      aiService: mockAIService as any,
    });
    
    await this.shell.initialize();
    
    // Register test context
    await this.shell.registerPlugin(testContextPlugin);
    
    // Initialize MCP server
    this.mcpServer = MCPServer.createFresh({
      name: "Test Brain",
      version: "0.1.0",
    });
    
    // Register shell with MCP
    registerShellMCP(this.mcpServer.getServer(), this.shell);
    
    // Start MCP server
    if (this.config.enableStdio) {
      await this.mcpServer.startStdio();
    } else {
      await this.mcpServer.startHttp(this.config.mcpPort);
    }
    
    this.logger.info("Test brain started", {
      stdio: this.config.enableStdio,
      port: this.config.mcpPort,
    });
  }
  
  async stop(): Promise<void> {
    await this.mcpServer.stop();
    await this.shell.shutdown();
    this.logger.info("Test brain stopped");
  }
}
```

### Test Context Implementation

```typescript
// apps/test-brain/src/contexts/test/index.ts
import { ContextPlugin, PluginContext } from "@brains/shell";
import { testEntitySchema, TestEntityAdapter } from "./entity";
import { TestService } from "./service";

export const testContextPlugin: ContextPlugin = {
  id: "test-context",
  name: "Test Context",
  version: "1.0.0",
  description: "Minimal test context for test-brain",
  
  async register(context: PluginContext): Promise<void> {
    // Register entity type
    context.entityRegistry.registerEntityType(
      "test",
      testEntitySchema,
      new TestEntityAdapter(),
    );
    
    // Register service
    const service = new TestService(
      context.entityRegistry,
      context.logger.child("TestService"),
    );
    context.registry.register("TestService", service);
    
    // Register tools
    context.messageBus.registerHandler("tool:create-test", async (message) => {
      const { title, value } = message.payload as any;
      const entity = await service.createTestEntity(title, value);
      return {
        id: `response-${message.id}`,
        type: "response",
        timestamp: Date.now(),
        payload: { success: true, entity },
      };
    });
    
    context.logger.info("Test context registered");
  },
  
  async unregister(context: PluginContext): Promise<void> {
    context.registry.unregister("TestService");
    context.logger.info("Test context unregistered");
  },
};
```

## Usage

### Running the Test Brain

```bash
# Development mode
cd apps/test-brain
bun run dev

# With environment variables
TEST_DB_PATH=./test.db MCP_STDIO=true bun run dev

# Build executable
bun run build
./test-brain
```

### Testing with MCP Client

```bash
# List available tools
mcp-client tools

# Create a test entity
mcp-client call create-test '{"title": "Test", "value": "Hello World"}'

# Query test entities
mcp-client call brain_query '{"query": "show all test entities"}'
```

### Integration Tests

```typescript
// apps/test-brain/test/test-brain.test.ts
import { TestBrainApp } from "../src/app";
import { MCPClient } from "@modelcontextprotocol/sdk/client/index.js";

describe("Test Brain Integration", () => {
  let app: TestBrainApp;
  let client: MCPClient;
  
  beforeAll(async () => {
    app = new TestBrainApp({
      dbPath: ":memory:",
      mcpPort: 3001,
      enableStdio: false,
      logLevel: "error",
    });
    await app.start();
    
    // Connect MCP client
    client = new MCPClient({
      name: "test-client",
      version: "1.0.0",
    });
    await client.connect("http://localhost:3001");
  });
  
  afterAll(async () => {
    await client.close();
    await app.stop();
  });
  
  it("should create and query test entities", async () => {
    // Create entity
    const createResult = await client.callTool("create-test", {
      title: "Integration Test",
      value: "test-value",
    });
    
    expect(createResult.success).toBe(true);
    
    // Query entities
    const queryResult = await client.callTool("brain_query", {
      query: "test entities",
    });
    
    expect(queryResult.answer).toContain("Integration Test");
  });
});
```

## What It Validates

1. **Shell initialization and lifecycle**
2. **Plugin registration and context setup**
3. **Entity registration and validation**
4. **MCP server integration**
5. **Tool registration and execution**
6. **Query processing**
7. **Message bus communication**
8. **Database operations**
9. **Service registration**
10. **Graceful shutdown**

## Benefits

1. **Complete Stack Testing**: Tests all layers of the architecture
2. **Minimal Dependencies**: Uses mock services where appropriate
3. **Fast Execution**: Lightweight for rapid development
4. **Real Integration**: Actually runs the full brain stack
5. **Easy Debugging**: Simple enough to trace issues

## Future Enhancements

1. **Multiple Test Contexts**: Add more test contexts for complex scenarios
2. **Performance Testing**: Add benchmarking capabilities
3. **Error Injection**: Test error handling scenarios
4. **Metrics Collection**: Add observability for testing