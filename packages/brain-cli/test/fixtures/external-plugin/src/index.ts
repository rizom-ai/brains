import {
  ServicePlugin,
  createTool,
  toolSuccess,
  type PluginFactory,
  type ServicePluginContext,
  type Tool,
} from "@rizom/brain/plugins";
import { z } from "zod";

interface ExamplePluginConfig {
  greeting?: string;
}

const configSchema = z.object({
  greeting: z.optional(z.string()),
});

const packageJson = {
  name: "@rizom/brain-plugin-example-fixture",
  version: "0.1.0",
  description: "External plugin fixture for public API compile tests",
};

export class ExampleExternalPlugin extends ServicePlugin<ExamplePluginConfig> {
  private readonly greeting: string;

  constructor(config: Partial<ExamplePluginConfig> = {}) {
    super("example-external", packageJson, config, configSchema);
    this.greeting = config.greeting ?? "hello";
  }

  protected override async onRegister(
    _context: ServicePluginContext,
  ): Promise<void> {}

  protected override async onReady(
    _context: ServicePluginContext,
  ): Promise<void> {}

  protected override async getTools(): Promise<Tool[]> {
    return [
      createTool({
        name: "example_external_greet",
        description: "Return a greeting from the external plugin fixture.",
        inputSchema: {
          name: z.optional(z.string()),
        },
        handler: (args: unknown) => {
          const name =
            typeof args === "object" && args && "name" in args
              ? String(args.name)
              : "world";
          return toolSuccess({ message: `${this.greeting}, ${name}` });
        },
      }),
    ];
  }
}

export const plugin: PluginFactory = (config) =>
  new ExampleExternalPlugin(config);

export default plugin;
