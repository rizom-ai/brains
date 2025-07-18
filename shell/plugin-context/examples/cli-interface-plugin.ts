import type {
  InterfacePlugin,
  InterfacePluginContext,
  PluginCapabilities,
} from "../src";

/**
 * Example CLI Interface Plugin
 * Tests InterfacePluginContext capabilities:
 * - Everything from Core (messaging, templates, logging)
 * - Command discovery to show available commands
 * - Daemon registration for long-running CLI server
 * - Job monitoring for status updates
 */
export const cliInterfacePlugin: InterfacePlugin = {
  id: "cli-interface",
  version: "1.0.0",
  type: "interface",
  description:
    "Simple CLI interface demonstrating Interface plugin capabilities",

  async register(context: InterfacePluginContext): Promise<PluginCapabilities> {
    // Register templates for CLI output formatting
    context.registerTemplates({
      "command-list": {
        name: "command-list",
        description: "Format command list for CLI display",
        generate: async (data: {
          commands: Array<{ name: string; description: string }>;
        }) => {
          return data.commands
            .map((cmd) => `  ${cmd.name.padEnd(20)} ${cmd.description}`)
            .join("\n");
        },
      },
      "job-status": {
        name: "job-status",
        description: "Format job status for CLI display",
        generate: async (data: { jobs: any[] }) => {
          return data.jobs
            .map((job) => `[${job.id}] ${job.type} - ${job.status}`)
            .join("\n");
        },
      },
    });

    // Register daemon for CLI server
    context.registerDaemon("cli-server", {
      start: async () => {
        context.logger.info("CLI interface daemon starting...");
        // In a real implementation, this would start a CLI server
        // For now, we'll just log that we're running
      },
      stop: async () => {
        context.logger.info("CLI interface daemon stopping...");
      },
      healthCheck: async () => {
        return {
          status: "healthy" as const,
          message: "CLI interface is running",
          lastCheck: new Date(),
          details: {
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage().heapUsed,
          },
        };
      },
    });

    // Subscribe to messages from other plugins
    context.subscribe("command:executed", async (message) => {
      context.logger.info("Command executed", message);
      // Could update CLI display with command results
    });

    context.logger.info(
      "CLI interface plugin registered with all InterfacePluginContext features tested",
    );

    // Return capabilities - interface plugins provide commands for user interaction
    return {
      tools: [], // Interface plugins don't expose tools
      resources: [], // Interface plugins don't expose resources
      commands: [
        {
          name: "help",
          description: "Show available commands",
          usage: "help [command]",
          handler: async (args) => {
            if (args.length === 0) {
              // Get all available commands from the system
              const commandList = await context.listCommands();

              return `Available commands:\n${context.formatContent(
                "command-list",
                {
                  commands: commandList.map((cmd) => ({
                    name: cmd.name,
                    description: cmd.description || "No description",
                  })),
                },
              )}`;
            }

            // Show help for specific command
            const commandName = args[0];
            const commandList = await context.listCommands();
            const commandInfo = commandList.find(
              (cmd) => cmd.name === commandName,
            );

            if (!commandInfo) {
              return `Command not found: ${commandName}`;
            }

            return `${commandInfo.name}: ${commandInfo.description || "No description"}\nUsage: ${commandInfo.usage || commandInfo.name}`;
          },
        },
        {
          name: "status",
          description: "Show system status",
          usage: "status",
          handler: async () => {
            const activeJobs = await context.getActiveJobs();
            const activeBatches = await context.getActiveBatches();

            let status = "System Status:\n";
            status += `Active Jobs: ${activeJobs.length}\n`;
            status += `Active Batches: ${activeBatches.length}\n`;

            if (activeJobs.length > 0) {
              status += "\nActive Jobs:\n";
              status += context.formatContent("job-status", {
                jobs: activeJobs,
              });
            }

            return status;
          },
        },
        {
          name: "ask",
          description: "Ask a question about the knowledge base",
          usage: "ask <question>",
          handler: async (args) => {
            if (args.length === 0) {
              return "Please provide a question";
            }

            const question = args.join(" ");
            context.logger.info("Processing query", { question });

            try {
              // Use the query method to process the user's question
              const response = await context.query(question, {
                source: "cli",
                userId: "cli-user",
              });

              // Format the response for CLI display
              let output = response.message;

              if (response.sources && response.sources.length > 0) {
                output += "\n\nSources:";
                response.sources.forEach((source) => {
                  output += `\n- ${source.type} (${source.id})`;
                });
              }

              return output;
            } catch (error) {
              context.logger.error("Query failed", error);
              return "Sorry, I couldn't process your question.";
            }
          },
        },
        {
          name: "exit",
          description: "Exit the CLI interface",
          usage: "exit",
          handler: async () => {
            context.logger.info("User requested exit");
            // In a real implementation, this would trigger interface shutdown
            return "Goodbye!";
          },
        },
      ],
    };
  },

  async start(): Promise<void> {
    // Start the CLI interface
    console.log("Starting CLI interface...");
    // In a real implementation, this would initialize readline, create the CLI UI, etc.
  },

  async stop(): Promise<void> {
    // Stop the CLI interface
    console.log("Stopping CLI interface...");
    // In a real implementation, this would clean up resources, close connections, etc.
  },
};
