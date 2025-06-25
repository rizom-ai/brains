import {
  BaseInterface,
  type InterfaceContext,
  type MessageContext,
} from "@brains/interface-core";
import { EventEmitter } from "node:events";
import type { Instance } from "ink";
import type { CLIConfig } from "./types.js";

interface Command {
  name: string;
  description: string;
  usage?: string;
}

export class CLIInterface extends BaseInterface {
  private inkApp: Instance | null = null;
  private readonly config: CLIConfig;
  private eventEmitter = new EventEmitter();
  private sessionId = `cli-${Date.now()}`;

  private readonly localCommands: Command[] = [
    { name: "help", description: "Show this help message" },
    { name: "clear", description: "Clear the screen" },
    { name: "exit", description: "Exit the CLI" },
    { name: "quit", description: "Exit the CLI" },
    {
      name: "context",
      description: "Switch to a different context",
      usage: "/context <name>",
    },
    {
      name: "search",
      description: "Search your knowledge base",
      usage: "/search <query>",
    },
    {
      name: "list",
      description: "List entities (notes, tasks, etc.)",
      usage: "/list [type]",
    },
  ];

  constructor(context: InterfaceContext, config?: CLIConfig) {
    super(context);
    this.config = config ?? {};
  }

  protected async handleLocalCommand(
    command: string,
    _context: MessageContext,
  ): Promise<string | null> {
    const [cmd, ...args] = command.slice(1).split(" ");

    switch (cmd) {
      case "help":
        return this.getHelpText();
      case "clear":
        console.clear();
        return "";
      case "exit":
      case "quit":
        void this.stop().then(() => process.exit(0));
        return "Exiting...";
      case "context":
        if (args.length === 0) {
          const contextCmd = this.localCommands.find(
            (c) => c.name === "context",
          );
          return `Usage: ${contextCmd?.usage}`;
        }
        return null; // Let Shell handle context switching
      default:
        return null; // Let Shell handle unknown commands
    }
  }

  private getHelpText(): string {
    const shortcuts = this.config.shortcuts;
    const commandList = this.localCommands
      .map((cmd) => {
        const usage = cmd.usage ?? `/${cmd.name}`;
        return `• ${usage} - ${cmd.description}`;
      })
      .join("\n");

    let helpText = `Available commands:
${commandList}

Type any message to interact with the brain.`;

    if (shortcuts && Object.keys(shortcuts).length > 0) {
      const shortcutList = Object.entries(shortcuts)
        .map(([key, value]) => `• ${key} → ${value}`)
        .join("\n");
      helpText += `\n\nShortcuts:\n${shortcutList}`;
    }

    return helpText;
  }

  public async start(): Promise<void> {
    this.logger.info("Starting CLI interface");

    try {
      const { render } = await import("ink");
      const React = await import("react");

      // Completely opaque import to prevent TypeScript from following the path
      const componentPath = "./components/App.js";
      const AppModule = await import(componentPath);
      const App = AppModule.default as any;

      this.inkApp = render(React.createElement(App, { interface: this }));

      // Handle process termination gracefully
      process.on("SIGINT", () => void this.stop());
      process.on("SIGTERM", () => void this.stop());
    } catch (error) {
      this.logger.error("Failed to start CLI interface", { error });
      throw error;
    }
  }

  public async stop(): Promise<void> {
    this.logger.info("Stopping CLI interface");

    if (this.inkApp) {
      this.inkApp.unmount();
      this.inkApp = null;
    }
  }

  public async processInput(input: string): Promise<void> {
    const context: MessageContext = {
      userId: "cli-user",
      channelId: this.sessionId,
      messageId: `msg-${Date.now()}`,
      timestamp: new Date(),
    };

    try {
      const response = await this.handleInput(input, context);
      // Response will be displayed by the Ink component
      this.eventEmitter.emit("response", response);
    } catch (error) {
      this.logger.error("Failed to process input", { error });
      this.eventEmitter.emit("error", error);
    }
  }

  // Event emitter methods for Ink component
  public on(event: string, listener: (...args: unknown[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  public off(event: string, listener: (...args: unknown[]) => void): void {
    this.eventEmitter.off(event, listener);
  }
}
