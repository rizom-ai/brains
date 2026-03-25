import { ServicePlugin, findEntityByIdentifier } from "@brains/plugins";
import { setCoverImageId } from "@brains/utils";
import type {
  PluginTool,
  PluginResource,
  BaseEntity,
  DefaultQueryResponse,
  SearchResult,
  BrainCharacter,
  AnchorProfile,
  AppInfo,
  BatchJobStatus,
  Batch,
  JobInfo,
  Conversation,
  Message,
  ServicePluginContext,
  ToolContext,
  JobOptions,
} from "@brains/plugins";
import {
  systemConfigSchema,
  type SystemConfig,
  type SearchOptions,
} from "./schemas";
import { createSystemTools } from "./tools";
import packageJson from "../package.json";

/**
 * System Plugin - Provides core system operations
 *
 * This plugin provides the fundamental operations for the brain system:
 * - Search: Direct entity search
 * - Query: AI-powered knowledge base query
 * - Get: Retrieve specific entities by ID
 * - Job Status: Monitor background operations
 */
export class SystemPlugin extends ServicePlugin<SystemConfig> {
  // After validation with defaults, config is complete
  declare protected config: SystemConfig;

  constructor(config: Partial<SystemConfig> = {}) {
    super("system", packageJson, config, systemConfigSchema);
  }

