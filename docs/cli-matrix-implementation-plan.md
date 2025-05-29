# CLI and Matrix Interfaces Implementation Plan

## Overview

This plan implements CLI and Matrix as interfaces that are loaded by the Brain App. The App acts as the entry point and orchestrator, managing the MCP server internally and activating the requested interface(s). Interfaces are thin UI layers that process user input and display responses.

## Architecture

```
┌─────────────────────────────────────────┐
│              Brain App                  │
│  ┌───────────────────────────────────┐  │
│  │         MCP Server (Shell)        │  │
│  └───────────────────────────────────┘  │
│                    │                    │
│  ┌─────────────────┴─────────────────┐  │
│  │         Interface Loader          │  │
│  └──────┬───────────────────┬────────┘  │
│         │                   │          │
│  ┌──────▼──────┐    ┌──────▼──────┐  │
│  │  CLI (Ink)  │    │   Matrix    │  │
│  └─────────────┘    └─────────────┘  │
└─────────────────────────────────────────┘
```

## Phase 1: Core Infrastructure (Week 1)

### 1.1 Update Interface Core Package (`packages/interface-core`)

**Purpose**: Base classes and utilities for all interfaces

```typescript
// packages/interface-core/src/base-interface.ts
export abstract class BaseInterface {
  protected logger: Logger;
  protected mcpServer: Server;
  protected queue: PQueue;

  constructor(context: InterfaceContext) {
    this.logger = context.logger;
    this.mcpServer = context.mcpServer;
    this.queue = new PQueue({
      concurrency: 1,
      interval: 1000,
      intervalCap: 10,
    });
  }

  protected async handleInput(
    input: string,
    context: MessageContext,
  ): Promise<string> {
    // Handle local commands first
    if (input.startsWith("/")) {
      const localResponse = await this.handleLocalCommand(input, context);
      if (localResponse !== null) {
        return localResponse;
      }
    }

    // Process through MCP server
    return this.processMessage(input, context);
  }

  protected abstract handleLocalCommand(
    command: string,
    context: MessageContext,
  ): Promise<string | null>;
  public abstract start(): Promise<void>;
  public abstract stop(): Promise<void>;
}
```

### 1.2 Shared Markdown Renderer

```typescript
// packages/interfaces-core/src/markdown/parser.ts
import { marked } from "marked";

export class MarkdownParser {
  parse(content: string): marked.TokensList {
    return marked.lexer(content);
  }
}

// packages/interfaces-core/src/markdown/renderer.ts
export interface MarkdownRenderer {
  render(tokens: marked.TokensList): string;
}
```

### 1.3 App Interface Loader

```typescript
// packages/app/src/interface-loader.ts
import type { BaseInterface } from "@brains/interface-core";
import type { InterfaceConfig } from "./types.js";

export class InterfaceLoader {
  private interfaces = new Map<string, BaseInterface>();

  async loadInterface(
    config: InterfaceConfig,
    context: InterfaceContext,
  ): Promise<BaseInterface> {
    switch (config.type) {
      case "cli":
        const { CLIInterface } = await import("@brains/cli");
        return new CLIInterface(context);

      case "matrix":
        const { MatrixInterface } = await import("@brains/matrix");
        return new MatrixInterface(context, config);

      default:
        throw new Error(`Unknown interface type: ${config.type}`);
    }
  }

  async startInterface(
    name: string,
    config: InterfaceConfig,
    context: InterfaceContext,
  ): Promise<void> {
    const interface = await this.loadInterface(config, context);
    this.interfaces.set(name, interface);
    await interface.start();
  }

  async stopAll(): Promise<void> {
    for (const [name, interface] of this.interfaces) {
      await interface.stop();
    }
    this.interfaces.clear();
  }
}
```

### 1.4 State Management via Brain

```typescript
// packages/interfaces-core/src/state.ts
export class InterfaceStateManager {
  constructor(private mcpClient: BrainMCPClient) {}

  async saveState(context: InterfaceContext, state: any): Promise<void> {
    await this.mcpClient.callTool({
      name: "interface_save_state",
      arguments: {
        interfaceType: context.interfaceType,
        contextId: context.contextId,
        state,
      },
    });
  }

  async loadState(context: InterfaceContext): Promise<any> {
    const result = await this.mcpClient.callTool({
      name: "interface_load_state",
      arguments: {
        interfaceType: context.interfaceType,
        contextId: context.contextId,
      },
    });
    return result.state;
  }
}
```

