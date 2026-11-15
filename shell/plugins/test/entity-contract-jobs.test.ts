import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  defineJobContract,
  type ActorRef,
  type PublishMediaData,
} from "@brains/contracts";
import type { CallerPrincipal } from "@brains/content-service";
import {
  EntityRegistry,
  EntityService,
  type IEntityService,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import type { JobHandler } from "@brains/job-queue";
import { PermissionService } from "@brains/templates";
import {
  createMockLogger,
  createMockProgressReporter,
  createTestDirectory,
} from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import { sharedUploadScope } from "../src/service/upload-registry";
import {
  contractJob,
  defineEntity,
  defineEntityJob,
  defineEntityPackage,
  entityRuntime,
  instantiatePluginPackageDefinition,
  type AttachmentProvider,
  type EntityDefinition,
  type EntityGenerationLink,
  type EntityGenerationResult,
} from "../src";
import { isDeclaredEntityType } from "../src/test/declared-entity-type";

/**
 * A first-party job another package queues through its contract: its data
 * is the contract's input as written, it runs as the package, and it links
 * what it made into a target the way the entity plugin classes' handlers
 * did, under the generation-link rules and the target's visibility, past
 * the target's action policy. Public jobs and generations keep the policy.
 */

const renderMetadata = z.object({
  title: z.string(),
  status: z.string().optional(),
});

const renderInput = z.object({
  renderId: z.string(),
  link: z
    .object({
      entityType: z.string(),
      entityId: z.string(),
      field: z.string().optional(),
      list: z.string().optional(),
      replaces: z.array(z.string()).optional(),
    })
    .optional(),
  uploadId: z.string().optional(),
});

// Another package queues a render of this type through the contract.
const renderContract = defineJobContract({
  type: "renders:render",
  input: renderInput,
});

let seen: unknown;

function linkOf(
  link: NonNullable<z.output<typeof renderInput>["link"]>,
): EntityGenerationLink {
  const target = { entityType: link.entityType, entityId: link.entityId };
  return link.list !== undefined
    ? {
        ...target,
        list: link.list,
        ...(link.replaces && { replaces: link.replaces }),
      }
    : { ...target, field: link.field ?? "coverImageId" };
}

const render: EntityDefinition<"render", typeof renderMetadata> = defineEntity({
  type: "render",
  purpose: "A render other packages queue.",
  metadata: renderMetadata,
  jobs: {
    render: contractJob(renderContract, {
      handle: async (context) => {
        const { input, entities } = context;
        const runtime = entityRuntime(context);
        const upload = input.uploadId
          ? await runtime.uploads.readRecord(input.uploadId)
          : undefined;
        const printable = await runtime.attachments.resolve({
          sourceEntityType: "post",
          sourceEntityId: "public-post",
          attachmentType: "printable",
        });
        seen = {
          canGenerate: runtime.images.canGenerate(),
          printable: printable?.filename ?? null,
          upload: upload?.filename ?? null,
          restrictedPost: (await runtime.anyEntities.getEntity({
            entityType: "post",
            id: "restricted-post",
          }))
            ? "visible"
            : "hidden",
        };
        await entities.create(render, {
          id: input.renderId,
          content: "Rendered",
          metadata: { title: input.renderId, status: "draft" },
          visibility: "restricted",
        });
        if (input.link)
          await runtime.linkInto(input.renderId, linkOf(input.link));
        runtime.logger.info("Rendered", { renderId: input.renderId });
        return { renderId: input.renderId };
      },
    }),
    // A public job's link is still the policy's to allow.
    "public-render": defineEntityJob({
      input: z.object({}),
      generate: async (): Promise<EntityGenerationResult> => ({
        success: true,
        id: "public-render",
        content: "Rendered",
        metadata: { title: "public-render" },
        linkInto: {
          entityType: "post",
          entityId: "public-post",
          field: "coverImageId",
        },
      }),
    }),
  },
});

const DIMENSIONS = 1536;
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
  seen = undefined;
});

// Another package's types: a post with a cover and documents, and a note
// with neither.
const post = defineEntity({
  type: "post",
  purpose: "A post.",
  coverImage: true,
  attachments: [
    {
      type: "printable",
      provider: (): AttachmentProvider => ({
        resolve: async ({ sourceEntityId }): Promise<PublishMediaData> => ({
          type: "document",
          data: new Uint8Array([1]),
          mimeType: "application/pdf",
          filename: `${sourceEntityId}.pdf`,
        }),
      }),
    },
  ],
  metadata: z.object({
    title: z.string(),
    coverImageId: z.string().nullable().default(null),
    documents: z.array(z.object({ id: z.string() })).default([]),
  }),
});
const note = defineEntity({
  type: "note",
  purpose: "A note.",
  metadata: z.object({ title: z.string() }),
});

