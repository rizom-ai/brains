import { describe, expect, it } from "bun:test";
import type {
  BaseEntity,
  EntityMutationResult,
  IEntityService,
  ToolContext,
} from "@brains/plugins";
import type {
  CreateEntityRequest,
  UpdateEntityRequest,
} from "@brains/entity-service";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { createMockEntityService } from "@brains/entity-service/test";
import { createProgressReporter } from "./progress-reporter";
import { createStockPhotoPlugin } from "./stock-photo-plugin";

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const operator: ToolContext = {
  interfaceType: "cli",
  actor: { kind: "user", userId: "operator" },
};

const selection = {
  photoId: "abc123",
  downloadLocation: "https://api.unsplash.com/photos/abc123/download",
  photographerName: "Jane Smith",
  photographerUrl: "https://unsplash.com/@janesmith",
  sourceUrl: "https://unsplash.com/photos/abc123",
  imageUrl: "https://images.unsplash.com/photo-abc123?w=1080",
};

const post: BaseEntity = {
  id: "my-post",
  entityType: "post",
  content: "A post",
  contentHash: "hash",
  visibility: "public",
  metadata: { title: "My Post" },
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
};

interface Writes {
  created: CreateEntityRequest<BaseEntity>[];
  updated: UpdateEntityRequest<BaseEntity>[];
}

/** An entity service holding one post and maybe an image, recording writes. */
function recordingEntityService(
  existingImage: BaseEntity | undefined,
  writes: Writes,
): IEntityService {
  const base = createMockEntityService({
    listEntitiesImpl: async () => (existingImage ? [existingImage] : []),
    getEntityImpl: async ({ id }) => (id === post.id ? post : null),
  });
  return {
    ...base,
    createEntity: async <T extends BaseEntity>(
      request: CreateEntityRequest<T>,
    ): Promise<EntityMutationResult> => {
      writes.created.push(request);
      return { entityId: request.entity.id ?? "", jobId: "", skipped: false };
    },
    updateEntity: async <T extends BaseEntity>(
      request: UpdateEntityRequest<T>,
    ): Promise<EntityMutationResult> => {
      writes.updated.push(request);
      return { entityId: request.entity.id, jobId: "", skipped: false };
    },
  };
}

async function installed(
  options: { apiKey?: string; existingImage?: BaseEntity } = {},
): Promise<{
  shell: MockShell;
  writes: Writes;
  tools: Awaited<
    ReturnType<ReturnType<typeof createStockPhotoPlugin>["register"]>
  >["tools"];
  downloads: string[];
}> {
  const writes: Writes = { created: [], updated: [] };
  const downloads: string[] = [];
  const shell = createMockShell({
    entityService: recordingEntityService(options.existingImage, writes),
  });
  const plugin = createStockPhotoPlugin(
    options.apiKey === undefined ? {} : { apiKey: options.apiKey },
    {
      fetch: async (url): Promise<Response> => {
        downloads.push(String(url));
        return Response.json({});
      },
      fetchImage: async (): Promise<string> => TINY_PNG_DATA_URL,
    },
  );
  const capabilities = await plugin.register(shell);
  expect([plugin.id, plugin.type, plugin.packageName]).toEqual([
    "stock-photo",
    "service",
    "@brains/stock-photo",
  ]);
  expect(capabilities.resources).toEqual([]);
  expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
  expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
  return { shell, writes, tools: capabilities.tools, downloads };
}