**Deliverables**:

- [ ] Package setup with TypeScript config
- [ ] MCP client wrapper with retry logic
- [ ] Markdown parser/renderer interfaces
- [ ] State management via Brain
- [ ] Unit tests with mocked MCP client

## Phase 2: CLI Interface (Week 2)

### 2.1 Create CLI Package (`packages/cli`)

```typescript
// packages/cli/src/cli-interface.ts
import { BaseInterface, InterfaceContext, MessageContext } from '@brains/interface-core';

export class CLIInterface extends BaseInterface {
  private inkApp: any; // Ink app instance

  constructor(context: InterfaceContext) {
    super(context);
  }

  protected async handleLocalCommand(command: string, context: MessageContext): Promise<string | null> {
    switch (command) {
      case '/help':
        return this.getHelpText();
      case '/clear':
        this.clearScreen();
        return '';
      case '/exit':
        await this.stop();
        return 'Goodbye!';
      default:
        return null; // Let Shell handle it
    }
  }

  private getHelpText(): string {
    return `Available commands:
• /help - Show this help message
• /clear - Clear the screen
• /exit - Exit the CLI
• /context <name> - Switch context
• /search <query> - Search your knowledge base`;
  }

  public async start(): Promise<void> {
    const { render } = await import('ink');
    const { default: App } = await import('./components/App.js');

    this.inkApp = render(<App interface={this} />);
  }

  public async stop(): Promise<void> {
    this.inkApp?.unmount();
  }
}

// packages/cli/src/components/App.tsx
import React, { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import type { CLIInterface } from '../cli-interface.js';

interface Props {
  interface: CLIInterface;
}

export default function App({ interface }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { exit } = useApp();

  const handleSubmit = async (query: string) => {
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: query }]);

    const context: MessageContext = {
      userId: 'cli-user',
      channelId: 'terminal',
      messageId: Date.now().toString(),
      timestamp: new Date(),
    };

    try {
      const response = await interface.handleInput(query, context);
      if (query === '/exit') {
        exit();
        return;
      }
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'error',
        content: `Error: ${error.message}`
      }]);
    }

    setIsLoading(false);
    setInput('');
  };

  return (
    <Box flexDirection="column" height="100%">
      <MessageList messages={messages} />
      <Box marginTop={1}>
        {isLoading ? (
          <Text>
            <Spinner type="dots" /> Thinking...
          </Text>
        ) : (
          <Box>
            <Text bold color="green">❯ </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
```

### 2.2 CLI Markdown Renderer

```typescript
// packages/cli/src/renderer.ts
import chalk from "chalk";
import { highlight } from "cli-highlight";
import { MarkdownRenderer } from "@brains/interfaces-core";

export class CLIMarkdownRenderer implements MarkdownRenderer {
  render(tokens: marked.TokensList): string {
    return tokens.map((token) => this.renderToken(token)).join("");
  }

  private renderToken(token: marked.Token): string {
    switch (token.type) {
      case "heading":
        return chalk.bold.underline(token.text) + "\n\n";

      case "paragraph":
        return token.text + "\n\n";

      case "code":
        return highlight(token.text, { language: token.lang }) + "\n\n";

      case "list":
        return (
          token.items.map((item) => `  • ${item.text}`).join("\n") + "\n\n"
        );

      case "blockquote":
        return chalk.dim("│ ") + token.text + "\n\n";

      case "strong":
        return chalk.bold(token.text);

      case "em":
        return chalk.italic(token.text);

      case "link":
        return chalk.blue.underline(token.text);

      default:
        return token.raw;
    }
  }
}
```

### 2.3 CLI Features

```typescript
// packages/cli/src/features/history.ts
export class CommandHistory {
  private history: string[] = [];
  private index = -1;

  add(command: string): void {
    this.history.push(command);
    this.index = this.history.length;
  }

  previous(): string | undefined {
    if (this.index > 0) this.index--;
    return this.history[this.index];
  }

  next(): string | undefined {
    if (this.index < this.history.length - 1) this.index++;
    return this.history[this.index];
  }
}

// packages/cli/src/features/shortcuts.ts
export const shortcuts: Record<string, string> = {
  "/help": "Show available commands",
  "/clear": "Clear the screen",
  "/history": "Show command history",
  "/exit": "Exit the CLI",
};
```