  /**
   * Register dashboard widgets after all plugins are ready
   *
   * We wait for system:plugins:ready to ensure the Dashboard plugin
   * has already subscribed to dashboard:register-widget messages.
   * This solves the timing issue where System plugin initializes
   * before Dashboard and widget messages would be lost.
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Subscribe to system:plugins:ready to register widgets AFTER Dashboard is listening
    context.messaging.subscribe("system:plugins:ready", async () => {
      this.logger.info(
        "system:plugins:ready received, registering dashboard widgets",
      );
      // Register entity stats widget
      await context.messaging.send("dashboard:register-widget", {
        id: "entity-stats",
        pluginId: this.id,
        title: "Entity Statistics",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => {
          const counts = await this.getEntityCounts();
          return {
            stats: Object.fromEntries(
              counts.map(({ entityType, count }) => [entityType, count]),
            ),
          };
        },
      });

      // Register brain character widget
      await context.messaging.send("dashboard:register-widget", {
        id: "character",
        pluginId: this.id,
        title: "Brain Character",
        section: "sidebar",
        priority: 5,
        rendererName: "IdentityWidget",
        dataProvider: async () => {
          const character = this.getIdentityData();
          return {
            name: character.name,
            role: character.role,
            purpose: character.purpose,
            values: character.values,
          };
        },
      });

      // Register anchor profile widget
      await context.messaging.send("dashboard:register-widget", {
        id: "profile",
        pluginId: this.id,
        title: "Anchor Profile",
        section: "sidebar",
        priority: 10,
        rendererName: "ProfileWidget",
        dataProvider: async () => {
          const profile = this.getProfileData();
          const links: Array<{ label: string; url: string }> = [];
          if (profile.website) {
            links.push({ label: "Website", url: profile.website });
          }
          if (profile.socialLinks) {
            for (const social of profile.socialLinks) {
              links.push({ label: social.platform, url: social.url });
            }
          }
          return {
            name: profile.name,
            description: profile.description,
            links: links.length > 0 ? links : undefined,
          };
        },
      });

      // Register system info widget
      await context.messaging.send("dashboard:register-widget", {
        id: "system-info",
        pluginId: this.id,
        title: "System",
        section: "sidebar",
        priority: 15,
        rendererName: "SystemWidget",
        dataProvider: async () => {
          const appInfo = await this.getAppInfo();
          const links: Array<{ label: string; url: string }> = [];

          // Site URL
          const profile = this.getProfileData();
          if (profile.website) {
            links.push({ label: "Site", url: profile.website });
          }

          // Preview URL from webserver
          const webserver = appInfo.interfaces.find((i) =>
            i.name.startsWith("webserver"),
          );
          const previewUrl = webserver?.health?.details?.["previewUrl"];
          if (typeof previewUrl === "string") {
            links.push({ label: "Preview", url: previewUrl });
          }

          // MCP endpoint URL
          const mcp = appInfo.interfaces.find((i) => i.name.startsWith("mcp"));
          const mcpUrl = mcp?.health?.details?.["url"];
          if (typeof mcpUrl === "string") {
            links.push({ label: "MCP", url: mcpUrl });
          }

          // Repo URL from git-sync
          const gitInfo = await context.messaging.send<
            Record<string, never>,
            { repo?: string; branch?: string }
          >("git-sync:get-repo-info", {});
          if (!("noop" in gitInfo) && gitInfo.success && gitInfo.data?.repo) {
            const repo = gitInfo.data.repo;
            const repoUrl = repo.startsWith("http")
              ? repo
              : `https://github.com/${repo}`;
            links.push({ label: "Repository", url: repoUrl });
          }

          return {
            version: appInfo.version,
            plugins: `${appInfo.plugins.length} active`,
            rendered: new Date().toLocaleString(),
            links: links.length > 0 ? links : undefined,
          };
        },
      });

      this.logger.debug("System plugin registered dashboard widgets");
      return { success: true };
    });

    // Register entity resource templates for MCP browsing
    context.resources.registerTemplate<"type">({
      name: "entity-list",
      uriTemplate: "entity://{type}",
      description: "List entities of a given type",
      mimeType: "application/json",
      list: async () => {
        const types = context.entityService.getEntityTypes();
        return types.map((t) => ({
          uri: `entity://${t}`,
          name: `${t} entities`,
        }));
      },
      complete: {
        type: async () => context.entityService.getEntityTypes(),
      },
      handler: async ({ type }) => {
        const availableTypes = context.entityService.getEntityTypes();
        if (!availableTypes.includes(type)) {
          throw new Error(
            `Unknown entity type: ${type}. Available: ${availableTypes.join(", ")}`,
          );
        }
        const entities = await context.entityService.listEntities(type);
        const items = entities.map((e) => ({
          id: e.id,
          entityType: e.entityType,
          ...e.metadata,
          updated: e.updated,
        }));
        return {
          contents: [
            {
              uri: `entity://${type}`,
              mimeType: "application/json",
              text: JSON.stringify(items, null, 2),
            },
          ],
        };
      },
    });

    context.resources.registerTemplate<"type" | "id">({
      name: "entity-detail",
      uriTemplate: "entity://{type}/{id}",
      description: "Read a single entity by type and ID",
      mimeType: "text/markdown",
      list: async () => {
        const types = context.entityService.getEntityTypes();
        const entries: Array<{ uri: string; name: string }> = [];
        for (const t of types) {
          const entities = await context.entityService.listEntities(t);
          for (const e of entities) {
            entries.push({
              uri: `entity://${t}/${e.id}`,
              name: `${t}/${e.id}`,
            });
          }
        }
        return entries;
      },
      complete: (() => {
        let lastType: string | undefined;
        return {
          type: async (value) => {
            const types = context.entityService.getEntityTypes();
            const matches = value
              ? types.filter((t) => t.startsWith(value))
              : types;
            if (matches.length === 1 && matches[0]) lastType = matches[0];
            return matches;
          },
          id: async () => {
            if (!lastType) return [];
            const entities = await context.entityService.listEntities(lastType);
            return entities.map((e) => e.id);
          },
        };
      })(),
      handler: async ({ type, id }) => {
        const entity = await context.entityService.getEntity(type, id);
        if (!entity) {
          throw new Error(`Entity not found: ${type}/${id}`);
        }
        return {
          contents: [
            {
              uri: `entity://${type}/${id}`,
              mimeType: "text/markdown",
              text: entity.content,
            },
          ],
        };
      },
    });

    // Register MCP prompts
    const entityTypes = () => context.entityService.getEntityTypes().join(", ");

    context.prompts.register({
      name: "create",
      description: "Create new content of any type",
      args: {
        type: {
          description: "Entity type (e.g. post, deck, note)",
          required: true,
        },
        topic: { description: "Topic or title for the content" },
      },
      handler: async ({ topic, type }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: topic
                ? `Create a new ${type} about: ${topic}`
                : `Create a new ${type}. Ask me what it should be about.`,
            },
          },
        ],
      }),
    });

    context.prompts.register({
      name: "generate",
      description: "AI-generate content with a prompt",
      args: {
        type: { description: `Entity type (${entityTypes()})`, required: true },
        topic: { description: "What to generate", required: true },
      },
      handler: async ({ type, topic }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Generate a ${type} about: ${topic}`,
            },
          },
        ],
      }),
    });

    context.prompts.register({
      name: "review",
      description: "Review and improve existing content",
      args: {
        type: { description: "Entity type", required: true },
        id: { description: "Entity ID or slug", required: true },
      },
      handler: async ({ type, id }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Review my ${type} "${id}". Read it first, then give me specific feedback on structure, clarity, and impact. Suggest concrete improvements.`,
            },
          },
        ],
      }),
    });

    context.prompts.register({
      name: "publish",
      description: "Publish content — preview, confirm, and publish",
      args: {
        type: { description: "Entity type", required: true },
        id: { description: "Entity ID or slug", required: true },
      },
      handler: async ({ type, id }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I want to publish my ${type} "${id}". Show me a preview first, then publish it.`,
            },
          },
        ],
      }),
    });

    context.prompts.register({
      name: "brainstorm",
      description: "Brainstorm ideas using brain context and expertise",
      args: {
        topic: { description: "Topic to brainstorm about", required: true },
      },
      handler: async ({ topic }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Let's brainstorm about: ${topic}. Use my existing content and expertise as context. Give me fresh angles and concrete ideas.`,
            },
          },
        ],
      }),
    });
  }

  /**
   * Get plugin tools
   */
  protected override async getTools(): Promise<PluginTool[]> {
    return createSystemTools(this, this.id);
  }