async function install(): Promise<{
  shell: MockShell;
  service: EntityService;
  logger: ReturnType<typeof createMockLogger>;
}> {
  const directory = await createTestDirectory();
  const logger = createMockLogger();
  const registry = EntityRegistry.createFresh(logger);
  const plugins = [
    ...instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "renders", entities: [render] }),
      {},
      { name: "@fixture/renders", version: "0.1.0" },
      { pluginId: "renders" },
    ),
    ...instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "posts", entities: [post, note] }),
      {},
      { name: "@fixture/posts", version: "0.1.0" },
    ),
  ];
  for (const plugin of plugins) {
    if (isDeclaredEntityType(plugin)) {
      registry.registerEntityType(
        plugin.entityType,
        plugin.schema,
        plugin.adapter,
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
      identity: {
        model: "test:mock",
        dimensions: DIMENSIONS,
        promptRevision: 0,
      },
      embedQuery: async () => ({
        embedding: new Float32Array(DIMENSIONS),
        usage: { tokens: 1 },
      }),
      embedDocuments: async (documents: { content: string }[]) => ({
        embeddings: documents.map(() => new Float32Array(DIMENSIONS)),
        usage: { tokens: documents.length },
      }),
    },
  });
  await service.initialize();
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  const entityService: IEntityService = service;
  const shell = createMockShell({
    logger,
    entityService,
    dataDir: directory.dir,
    resolvePrincipal: mock(
      async (_actor: ActorRef): Promise<CallerPrincipal | null> => null,
    ),
  });
  // Posts and notes are admin's to update, as the platform baseline has it.
  shell.getPermissionService = (): PermissionService =>
    new PermissionService(
      {},
      { entityActionFloor: () => ({ create: "admin", update: "admin" }) },
    );
  for (const plugin of plugins) await plugin.register(shell);
  for (const [id, visibility] of [
    ["public-post", "public"],
    ["restricted-post", "restricted"],
  ] as const) {
    await service.createEntity({
      entity: {
        id,
        entityType: "post",
        content: `About ${id}`,
        metadata: { title: id },
        visibility,
      },
    });
  }
  await service.createEntity({
    entity: {
      id: "plain-note",
      entityType: "note",
      content: "A note",
      metadata: { title: "plain-note" },
    },
  });
  return { shell, service, logger };
}

function handler(shell: MockShell, type: string): JobHandler {
  const found = shell.getJobQueueService().getHandler(type);
  if (!found) throw new Error(`No handler for ${type}`);
  return found;
}