**Deliverables**:

- [ ] Ink-based CLI application
- [ ] CLI-specific markdown renderer
- [ ] Command history
- [ ] Keyboard shortcuts
- [ ] Error handling with nice formatting
- [ ] Package.json with bin entry for `brain` command

## Phase 3: Matrix Interface (Week 3-4)

### 3.1 Create Matrix Package (`packages/matrix`)

```typescript
// packages/matrix/src/matrix-interface.ts
import {
  MatrixClient,
  SimpleFsStorageProvider,
  AutojoinRoomsMixin,
  RichReply,
  RustSdkCryptoStorageProvider,
} from "matrix-bot-sdk";
import {
  BaseInterface,
  InterfaceContext,
  MessageContext,
} from "@brains/interface-core";

export class MatrixInterface extends BaseInterface {
  private client: MatrixClient;
  private config: MatrixConfig;

  constructor(context: InterfaceContext, config: MatrixConfig) {
    super(context);
    this.config = config;
  }

  protected async handleLocalCommand(
    command: string,
    context: MessageContext,
  ): Promise<string | null> {
    // Matrix doesn't have many local commands, most go to Brain
    switch (command) {
      case "/help":
        return `Available commands:
• /help - Show this help message
• /context <name> - Switch context
• /search <query> - Search your knowledge base
• /remind <time> <message> - Set a reminder`;
      default:
        return null; // Let Shell handle it
    }
  }

  public async start(): Promise<void> {
    // Setup storage
    const storage = new SimpleFsStorageProvider(this.config.storageFile);
    const crypto = new RustSdkCryptoStorageProvider(
      this.config.cryptoStorageDir,
    );

    // Create client
    this.client = new MatrixClient(
      this.config.homeserver,
      this.config.accessToken,
      storage,
      crypto,
    );

    // Setup crypto if enabled
    if (this.client.crypto) {
      await this.client.crypto.prepare();
    }

    // Auto-join rooms
    AutojoinRoomsMixin.setupOnClient(this.client);

    // Setup message handler
    this.client.on("room.message", this.handleMatrixMessage.bind(this));

    // Start syncing
    await this.client.start();
    this.logger.info("Matrix interface started!");
  }

  private async handleMatrixMessage(roomId: string, event: any): Promise<void> {
    // Ignore own messages
    if (event.sender === (await this.client.getUserId())) return;

    // Ignore non-text messages
    if (event.content?.msgtype !== "m.text") return;

    // Queue message processing
    await this.queue.add(() => this.processMatrixMessage(roomId, event));
  }

  private async processMatrixMessage(
    roomId: string,
    event: any,
  ): Promise<void> {
    const context: MessageContext = {
      userId: event.sender,
      channelId: roomId,
      messageId: event.event_id,
      threadId: event.content?.["m.relates_to"]?.event_id,
      timestamp: new Date(event.origin_server_ts),
    };

    try {
      // Send typing indicator
      await this.client.sendTyping(roomId, true, 30000);

      // Process through base handler
      const response = await this.handleInput(event.content.body, context);

      // Format and send response
      const html = await this.formatResponse(response);
      const reply = RichReply.createFor(roomId, event, response, html);

      await this.client.sendMessage(roomId, reply);
    } catch (error) {
      await this.sendError(roomId, event, error);
    } finally {
      await this.client.sendTyping(roomId, false);
    }
  }

  public async stop(): Promise<void> {
    await this.client?.stop();
  }
}
```

### 3.2 Matrix Markdown Renderer

```typescript
// packages/matrix/src/renderer.ts
import { marked } from "marked";
import { MarkdownRenderer } from "@brains/interfaces-core";

export class MatrixMarkdownRenderer implements MarkdownRenderer {
  render(tokens: marked.TokensList): string {
    // Use marked's built-in HTML renderer
    const renderer = new marked.Renderer();

    // Customize for Matrix
    renderer.code = (code, lang) => {
      return `<pre><code class="language-${lang}">${this.escape(code)}</code></pre>`;
    };

    renderer.blockquote = (quote) => {
      return `<blockquote>${quote}</blockquote>`;
    };

    // Matrix supports most HTML, so we can use the default renderer
    return marked.parser(tokens, { renderer });
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
```