  /**
   * MCP resources — browsable data for MCP clients
   */
  protected override async getResources(): Promise<PluginResource[]> {
    return [
      {
        uri: "entity://types",
        name: "Entity Types",
        description: "List of registered entity types",
        mimeType: "text/plain",
        handler: async () => ({
          contents: [
            {
              uri: "entity://types",
              mimeType: "text/plain",
              text: this.getEntityTypes().join("\n"),
            },
          ],
        }),
      },
      {
        uri: "brain://identity",
        name: "Brain Identity",
        description: "Brain character — name, role, purpose, values",
        mimeType: "application/json",
        handler: async () => {
          const identity = this.getIdentityData();
          return {
            contents: [
              {
                uri: "brain://identity",
                mimeType: "application/json",
                text: JSON.stringify(identity, null, 2),
              },
            ],
          };
        },
      },
      {
        uri: "brain://profile",
        name: "Anchor Profile",
        description: "Brain owner profile — name, bio, expertise",
        mimeType: "application/json",
        handler: async () => {
          const profile = this.getProfileData();
          return {
            contents: [
              {
                uri: "brain://profile",
                mimeType: "application/json",
                text: JSON.stringify(profile, null, 2),
              },
            ],
          };
        },
      },
    ];
  }

  protected override async getInstructions(): Promise<string> {
    const types = this.getEntityTypes();
    return [
      "## Entity CRUD",
      "",
      "Use these system tools for ALL entity operations:",
      "",
      "- **system_create**: Create or generate any entity. " +
        "Pass `content` for direct creation, or `prompt` for AI generation. " +
        `Available entity types: ${types.join(", ")}.`,
      "- **system_update**: Modify an entity's fields or content. " +
        "Requires confirmation before applying changes.",
      "- **system_delete**: Remove an entity. " +
        "Requires confirmation before deleting.",
      "- **system_get**: Retrieve a specific entity by type and ID/slug/title.",
      "- **system_list**: List entities by type with optional filters.",
      "- **system_search**: Semantic search across all entities.",
      "",
      "When a user asks to create content, determine the entity type from context:",
      '- "Write a blog post" → entityType: "post"',
      '- "Create a presentation/deck" → entityType: "deck"',
      '- "Save this as a note" → entityType: "base"',
      '- "Draft a LinkedIn post" → entityType: "social-post"',
      '- "Create a newsletter" → entityType: "newsletter"',
      '- "Add a project" → entityType: "project"',
      "",
      "Never use old tool names like blog_generate, note_create, or deck_generate.",
    ].join("\n");
  }

  /**
   * Search entities using entity service
   */
  public async searchEntities(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const context = this.getContext();

    try {
      return await context.entityService.search(query, {
        limit: options?.limit ?? this.config.searchLimit,
        ...(options?.types && { types: options.types }),
        ...(options?.sortBy && { sortBy: options.sortBy }),
      });
    } catch (error) {
      this.logger.error(`Failed to search entities: ${query}`, { error });
      return [];
    }
  }

  /**
   * Query using AI-powered search
   */
  public async query(
    prompt: string,
    queryContext?: Record<string, unknown>,
  ): Promise<DefaultQueryResponse> {
    return this.getContext().ai.query(prompt, queryContext);
  }

  /**
   * Get a specific entity by type and ID
   */
  public async getEntity(
    entityType: string,
    id: string,
  ): Promise<BaseEntity | null> {
    const context = this.getContext();

    try {
      return await context.entityService.getEntity(entityType, id);
    } catch (error) {
      this.logger.error(`Failed to get entity ${entityType}:${id}`, { error });
      return null;
    }
  }

  /**
   * Find entity by ID, slug, or title
   */
  public async findEntity(
    entityType: string,
    identifier: string,
  ): Promise<BaseEntity | null> {
    return findEntityByIdentifier(
      this.getContext().entityService,
      entityType,
      identifier,
      this.logger,
    );
  }

  /**
   * List entities by type with optional filters
   */
  public async listEntities(
    entityType: string,
    options?: {
      limit?: number;
      filter?: Record<string, unknown>;
    },
  ): Promise<BaseEntity[]> {
    const context = this.getContext();

    try {
      return await context.entityService.listEntities(entityType, {
        limit: options?.limit ?? 20,
        ...(options?.filter && {
          filter: options.filter as {
            metadata?: Partial<Record<string, unknown>>;
          },
        }),
      });
    } catch (error) {
      this.logger.error(`Failed to list entities of type ${entityType}`, {
        error,
      });
      return [];
    }
  }

