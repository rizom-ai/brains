import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginTool,
  PluginResource,
} from "@brains/plugin-utils";
import type { Command } from "@brains/message-interface";
import { z } from "zod";

/**
 * Options for creating a mock plugin
 */
export interface MockPluginOptions {
  id?: string;
  packageName?: string;
  version?: string;
  description?: string;
  tools?: PluginTool[];
  resources?: PluginResource[];
  commands?: Command[];
  onRegister?: (context: PluginContext) => Promise<void> | void;
  onShutdown?: () => Promise<void> | void;
}

/**
 * Create a mock plugin for testing
 */
export function createMockPlugin(options: MockPluginOptions = {}): Plugin {
  const plugin: Plugin & { shutdown?: () => Promise<void> } = {
    id: options.id ?? "mock-plugin",
    packageName: options.packageName ?? "@test/mock-plugin",
    version: options.version ?? "1.0.0",
    description: options.description ?? "A mock plugin for testing",

    async register(context: PluginContext): Promise<PluginCapabilities> {
      // Call custom registration handler if provided
      if (options.onRegister) {
        await options.onRegister(context);
      }

      return {
        tools: options.tools ?? [],
        resources: options.resources ?? [],
        commands: options.commands ?? [],
      };
    },
  };

  // Add shutdown if handler provided
  if (options.onShutdown) {
    const shutdownHandler = options.onShutdown;
    plugin.shutdown = async (): Promise<void> => {
      await shutdownHandler();
    };
  }

  return plugin;
}

/**
 * Create a mock tool for testing
 */
export function createMockTool(
  name: string,
  options: {
    description?: string;
    inputSchema?: z.ZodRawShape;
    handler?: (input: unknown) => Promise<unknown>;
  } = {},
): PluginTool {
  return {
    name,
    description: options.description ?? `Mock tool: ${name}`,
    inputSchema: options.inputSchema ?? {},
    handler:
      options.handler ??
      (async (input): Promise<unknown> => ({ success: true, input })),
  };
}

/**
 * Create a mock resource for testing
 */
export function createMockResource(
  uri: string,
  options: {
    name?: string;
    description?: string;
    mimeType?: string;
    contents?: Array<{ text: string; uri: string; mimeType?: string }>;
  } = {},
): PluginResource {
  return {
    uri,
    name: options.name ?? uri,
    description: options.description ?? `Resource at ${uri}`,
    mimeType: options.mimeType ?? "text/plain",
    handler: async () => ({
      contents: options.contents ?? [
        {
          text: "Mock resource content",
          uri,
          mimeType: options.mimeType ?? "text/plain",
        },
      ],
    }),
  };
}

/**
 * Create a plugin that throws errors for testing error handling
 */
export function createErrorPlugin(options: {
  id?: string;
  errorOnRegister?: boolean;
  errorOnToolExecution?: boolean;
  errorMessage?: string;
}): Plugin {
  const errorMessage = options.errorMessage ?? "Mock error";

  return createMockPlugin({
    id: options.id ?? "error-plugin",
    packageName: "@test/error-plugin",
    description: "A plugin that throws errors for testing",

    ...(options.errorOnRegister && {
      onRegister: async (): Promise<void> => {
        throw new Error(errorMessage);
      },
    }),

    tools: options.errorOnToolExecution
      ? [
          createMockTool("error_tool", {
            description: "A tool that throws errors",
            handler: async (): Promise<never> => {
              throw new Error(errorMessage);
            },
          }),
        ]
      : [],
  });
}

/**
 * Create a plugin with progress reporting for testing
 */
export function createProgressPlugin(): Plugin {
  return createMockPlugin({
    id: "progress-plugin",
    packageName: "@test/progress-plugin",
    description: "A plugin with progress reporting",

    tools: [
      {
        name: "progress_tool",
        description: "A tool that reports progress",
        inputSchema: {
          steps: z.number().optional(),
          delay: z.number().optional(),
        },
        handler: async (input, context): Promise<unknown> => {
          const { steps = 5, delay = 100 } = input as {
            steps?: number;
            delay?: number;
          };

          if (context?.sendProgress) {
            for (let i = 0; i < steps; i++) {
              await context.sendProgress({
                progress: i + 1,
                total: steps,
                message: `Step ${i + 1} of ${steps}`,
              });

              // Simulate work
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }

          return { completed: true, steps };
        },
      },
    ],
  });
}
