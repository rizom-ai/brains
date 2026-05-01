import {
  EntityPlugin,
  InterfacePlugin,
  MessageInterfacePlugin,
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
  type InterfacePluginContext,
  type JobProgressEvent,
  type MessageSender,
  type PluginFactory,
  type ServicePluginContext,
  type Tool,
} from "@rizom/brain/plugins";
import type {
  BaseEntity,
  EntityAdapter,
  EntityTypeConfig,
} from "@rizom/brain/entities";
import type { WebRouteDefinition } from "@rizom/brain/interfaces";
import { z } from "zod";

interface ExamplePluginConfig {
  greeting?: string;
}

interface ExampleEntity extends BaseEntity<{ title: string }> {
  entityType: "example";
  metadata: { title: string };
}

const exampleEntitySchema: z.ZodSchema<ExampleEntity> = z.object({
  id: z.string(),
  entityType: z.literal("example"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  metadata: z.object({ title: z.string() }),
  contentHash: z.string(),
});

const exampleEntityAdapter: EntityAdapter<ExampleEntity, { title: string }> = {
  entityType: "example",
  schema: exampleEntitySchema,
  toMarkdown: (entity) => entity.content,
  fromMarkdown: (markdown) => ({ content: markdown }),
  extractMetadata: (entity) => entity.metadata,
  parseFrontMatter: (_markdown, schema) => schema.parse({ title: "Example" }),
  generateFrontMatter: (entity) => `title: ${entity.metadata.title}`,
  getBodyTemplate: () => "",
};

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

export class ExampleEntityPlugin extends EntityPlugin<ExampleEntity> {
  readonly entityType = "example";
  readonly schema = exampleEntitySchema;
  readonly adapter = exampleEntityAdapter;

  constructor() {
    super("example-entity", packageJson, {}, z.object({}));
  }

  protected override getEntityTypeConfig(): EntityTypeConfig {
    return { weight: 1 };
  }
}

export class ExampleInterfacePlugin extends InterfacePlugin {
  constructor() {
    super("example-interface", packageJson, {}, z.object({}));
  }

  protected override async onReady(
    context: InterfacePluginContext,
  ): Promise<void> {
    const response = await context.agent.chat("hello", "fixture", {
      interfaceType: "example",
      userPermissionLevel: "trusted",
    });
    AgentResponseSchema.parse(response);
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return [
      {
        path: "/example-external",
        public: true,
        handler: () => new Response("ok"),
      },
    ];
  }
}

export class ExampleMessageInterfacePlugin extends MessageInterfacePlugin {
  private readonly sentMessages: string[] = [];

  constructor() {
    super("example-message-interface", packageJson, {}, z.object({}));
  }

  protected sendMessageToChannel(
    channelId: string | null,
    message: string,
  ): void {
    this.sentMessages.push(`${channelId ?? "local"}:${message}`);
  }

  protected override sendMessageWithId(
    channelId: string | null,
    message: string,
  ): Promise<string | undefined> {
    this.sendMessageToChannel(channelId, message);
    return Promise.resolve("message-1");
  }

  protected override editMessage(
    _channelId: string,
    _messageId: string,
    _newMessage: string,
  ): Promise<boolean> {
    return Promise.resolve(true);
  }

  protected override supportsMessageEditing(): boolean {
    return true;
  }

  protected override async onProgressUpdate(
    event: JobProgressEvent,
  ): Promise<void> {
    void event.id;
  }

  public exerciseMessageHelpers(): void {
    this.trackAgentResponseForJob("job-1", "message-1", "channel-1");
    this.startProcessingInput("channel-1");
    this.endProcessingInput();
  }
}

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

export const plugin: PluginFactory = (config) => [
  new ExampleExternalPlugin(config),
  new ExampleEntityPlugin(),
  new ExampleInterfacePlugin(),
  new ExampleMessageInterfacePlugin(),
];

export default plugin;
