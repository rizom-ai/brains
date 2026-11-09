import { afterEach, describe, expect, it } from "bun:test";
import { defineJobContract } from "@brains/contracts";
import {
  EntityRegistry,
  EntityService,
  type CreateExecutionContext,
  type CreateInput,
  type CreateResultAttachment,
  type IEntityService,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  EntityPlugin,
  defineEntity,
  defineEntityPackage,
  entityRuntime,
  instantiatePluginPackageDefinition,
  type EntityCreateContext,
} from "../src";

/**
 * A first-party create route answers as an entity plugin's interceptor did:
 * a pending placeholder and a contract job to fill it, a complete record
 * under the next free id, or the ordinary create with the target it
 * resolved. The runtime performs each.
 */

const scanMetadata = z.object({
  title: z.string(),
  status: z.string().optional(),
});

const scanContract = defineJobContract({
  type: "scans:scan",
  input: z.object({ scanId: z.string(), prompt: z.string() }),
});

const attachment = (entityId: string): CreateResultAttachment => ({
  mediaType: "image/png",
  url: `/api/chat/attachments/scan?id=${entityId}`,
  downloadUrl: `/api/chat/attachments/scan?id=${entityId}&download=1`,
  filename: `${entityId}.png`,
  source: { entityType: "scan", entityId, attachmentType: "generated" },
});

let answer: (context: EntityCreateContext) => { readonly refuse: string };

const scan = defineEntity({
  type: "scan",
  purpose: "A scan its routes queue or store.",
  metadata: scanMetadata,
  create: {
    fromPrompt: {
      resolve: async (context) => answer(context),
    },
  },
});

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function install(): Promise<{
  shell: MockShell;
  service: EntityService;
}> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "scans", entities: [scan] }),
    {},
    { name: "@fixture/scans", version: "0.1.0" },
    { pluginId: "scans" },
  );
  for (const plugin of plugins) {
    if (plugin instanceof EntityPlugin) {
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
      dimensions: 1536,
      generateEmbedding: async () => {
        throw new Error("Unexpected embedding");
      },
      generateEmbeddings: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  const entityService: IEntityService = service;
  const shell = createMockShell({ logger, entityService });
  for (const plugin of plugins) await plugin.register(shell);
  return { shell, service };
}

const caller: CreateExecutionContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "usr_admin" },
  userPermissionLevel: "admin",
};

async function create(
  shell: MockShell,
  input: Partial<CreateInput> = {},
): Promise<unknown> {
  const interceptor = shell.getEntityRegistry().getCreateInterceptor("scan");
  if (!interceptor) throw new Error("No scan create route");
  return interceptor({ entityType: "scan", prompt: "A dot", ...input }, caller);
}

const queued = (
  context: EntityCreateContext,
  extra: {
    attributed?:
      | boolean
      | {
          readonly operationType?: "content_operations" | "data_processing";
          readonly channel?: boolean;
        };
    visibility?: "public" | "restricted";
  } = {},
): { readonly refuse: string } =>
  entityRuntime(context).queued({
    entityId: "dot",
    placeholder: {
      content: "pending",
      metadata: { title: "Dot", status: "pending" },
      ...(extra.visibility && { visibility: extra.visibility }),
    },
    job: {
      contract: scanContract,
      data: { scanId: "dot", prompt: context.input.prompt ?? "" },
      ...(extra.attributed !== undefined && { attributed: extra.attributed }),
    },
    attachment: attachment("dot"),
  });

describe("a queued create", () => {
  it("writes the placeholder, queues the contract job with its input as written, and answers generating", async () => {
    const { shell, service } = await install();
    answer = (context): { readonly refuse: string } => queued(context);

    const outcome = z
      .object({
        kind: z.literal("handled"),
        result: z.object({
          success: z.literal(true),
          data: z.looseObject({ jobId: z.string() }),
        }),
      })
      .parse(await create(shell));

    expect(outcome.result.data).toEqual({
      entityId: "dot",
      status: "generating",
      jobId: outcome.result.data.jobId,
      attachment: attachment("dot"),
    });
    const job = await shell
      .getJobQueueService()
      .getStatus(outcome.result.data.jobId);
    expect(job?.type).toBe("scans:scan");
    expect(JSON.parse(job?.data ?? "{}")).toEqual({
      scanId: "dot",
      prompt: "A dot",
    });
    expect(
      (await service.getEntity({ entityType: "scan", id: "dot" }))?.metadata,
    ).toEqual({ title: "Dot", status: "pending" });
  });

  it("reuses a record that already has the placeholder's id", async () => {
    const { shell, service } = await install();
    await service.createEntity({
      entity: {
        id: "dot",
        entityType: "scan",
        content: "done",
        metadata: { title: "Dot", status: "draft" },
      },
    });
    answer = (context): { readonly refuse: string } => queued(context);

    await create(shell);

    expect(
      (await service.getEntity({ entityType: "scan", id: "dot" }))?.metadata,
    ).toEqual({ title: "Dot", status: "draft" });
  });

  it("refuses a record that exists at another visibility than asked", async () => {
    const { shell, service } = await install();
    await service.createEntity({
      entity: {
        id: "dot",
        entityType: "scan",
        content: "done",
        metadata: { title: "Dot" },
        visibility: "public",
      },
    });
    answer = (context): { readonly refuse: string } =>
      queued(context, { visibility: "restricted" });

    expect(create(shell)).rejects.toThrow(
      'Existing scan visibility "public" does not match requested visibility "restricted".',
    );
  });

  it("attributes the job to the caller when asked", async () => {
    const { shell } = await install();
    answer = (context): { readonly refuse: string } =>
      queued(context, { attributed: true });

    const outcome = z
      .object({
        result: z.object({ data: z.looseObject({ jobId: z.string() }) }),
      })
      .parse(await create(shell));
    const job = await shell
      .getJobQueueService()
      .getStatus(outcome.result.data.jobId);

    expect(job?.source).toBe("scans");
    expect(job?.metadata).toMatchObject({
      operationType: "content_operations",
      interfaceType: "mcp",
      requestedByActor: { kind: "user", userId: "usr_admin" },
      requestedByUserId: "usr_admin",
      requestedByInterface: "mcp",
    });
  });
});

