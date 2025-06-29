import { MessageInterfacePlugin, PluginInitializationError } from "@brains/plugin-utils";
import type { MessageContext } from "@brains/plugin-utils";
import type { DefaultQueryResponse } from "@brains/types";
import type { Instance } from "ink";
import type { CLIConfig } from "./types";
import packageJson from "../package.json";

interface Command {
  name: string;
  description: string;
  usage?: string;
}

export class CLIInterface extends MessageInterfacePlugin<CLIConfig> {
  private inkApp: Instance | null = null;

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

  constructor(config: CLIConfig = {}) {
    super("cli", packageJson, config);
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
    if (!this.context) {
      throw new PluginInitializationError(
        this.id,
        "Plugin context not initialized",
        { method: "start" },
      );
    }
    this.context.logger.info("Starting CLI interface");

    try {
      // Use dynamic imports to ensure React isolation
      const [inkModule, reactModule, appModule] = await Promise.all([
        import("ink"),
        import("react"),
        import("./components/App"),
      ]);

      const { render } = inkModule;
      const React = reactModule.default;
      const App = appModule.default;

      // Ensure we're using React's createElement, not any bundled version
      const element = React.createElement(App, { interface: this });
      this.inkApp = render(element);

      // Handle process termination gracefully
      process.on("SIGINT", () => void this.stop());
      process.on("SIGTERM", () => void this.stop());
    } catch (error) {
      this.context.logger.error("Failed to start CLI interface", { error });
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.context) {
      this.context.logger.info("Stopping CLI interface");
    }

    if (this.inkApp) {
      this.inkApp.unmount();
      this.inkApp = null;
    }
  }

  protected async handleInput(
    input: string,
    context: MessageContext,
  ): Promise<string> {
    // Handle interface-specific commands
    if (input.startsWith("/")) {
      const localResponse = await this.handleLocalCommand(input, context);
      if (localResponse !== null) {
        return localResponse;
      }
    }

    // Everything else goes to Shell
    return this.processMessage(input, context);
  }

  protected async formatResponse(
    queryResponse: DefaultQueryResponse,
    _context: MessageContext,
  ): Promise<string> {
    // Use the shell:knowledge-query template's formatter
    if (!this.context) {
      throw new PluginInitializationError(
        this.id,
        "Plugin context not initialized",
        { method: "formatResponse" },
      );
    }
    return this.context.formatContent("shell:knowledge-query", queryResponse);
  }
}
