import {
  MessageInterfacePlugin,
  PluginInitializationError,
} from "@brains/plugin-utils";
import type { MessageContext } from "@brains/plugin-utils";
import type { UserPermissionLevel } from "@brains/utils";
import type { Instance } from "ink";
import type { CLIConfig, CLIConfigInput } from "./types";
import { cliConfigSchema } from "./types";
import packageJson from "../package.json";

interface Command {
  name: string;
  description: string;
  usage?: string;
}

export class CLIInterface extends MessageInterfacePlugin<CLIConfigInput> {
  declare protected config: CLIConfig;
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

  constructor(config: CLIConfigInput = {}) {
    const defaults: Partial<CLIConfig> = {
      theme: {
        primaryColor: "#0066cc",
        accentColor: "#ff6600",
      },
      shortcuts: {},
    };

    super("cli", packageJson, config, cliConfigSchema, defaults);
  }

  /**
   * CLI interface users have anchor permissions since CLI access indicates local/trusted access
   */
  public override determineUserPermissionLevel(
    _userId: string,
  ): UserPermissionLevel {
    return "anchor";
  }

  public override async executeCommand(
    command: string,
    context: MessageContext,
  ): Promise<string> {
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
        // Let parent handle unknown commands (will delegate to shell)
        return super.executeCommand(command, context);
      default:
        // Let parent handle unknown commands
        return super.executeCommand(command, context);
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

    if (Object.keys(shortcuts).length > 0) {
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
    this.logger.info("Starting CLI interface");

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
}