describe("a queued create attributed as data processing in the caller's channel", () => {
  // As the link plugin class queued its capture: data processing, routed to
  // the channel the request came from.
  it("queues the job as the caller's data processing, in their channel", async () => {
    const { shell } = await install();
    answer = (context): { readonly refuse: string } =>
      queued(context, {
        attributed: { operationType: "data_processing", channel: true },
      });
    const interceptor = shell.getEntityRegistry().getCreateInterceptor("scan");
    if (!interceptor) throw new Error("No scan create route");
    const outcome = z
      .object({
        result: z.object({ data: z.looseObject({ jobId: z.string() }) }),
      })
      .parse(
        await interceptor(
          { entityType: "scan", prompt: "A dot" },
          { ...caller, channelId: "room-1", channelName: "Room" },
        ),
      );
    const job = await shell
      .getJobQueueService()
      .getStatus(outcome.result.data.jobId);

    expect(job?.source).toBe("scans");
    expect(job?.metadata).toMatchObject({
      operationType: "data_processing",
      interfaceType: "mcp",
      requestedByActor: { kind: "user", userId: "usr_admin" },
      requestedByUserId: "usr_admin",
      channelId: "room-1",
    });
  });

  it("names no channel for a caller outside one", async () => {
    const { shell } = await install();
    answer = (context): { readonly refuse: string } =>
      queued(context, {
        attributed: { operationType: "data_processing", channel: true },
      });
    const outcome = z
      .object({
        result: z.object({ data: z.looseObject({ jobId: z.string() }) }),
      })
      .parse(await create(shell));
    const job = await shell
      .getJobQueueService()
      .getStatus(outcome.result.data.jobId);

    expect(job?.metadata.operationType).toBe("data_processing");
    expect(job?.metadata).not.toHaveProperty("channelId");
  });
});

describe("a queued create that lands beside a taken id", () => {
  const importContract = defineJobContract({
    type: "scans:scan",
    input: z.object({
      scanId: z.string(),
      prompt: z.string(),
      stubHash: z.string(),
    }),
  });

  it("writes the placeholder under the next free id and queues the job from what it wrote", async () => {
    const { shell, service } = await install();
    await service.createEntity({
      entity: {
        id: "dot",
        entityType: "scan",
        content: "done",
        metadata: { title: "Dot", status: "draft" },
      },
    });
    answer = (context): { readonly refuse: string } =>
      entityRuntime(context).queued({
        entityId: "dot",
        placeholder: {
          content: "pending",
          metadata: { title: "Dot", status: "pending" },
          deduplicate: true,
        },
        job: {
          contract: importContract,
          data: (written) => ({
            scanId: written.entityId,
            prompt: context.input.prompt ?? "",
            stubHash: written.contentHash,
          }),
        },
      });

    const outcome = z
      .object({
        kind: z.literal("handled"),
        result: z.object({
          success: z.literal(true),
          data: z.looseObject({ jobId: z.string() }),
        }),
      })
      .parse(await create(shell));

    // No attachment: the answer names what was written and the job.
    expect(outcome.result.data).toEqual({
      entityId: "dot-2",
      status: "generating",
      jobId: outcome.result.data.jobId,
    });
    const written = await service.getEntity({
      entityType: "scan",
      id: "dot-2",
    });
    expect(written?.metadata).toEqual({ title: "Dot", status: "pending" });
    const job = await shell
      .getJobQueueService()
      .getStatus(outcome.result.data.jobId);
    expect(JSON.parse(job?.data ?? "{}")).toEqual({
      scanId: "dot-2",
      prompt: "A dot",
      stubHash: written?.contentHash,
    });
    // The record that held the id is left as it was.
    expect(
      (await service.getEntity({ entityType: "scan", id: "dot" }))?.metadata,
    ).toEqual({ title: "Dot", status: "draft" });
  });
});

describe("a stored create", () => {
  it("stores the record under the next free id and answers created with its link", async () => {
    const { shell, service } = await install();
    await service.createEntity({
      entity: {
        id: "dot",
        entityType: "scan",
        content: "earlier",
        metadata: { title: "Dot" },
      },
    });
    answer = (context): { readonly refuse: string } =>
      entityRuntime(context).stored({
        record: { id: "dot", content: "stored", metadata: { title: "Dot" } },
        attachment: ({ entityId }) => attachment(entityId),
      });

    expect(await create(shell, { visibility: "restricted" })).toEqual({
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: "dot-2",
          status: "created",
          attachment: attachment("dot-2"),
        },
      },
    });
    expect(
      (
        await service.getEntity({
          entityType: "scan",
          id: "dot-2",
          visibilityScope: "restricted",
        })
      )?.visibility,
    ).toBe("restricted");
  });
});

describe("an ordinary create", () => {
  it("hands on the target the route resolved", async () => {
    const { shell } = await install();
    answer = (context): { readonly refuse: string } =>
      entityRuntime(context).ordinaryCreate(undefined, {
        targetEntityId: "resolved-post",
      });

    expect(
      await create(shell, { targetEntityType: "post", targetEntityId: "Post" }),
    ).toEqual({
      kind: "continue",
      input: {
        entityType: "scan",
        prompt: "A dot",
        targetEntityType: "post",
        targetEntityId: "resolved-post",
      },
    });
  });
});