async function run(shell: MockShell, data: unknown): Promise<unknown> {
  const job = handler(shell, "renders:render");
  const parsed = job.validateAndParse(data);
  if (parsed === null) throw new Error("Invalid contract job data");
  return job.process(
    parsed,
    "job-1",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

async function stored(
  service: EntityService,
  entityType: string,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  return (
    await service.getEntity({
      entityType,
      id,
      visibilityScope: "restricted",
    })
  )?.metadata;
}

describe("a contract job", () => {
  it("is registered under its contract's type and runs the contract's input as written", async () => {
    const { shell, service } = await install();

    expect(await run(shell, { renderId: "first" })).toEqual({
      renderId: "first",
    });
    expect(await stored(service, "render", "first")).toEqual({
      title: "first",
      status: "draft",
    });
  });

  it("logs as its package, as the entity plugin classes' handlers did", async () => {
    const { shell, logger } = await install();

    await run(shell, { renderId: "first" });

    expect(logger.info).toHaveBeenCalledWith("Rendered", { renderId: "first" });
  });

  it("refuses queued data its contract does not accept", async () => {
    const { shell } = await install();

    expect(
      handler(shell, "renders:render").validateAndParse({
        authority: { actor: { kind: "service", serviceId: "x" } },
        input: { renderId: "wrapped" },
      }),
    ).toBeNull();
  });

  it("is refused under a local name its contract's type does not scope to", () => {
    const misnamed = defineEntity({
      type: "misnamed",
      purpose: "Declares a contract job under another name.",
      metadata: z.object({ title: z.string() }),
      jobs: {
        other: contractJob(renderContract, { handle: async () => null }),
      },
    });
    const [plugin] = instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "renders", entities: [misnamed] }),
      {},
      { name: "@fixture/renders", version: "0.1.0" },
      { pluginId: "renders" },
    );
    if (!plugin) throw new Error("No plugin");

    expect(plugin.register(createMockShell())).rejects.toThrow(
      /answers "renders:render" but is declared as "renders:other"/,
    );
  });

  // The link plugin class registered its capture handler under its own
  // generation job too; jobs queued under that name still run.
  const captureInput = z.object({ url: z.string() });
  const legacyGeneration = defineJobContract({
    type: "capturer:generation",
    input: captureInput,
  });
  function capturer(
    extra: Partial<Parameters<typeof defineEntity>[0]> = {},
  ): ReturnType<typeof defineEntity> {
    return defineEntity({
      type: "capturer",
      purpose: "Captures under its generation job name.",
      metadata: z.object({ title: z.string() }),
      jobs: {
        generation: contractJob(legacyGeneration, {
          handle: async ({ input }) => ({ captured: input.url }),
        }),
      },
      ...extra,
    });
  }

  it("may take the type's generation job name when the type declares no generation", async () => {
    const [plugin] = instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "capturer", entities: [capturer()] }),
      {},
      { name: "@fixture/capturer", version: "0.1.0" },
      { pluginId: "capturer" },
    );
    if (!plugin) throw new Error("No plugin");
    const shell = createMockShell();
    await plugin.register(shell);
    const job = handler(shell, "capturer:generation");
    expect(
      await job.process(
        job.validateAndParse({ url: "https://example.com" }),
        "job-1",
        createMockProgressReporter(),
        new AbortController().signal,
      ),
    ).toEqual({ captured: "https://example.com" });
  });

  it("is refused under the generation job name when the type declares a generation", () => {
    expect(() =>
      instantiatePluginPackageDefinition(
        defineEntityPackage({
          id: "capturer",
          entities: [
            capturer({
              generation: {
                input: z.object({}),
                generate: async () => ({
                  success: true,
                  content: "",
                  metadata: { title: "x" },
                }),
              },
            }),
          ],
        }),
        {},
        { name: "@fixture/capturer", version: "0.1.0" },
        { pluginId: "capturer" },
      ),
    ).toThrow(/generation/);
  });

  it("runs as the package: reads other types public, with its capabilities", async () => {
    const { shell } = await install();
    const upload = await shell
      .getRuntimeUploadRegistry()
      .scoped(sharedUploadScope)
      .save({
        filename: "scan.png",
        mediaType: "image/png",
        content: new Uint8Array([1, 2, 3]),
      });

    await run(shell, { renderId: "first", uploadId: upload.id });

    expect(seen).toEqual({
      canGenerate: expect.any(Boolean),
      printable: "public-post.pdf",
      upload: "scan.png",
      restrictedPost: "hidden",
    });
  });
});

describe("a contract job's link", () => {
  it("points a public target at what it made, past the target's action policy", async () => {
    const { shell, service } = await install();

    await run(shell, {
      renderId: "cover",
      link: {
        entityType: "post",
        entityId: "public-post",
        field: "coverImageId",
      },
    });

    expect(await stored(service, "post", "public-post")).toMatchObject({
      coverImageId: "cover",
    });
  });

  it("adds to a list and drops the entries it supersedes", async () => {
    const { shell, service } = await install();
    await run(shell, {
      renderId: "first-pdf",
      link: { entityType: "post", entityId: "public-post", list: "documents" },
    });

    await run(shell, {
      renderId: "second-pdf",
      link: {
        entityType: "post",
        entityId: "public-post",
        list: "documents",
        replaces: ["first-pdf"],
      },
    });

    expect(await stored(service, "post", "public-post")).toMatchObject({
      documents: [{ id: "second-pdf" }],
    });
  });

  it("does not find a target its run cannot see", async () => {
    const { shell, service } = await install();

    expect(
      run(shell, {
        renderId: "cover",
        link: {
          entityType: "post",
          entityId: "restricted-post",
          field: "coverImageId",
        },
      }),
    ).rejects.toThrow("Target entity not found: post/restricted-post");
    expect(await stored(service, "post", "restricted-post")).toMatchObject({
      coverImageId: null,
    });
  });

  it("keeps the generation-link rules: no cover on a type that has none", async () => {
    const { shell } = await install();

    expect(
      run(shell, {
        renderId: "cover",
        link: {
          entityType: "note",
          entityId: "plain-note",
          field: "coverImageId",
        },
      }),
    ).rejects.toThrow("Entity type 'note' doesn't support cover images");
  });

  it("leaves a public generation's link to the target's action policy", async () => {
    const { shell, service } = await install();
    const job = handler(shell, "renders:public-render");
    const data = job.validateAndParse({
      authority: {
        actor: { kind: "service", serviceId: "renders" },
        permissionCeiling: "public",
      },
      input: {},
      byPackage: true,
    });
    if (data === null) throw new Error("Invalid job data");

    await job
      .process(
        data,
        "job-2",
        createMockProgressReporter(),
        new AbortController().signal,
      )
      .catch(() => undefined);

    expect(await stored(service, "post", "public-post")).toMatchObject({
      coverImageId: null,
    });
  });
});