### 3.3 Matrix-Specific Features

```typescript
// packages/matrix/src/features/threading.ts
export class ThreadManager {
  async createThread(
    client: MatrixClient,
    roomId: string,
    rootEvent: any,
    response: string,
  ): Promise<void> {
    await client.sendMessage(roomId, {
      msgtype: "m.text",
      body: response,
      format: "org.matrix.custom.html",
      formatted_body: this.renderer.render(response),
      "m.relates_to": {
        event_id: rootEvent.event_id,
        rel_type: "m.thread",
        is_falling_back: true,
        "m.in_reply_to": {
          event_id: rootEvent.event_id,
        },
      },
    });
  }
}

// packages/matrix/src/features/reactions.ts
export class ReactionHandler {
  async addThinkingReaction(
    client: MatrixClient,
    roomId: string,
    eventId: string,
  ): Promise<void> {
    await client.sendEvent(roomId, "m.reaction", {
      "m.relates_to": {
        rel_type: "m.annotation",
        event_id: eventId,
        key: "🤔",
      },
    });
  }
}
```

**Deliverables**:

- [ ] Matrix bot with rate limiting
- [ ] E2E encryption support
- [ ] Rich HTML formatting
- [ ] Thread support
- [ ] Reaction feedback
- [ ] Error handling with fallbacks

## Phase 4: Shell Extensions (Week 5)

### 4.1 Add Interface State Entity Type

```typescript
// packages/shell/src/entity/interfaceState.ts
export const interfaceStateSchema = baseEntitySchema.extend({
  entityType: z.literal("interface_state"),
  interface: z.enum(["cli", "matrix", "slack"]),
  contextId: z.string(),
  state: z.record(z.any()),
  lastActive: z.string().datetime(),
});

export const interfaceStateAdapter: EntityAdapter<InterfaceState> = {
  entityType: "interface_state",
  schema: interfaceStateSchema,

  toMarkdown: (entity) => {
    return `---
interface: ${entity.interface}
contextId: ${entity.contextId}
lastActive: ${entity.lastActive}
---

${JSON.stringify(entity.state, null, 2)}`;
  },

  fromMarkdown: (markdown) => {
    const { frontmatter, content } = parseMarkdown(markdown);
    return {
      ...frontmatter,
      state: JSON.parse(content),
    };
  },
};
```

### 4.2 Add Interface Tools

```typescript
// packages/shell/src/mcp/tools/interface-tools.ts
export const interfaceTools = [
  {
    name: "interface_save_state",
    description: "Save interface state",
    inputSchema: z.object({
      interfaceType: z.enum(["cli", "matrix"]),
      contextId: z.string(),
      state: z.record(z.any()),
    }),
    handler: async (args) => {
      const entity = await entityService.upsert({
        entityType: "interface_state",
        id: `${args.interfaceType}:${args.contextId}`,
        ...args,
        lastActive: new Date().toISOString(),
      });
      return { success: true, entity };
    },
  },

  {
    name: "interface_load_state",
    description: "Load interface state",
    inputSchema: z.object({
      interfaceType: z.enum(["cli", "matrix"]),
      contextId: z.string(),
    }),
    handler: async (args) => {
      const id = `${args.interfaceType}:${args.contextId}`;
      const entity = await entityService.get(id);
      return { state: entity?.state || {} };
    },
  },
];
```

## Phase 5: Testing Strategy (Week 6)

### 5.1 Unit Tests with Mocks

```typescript
// packages/cli/test/cli.test.ts
import { render } from 'ink-testing-library';
import { CLI } from '../src/app';

describe('CLI', () => {
  const mockMCPClient = {
    connect: mock(() => Promise.resolve()),
    query: mock(() => Promise.resolve('Test response')),
    disconnect: mock(() => Promise.resolve()),
  };

  it('should process queries', async () => {
    const { stdin, lastFrame } = render(<CLI client={mockMCPClient} />);

    // Type a query
    stdin.write('What is TypeScript?');
    stdin.write('\r'); // Enter

    // Wait for response
    await delay(100);

    expect(mockMCPClient.query).toHaveBeenCalledWith(
      'What is TypeScript?',
      expect.objectContaining({ interfaceType: 'cli' })
    );

    expect(lastFrame()).toContain('Test response');
  });
});
```

