import { mock, type Mock } from "bun:test";
import type { PublishMediaData } from "@brains/contracts";
import {
  EntityRegistry,
  EntityService,
  type BaseEntity,
  type IEntityService,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AttachmentProvider,
  type JobHandler,
} from "@brains/plugins";
import {
  createMockShell,
  type MockShell,
  isDeclaredEntityType,
} from "@brains/plugins/test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import {
  CallbackProgressReporter,
  type ProgressReporter,
} from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { imagePlugin } from "./image-plugin";

/**
 * The images on the brain's own entity store, beside a post type whose
 * records their jobs point covers and OG images at, with the shell's image
 * model and structured answers stood in for.
 */

// A post another package keeps: it carries a cover and an OG image, and
// renders an OG attachment.
let attachment: PublishMediaData | undefined;
const post = defineEntity({
  type: "post",
  purpose: "A post.",
  coverImage: true,
  metadata: z.object({
    title: z.string(),
    slug: z.string(),
    coverImageId: z.string().nullable().default(null),
    ogImageId: z.string().nullable().default(null),
  }),
  attachments: [
    {
      type: "og-image",
      provider: (): AttachmentProvider => ({
        resolve: async (): Promise<PublishMediaData | undefined> => attachment,
      }),
    },
  ],
});

export interface ImageJobs {
  readonly shell: MockShell;
  readonly service: EntityService;
  readonly generateImage: Mock<
    (
      prompt: string,
      options?: unknown,
    ) => Promise<{ base64: string; dataUrl: string }>
  >;
  readonly generateObject: Mock<(prompt: string) => Promise<unknown>>;
  readonly progress: Array<{ progress: number; message?: string }>;
  handler(type: string): JobHandler;
  run(type: string, data: unknown): Promise<unknown>;
  /** A record as stored, at every visibility. */
  stored(entityType: string, id: string): Promise<BaseEntity | null>;
  close(): Promise<void>;
}

export async function imageJobs(
  options: {
    readonly canGenerateImages?: boolean;
    readonly generateImage?: (
      prompt: string,
    ) => Promise<{ base64: string; dataUrl: string }>;
    readonly distilled?: string;
    readonly attachment?: PublishMediaData;
  } = {},
): Promise<ImageJobs> {
  attachment = options.attachment;
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  const plugins = [
    imagePlugin(),
    ...instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "posts", entities: [post] }),
      {},
      { name: "@fixture/posts", version: "0.0.0-test" },
      { pluginId: "posts" },
    ),
  ];
  for (const plugin of plugins) {
    if (isDeclaredEntityType(plugin)) {
      registry.registerEntityType(
        plugin.entityType,
        plugin.schema,
        plugin.adapter,
        plugin.entityType === "image" ? { binaryStorage: "data-url" } : {},
      );
    }
  }
  const dbConfig = { url: `file:${directory.dir}/entities.db` };
  await migrateEntities(dbConfig, logger);
  const service = EntityService.createFresh({
    dbConfig,
    embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
    entityRegistry: registry,
    logger,
    jobQueueService: createMockShell().getJobQueueService(),
    embeddingsEnabled: false,
    embeddingService: {
      identity: { model: "test:none", dimensions: 1536, promptRevision: 0 },
      embedQuery: async () => {
        throw new Error("Unexpected embedding");
      },
      embedDocuments: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  const entityService: IEntityService = service;
  const shell = createMockShell({
    logger,
    entityService,
    dataDir: directory.dir,
  });
  const generated =
    options.generateImage ??
    (async (): Promise<{ base64: string; dataUrl: string }> => ({
      base64: VALID_PNG_BASE64,
      dataUrl: VALID_PNG_DATA_URL,
    }));
  const generateImage = mock(
    async (
      prompt: string,
      _options?: unknown,
    ): Promise<{ base64: string; dataUrl: string }> => generated(prompt),
  );
  const generateObject = mock(async (_prompt: string): Promise<unknown> => ({
    imagePrompt: options.distilled ?? "",
  }));
  shell.canGenerateImages = (): boolean => options.canGenerateImages ?? true;
  shell.generateImage = async (
    prompt: string,
    imageOptions?: unknown,
  ): Promise<{ base64: string; dataUrl: string }> =>
    generateImage(prompt, imageOptions);
  shell.generateObject = async <T>(
    prompt: string,
    schema: { parse(value: unknown): T },
  ): Promise<{ object: T }> => ({
    object: schema.parse(await generateObject(prompt)),
  });
  for (const plugin of plugins) await plugin.register(shell);

  const progress: Array<{ progress: number; message?: string }> = [];
  const reporter = (): ProgressReporter => {
    const created = CallbackProgressReporter.from(async (notification) => {
      progress.push({
        progress: notification.progress,
        ...(notification.message !== undefined && {
          message: notification.message,
        }),
      });
    });
    if (!created) throw new Error("No progress reporter");
    return created;
  };
  const handler = (type: string): JobHandler => {
    const found = shell.getJobQueueService().getHandler(type);
    if (!found) throw new Error(`No handler for ${type}`);
    return found;
  };
  return {
    shell,
    service,
    generateImage,
    generateObject,
    progress,
    handler,
    async run(type, data): Promise<unknown> {
      const job = handler(type);
      const parsed = job.validateAndParse(data);
      if (parsed === null) throw new Error(`Invalid ${type} data`);
      return job.process(
        parsed,
        "job-1",
        reporter(),
        new AbortController().signal,
      );
    },
    stored: (entityType, id) =>
      service.getEntityRaw({
        entityType,
        id,
        visibilityScope: "restricted",
        source: true,
      }),
    async close(): Promise<void> {
      service.close();
      await directory.cleanup();
    },
  };
}

// Valid 1x1 PNG image as base64
export const VALID_PNG_BASE64: string =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
export const VALID_PNG_DATA_URL: string = `data:image/png;base64,${VALID_PNG_BASE64}`;

/** A post on the store, as another package writes it. */
export async function seedPost(
  service: EntityService,
  post: { id: string; title: string; slug: string; body?: string },
): Promise<void> {
  await service.createEntity({
    entity: {
      id: post.id,
      entityType: "post",
      content: post.body ?? "Content",
      metadata: { title: post.title, slug: post.slug },
    },
  });
}
