import {
  ServicePlugin,
  createTool,
  toolSuccess,
  AgentResponseSchema,
  AppInfoSchema,
  BrainCharacterSchema,
  ConversationSchema,
  MessageSchema,
  type AgentResponse,
  type AppInfo,
  type BrainCharacter,
  type Conversation,
  type Message,
  type MessageResponse,
  type MessageSender,
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

const exampleSender: MessageSender<
  { value: number },
  { accepted: true }
> = async (_type, _payload, options) => {
  const response: MessageResponse<{ accepted: true }> = {
    success: options?.broadcast === true,
    data: { accepted: true },
  };
  return response;
};
void exampleSender;

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
    context: ServicePluginContext,
  ): Promise<void> {
    const character: BrainCharacter = BrainCharacterSchema.parse(
      context.identity.get(),
    );
    void character.values;

    const appInfo: AppInfo = AppInfoSchema.parse(await context.appInfo());
    const daemonHealthStatus:
      | "healthy"
      | "warning"
      | "error"
      | "unknown"
      | undefined = appInfo.daemons[0]?.health?.status;
    const daemonLastCheck: string | undefined =
      appInfo.daemons[0]?.health?.lastCheck;
    void daemonHealthStatus;
    void daemonLastCheck;

    const response: AgentResponse = AgentResponseSchema.parse({
      text: "ok",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    void response.text;

    const conversation = await context.conversations.get("fixture");
    if (conversation) {
      const parsed: Conversation = ConversationSchema.parse(conversation);
      void parsed.startedAt;
    }

    const messages = await context.conversations.getMessages("fixture");
    const parsedMessages: Message[] = messages.map((message) =>
      MessageSchema.parse(message),
    );
    void parsedMessages;
  }

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