  /**
   * Get job status information
   */
  public async getJobStatus(
    batchId?: string,
    jobTypes?: string[],
  ): Promise<{
    batch?: BatchJobStatus | null;
    activeJobs?: JobInfo[];
    activeBatches?: Batch[];
  }> {
    const context = this.getContext();

    try {
      if (batchId) {
        const batch = await context.jobs.getBatchStatus(batchId);
        return { batch };
      } else {
        const activeJobs = await context.jobs.getActiveJobs(jobTypes);
        const activeBatches = await context.jobs.getActiveBatches();
        return { activeJobs, activeBatches };
      }
    } catch (error) {
      this.logger.error("Failed to get job status", {
        error,
        batchId,
        jobTypes,
      });
      throw error;
    }
  }

  /**
   * Get conversation details by ID
   */
  public async getConversation(
    conversationId: string,
  ): Promise<Conversation | null> {
    return this.getContext().conversations.get(conversationId);
  }

  /**
   * Get messages from a conversation
   */
  public async getMessages(
    conversationId: string,
    limit?: number,
  ): Promise<Message[]> {
    return this.getContext().conversations.getMessages(
      conversationId,
      limit ? { limit } : undefined,
    );
  }

  /**
   * Search conversations
   */
  public async searchConversations(query: string): Promise<Conversation[]> {
    return this.getContext().conversations.search(query);
  }

  /**
   * Get the brain's identity data
   */
  public getIdentityData(): BrainCharacter {
    return this.getContext().identity.get();
  }

  /**
   * Get the owner's profile data
   */
  public getProfileData(): AnchorProfile {
    return this.getContext().identity.getProfile();
  }

  /**
   * Get list of registered entity types
   */
  public getEntityTypes(): string[] {
    return this.getContext().entityService.getEntityTypes();
  }

  /**
   * Get entity counts grouped by type
   */
  public async getEntityCounts(): Promise<
    Array<{ entityType: string; count: number }>
  > {
    return this.getContext().entityService.getEntityCounts();
  }

  /**
   * Get app metadata (model and version)
   */
  public getAppInfo(): Promise<AppInfo> {
    return this.getContext().appInfo();
  }

  /**
   * Update an entity
   */
  public async updateEntity(entity: BaseEntity): Promise<void> {
    await this.getContext().entityService.updateEntity(entity);
  }

  /**
   * Delete an entity by type and ID
   */
  public async deleteEntity(entityType: string, id: string): Promise<boolean> {
    return this.getContext().entityService.deleteEntity(entityType, id);
  }

  /**
   * Create an entity
   */
  public async createEntity(
    entity: BaseEntity,
  ): Promise<{ entityId: string; jobId: string }> {
    return this.getContext().entityService.createEntity(entity);
  }

  /**
   * Enqueue an extract job for a derived entity type.
   * Routes to `{entityType}:extract` handler registered by EntityPlugin.
   */
  public async enqueueExtractJob(
    entityType: string,
    source?: string,
  ): Promise<{ jobId: string }> {
    const jobType = `${entityType}:extract`;
    const data: { sourceId?: string; sourceType?: string } = {};

    if (source) {
      for (const type of this.getEntityTypes()) {
        const found = await this.getContext().entityService.getEntity(
          type,
          source,
        );
        if (found) {
          data.sourceId = found.id;
          data.sourceType = found.entityType;
          break;
        }
      }
      if (!data.sourceId) {
        throw new Error(`Source entity not found: ${source}`);
      }
    }

    const jobId = await this.enqueueJob(jobType, data);
    return { jobId };
  }

  /**
   * Set or remove cover image on an entity
   */
  public async setCoverImage(
    entityType: string,
    entityId: string,
    imageId: string | null,
  ): Promise<void> {
    const entity = await this.findEntity(entityType, entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityType}/${entityId}`);
    }

    // Check adapter supports cover images
    const adapter = this.getContext().entities.getAdapter(entityType);
    if (!adapter?.supportsCoverImage) {
      throw new Error(
        `Entity type '${entityType}' doesn't support cover images`,
      );
    }

    if (imageId) {
      const image = await this.getEntity("image", imageId);
      if (!image) {
        throw new Error(`Image not found: ${imageId}`);
      }
    }

    const updated = setCoverImageId(entity, imageId);
    await this.updateEntity(updated);
  }

  /**
   * Enqueue a generation job
   */
  public override async enqueueJob(
    type: string,
    data: unknown,
    toolContext: ToolContext | null = null,
    options?: JobOptions,
  ): Promise<string> {
    return this.getContext().jobs.enqueue(type, data, toolContext, options);
  }
}

export function systemPlugin(config?: Partial<SystemConfig>): SystemPlugin {
  return new SystemPlugin(config);
}