### 5.2 Integration Tests

```typescript
// packages/integration-tests/test/interfaces/matrix.integration.test.ts
import { MatrixTestHelper } from "../helpers/matrix-test-helper";

describe(
  "Matrix Integration",
  () => {
    let helper: MatrixTestHelper;

    beforeAll(async () => {
      helper = await MatrixTestHelper.create();
    }, 30000);

    afterAll(async () => {
      await helper.cleanup();
    });

    it("should respond to messages", async () => {
      const response = await helper.sendMessage("Hello brain!");
      expect(response).toContain("Hello");
    });
  },
  {
    // Only run when INTEGRATION_TEST=true
    skip: process.env.INTEGRATION_TEST !== "true",
  },
);
```

### 5.3 Test Helper for Matrix

```typescript
// packages/integration-tests/test/helpers/matrix-test-helper.ts
export class MatrixTestHelper {
  private testClient: MatrixClient;
  private testRoomId: string;

  static async create(): Promise<MatrixTestHelper> {
    // Start Synapse in Docker
    await this.startSynapse();

    // Create test user and room
    const helper = new MatrixTestHelper();
    await helper.setup();
    return helper;
  }

  private static async startSynapse(): Promise<void> {
    // Use testcontainers or docker-compose
  }

  async sendMessage(text: string): Promise<string> {
    // Send message and wait for bot response
  }

  async cleanup(): Promise<void> {
    // Stop containers, cleanup
  }
}
```

## Phase 6: Documentation & Launch (Week 7)

### 6.1 User Documentation

- **CLI Guide**: Installation, commands, shortcuts
- **Matrix Bot Guide**: Setup, commands, permissions
- **Configuration Guide**: Environment variables, options

### 6.2 Developer Documentation

- **Interface Development Guide**: How to add new interfaces
- **Testing Guide**: Running tests, adding new tests
- **Architecture Overview**: How interfaces interact with Brain

### 6.3 Examples

```typescript
// Start Brain with CLI interface
import { App } from "@brains/app";

await App.run({
  name: "my-brain",
  version: "1.0.0",
  interface: { type: "cli" },
  database: "./brain.db",
  aiApiKey: process.env.OPENAI_API_KEY,
});

// Start Brain with Matrix interface
await App.run({
  name: "brain-matrix-bot",
  version: "1.0.0",
  interface: {
    type: "matrix",
    homeserver: "https://matrix.org",
    accessToken: process.env.MATRIX_ACCESS_TOKEN,
    userId: "@mybot:matrix.org",
  },
  database: "./brain.db",
  aiApiKey: process.env.OPENAI_API_KEY,
});

// Custom interface implementation
import { BaseInterface } from "@brains/interface-core";

class CustomInterface extends BaseInterface {
  // ... implementation
}

await App.run({
  name: "brain-custom",
  version: "1.0.0",
  customInterface: new CustomInterface(context),
  database: "./brain.db",
  aiApiKey: process.env.OPENAI_API_KEY,
});
```

```bash
# Development
npm run test           # Unit tests only
npm run test:integration  # With INTEGRATION_TEST=true

# Run directly
npx @brains/app --interface cli
npx @brains/app --interface matrix --config matrix.json
```

## Timeline Summary

- **Week 1**: Core infrastructure (shared package)
- **Week 2**: CLI implementation with Ink
- **Week 3-4**: Matrix bot implementation
- **Week 5**: Shell extensions for interface state
- **Week 6**: Testing and debugging
- **Week 7**: Documentation and polish

## Success Metrics

- [ ] CLI responds in < 200ms for simple queries
- [ ] Matrix bot handles 10+ concurrent rooms
- [ ] 80%+ code coverage with unit tests
- [ ] Integration tests pass reliably
- [ ] Both interfaces share 90%+ of core logic
- [ ] Clear documentation with examples

## Next Steps

1. Create `packages/interfaces-core` directory
2. Set up TypeScript and dependencies
3. Implement MCP client wrapper
4. Start with CLI as it's simpler
5. Use learnings from CLI to build Matrix interface