function tool(
  tools: Awaited<ReturnType<typeof installed>>["tools"],
  name: string,
): (typeof tools)[number] {
  const found = tools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No tool ${name}`);
  return found;
}

/**
 * What the stock-photo package registers, pinned as the stock-photo plugin
 * class registered it: brains call its tools by these names, and a selected
 * photo is materialized by the job queued under this type, writing as the
 * package with nobody attributed.
 */
describe("the stock-photo package's registered surface", () => {
  it("registers nothing to call without an API key", async () => {
    const { shell, tools } = await installed();
    expect(tools).toEqual([]);
    expect(
      shell.getJobQueueService().getHandler("stock-photo:select-photo"),
    ).toBeUndefined();
  });

  it("registers its search and select tools with an API key", async () => {
    const { tools } = await installed({ apiKey: "key" });
    expect(
      tools.map((candidate) => ({
        name: candidate.name,
        visibility: candidate.visibility,
        sideEffects: candidate.sideEffects,
        input: Object.keys(candidate.inputSchema).sort(),
      })),
    ).toEqual([
      {
        name: "stock-photo_search",
        visibility: "admin",
        sideEffects: "none",
        input: ["page", "perPage", "query"],
      },
      {
        name: "stock-photo_select",
        visibility: "admin",
        sideEffects: "external",
        input: [
          "alt",
          "downloadLocation",
          "imageUrl",
          "photoId",
          "photographerName",
          "photographerUrl",
          "sourceUrl",
          "targetEntityId",
          "targetEntityType",
          "title",
        ],
      },
    ]);
  });

  it("queues a new photo as the package, with its selection as written", async () => {
    const { shell, tools } = await installed({ apiKey: "key" });
    const result = await tool(tools, "stock-photo_select").handler(
      { ...selection, targetEntityType: "post", targetEntityId: "my-post" },
      operator,
    );
    expect(result).toEqual({
      success: true,
      data: {
        imageEntityId: "abc123",
        alreadyExisted: false,
        attribution: {
          photographerName: selection.photographerName,
          photographerUrl: selection.photographerUrl,
          sourceUrl: selection.sourceUrl,
        },
        jobId: "job-1",
        status: "generating",
        coverSet: false,
      },
    });
    const job = await shell.getJobQueueService().getStatus("job-1");
    expect({
      type: job?.type,
      source: job?.source,
      data: JSON.parse(job?.data ?? "null"),
      metadata: job?.metadata,
    }).toEqual({
      type: "stock-photo:select-photo",
      source: "stock-photo",
      data: {
        ...selection,
        targetEntityType: "post",
        targetEntityId: "my-post",
      },
      metadata: {
        operationType: "data_processing",
        pluginId: "stock-photo",
        rootJobId: "job-1",
      },
    });
  });

  it("materializes a queued photo as the package and sets the cover", async () => {
    const { shell, writes, downloads } = await installed({ apiKey: "key" });
    const handler = shell
      .getJobQueueService()
      .getHandler("stock-photo:select-photo");
    if (!handler) throw new Error("No select-photo handler");
    // Data queued as the class queued it, and as another package may queue it.
    const data = handler.validateAndParse({
      ...selection,
      targetEntityType: "post",
      targetEntityId: "my-post",
    });
    expect(data).not.toBeNull();
    const result = await handler.process(
      data,
      "job-9",
      createProgressReporter(),
      new AbortController().signal,
    );
    expect(result).toEqual({
      imageEntityId: "abc123",
      alreadyExisted: false,
      coverSet: true,
    });
    expect(downloads).toEqual([selection.downloadLocation]);
    expect(writes.created).toHaveLength(1);
    const [created] = writes.created;
    expect(created?.options).toBeUndefined();
    expect(created?.entity).toMatchObject({
      id: "abc123",
      entityType: "image",
      metadata: { sourceUrl: selection.imageUrl, alt: "Stock photo abc123" },
    });
    // Nobody is attributed: the write is the package's own.
    expect(writes.updated).toEqual([
      {
        entity: {
          ...post,
          metadata: { ...post.metadata, coverImageId: "abc123" },
        },
      },
    ]);
    expect(handler.validateAndParse({ photoId: "x" })).toBeNull();
  });

  it("sets the cover on an existing photo in the tool call, as the package", async () => {
    const image: BaseEntity = {
      ...post,
      id: "existing-image",
      entityType: "image",
      metadata: { sourceUrl: selection.imageUrl },
    };
    const { tools, writes } = await installed({
      apiKey: "key",
      existingImage: image,
    });
    const result = await tool(tools, "stock-photo_select").handler(
      { ...selection, targetEntityType: "post", targetEntityId: "my-post" },
      operator,
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        imageEntityId: "existing-image",
        alreadyExisted: true,
        coverSet: true,
      },
    });
    expect(writes.created).toEqual([]);
    expect(writes.updated).toEqual([
      {
        entity: {
          ...post,
          metadata: { ...post.metadata, coverImageId: "existing-image" },
        },
      },
    ]);
  });
});
