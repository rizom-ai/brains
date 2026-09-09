import { describe, expect, it } from "bun:test";
import { expectToolError, expectToolSuccess } from "@brains/mcp-service/test";
import type { JobHandler } from "@brains/job-queue";
import type { Tool, ToolContext } from "@brains/plugins";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  createMockProgressReporter,
  createSilentLogger,
  stubMethod,
} from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { stockPhotoService } from "../src";
import type { SearchResult, StockPhotoProvider } from "../src";

/**
 * Stock-photo owns no entity type. Search reads the provider; select hands
 * the download to a job, and the job hands the bytes to the image type's own
 * create route — the same route `system_create` takes — so the image package
 * names, stores, deduplicates and links the picture, and stock-photo never
 * writes a type it does not own.
 *
 * The image type here is a stand-in with the same contract as the real
 * route: a plugin's tests may not import an entity package, and what is
 * under test is what stock-photo hands over, not how the image package keeps
 * it — that has its own tests.
 */

const METADATA = { name: "@brains/stock-photo", version: "0.1.0" };
const SELECT_JOB = "@brains/stock-photo:stock-photo:select-photo";

const image = defineEntity({
  type: "image",
  purpose: "A picture, kept the way the image package's route keeps one.",
  metadata: z.object({ title: z.string(), sourceUrl: z.string().optional() }),
  create: {
    fromContent: {
      resolve: async ({ input, entities }) => {
        const linkInto =
          input.targetEntityType && input.targetEntityId
            ? {
                entityType: input.targetEntityType,
                entityId: input.targetEntityId,
                field: "coverImageId",
              }
            : undefined;
        // Found by source URL first, so choosing a picture again links it
        // again rather than storing it twice.
        const [held] = input.url
          ? await entities.listEntities({
              entityType: "image",
              options: {
                limit: 1,
                filter: { metadata: { sourceUrl: input.url } },
              },
            })
          : [];
        if (held) {
          return {
            existing: { id: held.id },
            ...(linkInto ? { linkInto } : {}),
          };
        }
        const title = input.title ?? "image";
        return {
          create: {
            id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            content: input.content ?? "",
            metadata: { title, ...(input.url ? { sourceUrl: input.url } : {}) },
          },
          ...(linkInto ? { linkInto } : {}),
        };
      },
    },
  },
});

const post = defineEntity({
  type: "post",
  purpose: "Something a photo can be the cover of.",
  metadata: z.object({ title: z.string() }),
  coverImage: true,
});

const caller: ToolContext = {
  interfaceType: "test",
  actor: { kind: "user", userId: "tester" },
  userPermissionLevel: "admin",
};

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const found: SearchResult = {
  photos: [
    {
      id: "abc",
      description: "Mountains",
      altDescription: "Snowy peaks",
      thumbnailUrl: "https://thumb.url/abc",
      imageUrl: "https://image.url/abc",
      photographerName: "Jane",
      photographerUrl: "https://unsplash.com/@jane",
      sourceUrl: "https://unsplash.com/photos/abc",
      downloadLocation: "https://api.unsplash.com/photos/abc/download",
      width: 4000,
      height: 3000,
    },
  ],
  total: 50,
  totalPages: 5,
  page: 1,
};

const selection = {
  photoId: "abc123",
  downloadLocation: "https://api.unsplash.com/photos/abc123/download",
  photographerName: "Jane Smith",
  photographerUrl: "https://unsplash.com/@janesmith",
  sourceUrl: "https://unsplash.com/photos/abc123",
  imageUrl: "https://images.unsplash.com/photo-abc123?w=1080",
  title: "Mountain sunset",
};

const attribution = {
  photographerName: selection.photographerName,
  photographerUrl: selection.photographerUrl,
  sourceUrl: selection.sourceUrl,
};

interface Recorded {
  searches: { query: string; page: number; perPage: number }[];
  downloads: string[];
  fetched: string[];
}

interface Installed {
  harness: ReturnType<typeof createPluginHarness>;
  recorded: Recorded;
  search: (input: unknown) => Promise<unknown>;
  select: (input: unknown) => Promise<unknown>;
  /** Runs the select job the way the queue would, for the job a select answered with. */
  runSelectJob: (jobId: string, input: unknown) => Promise<unknown>;
}

async function installed(
  overrides: Partial<StockPhotoProvider> = {},
): Promise<Installed> {
  const harness = createPluginHarness({
    logger: createSilentLogger("stock-photo"),
  });
  const recorded: Recorded = { searches: [], downloads: [], fetched: [] };
  const provider: StockPhotoProvider = {
    searchPhotos: async (query, options) => {
      recorded.searches.push({ query, ...options });
      return { photos: [], total: 0, totalPages: 0, page: options.page };
    },
    triggerDownload: async (downloadLocation): Promise<void> => {
      recorded.downloads.push(downloadLocation);
    },
    ...overrides,
  };

  const handlers = new Map<string, JobHandler>();
  const queue = harness.getMockShell().getJobQueueService();
  stubMethod(queue, "registerHandler", (name, handler) => {
    handlers.set(name, handler);
  });
  harness.getMockShell().getJobQueueService = (): typeof queue => queue;

  // The image type, whose route does the storing, and a type that takes a
  // cover, for the photo to be the cover of.
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "pictures", entities: [image, post] }),
    {},
    { name: "@fixture/pictures", version: "0.1.0" },
  )) {
    await harness.installPlugin(plugin);
  }

  const [plugin] = instantiatePluginPackageDefinition(
    stockPhotoService({
      provider,
      fetchImage: async (url): Promise<string> => {
        recorded.fetched.push(url);
        return PNG_DATA_URL;
      },
    }),
    { apiKey: "test-key" },
    METADATA,
  );
  if (!plugin) throw new Error("Stock photo plugin was not created");
  const capabilities = await harness.installPlugin(plugin);
  const tool = (name: string): Tool => {
    const found = capabilities.tools.find(
      (candidate) => candidate.name === name,
    );
    if (!found) throw new Error(`Tool ${name} was not registered`);
    return found;
  };

  return {
    harness,
    recorded,
    search: (input) => tool("stock-photo_search").handler(input, caller),
    select: (input) => tool("stock-photo_select").handler(input, caller),
    runSelectJob: async (jobId, input): Promise<unknown> => {
      const handler = handlers.get(SELECT_JOB);
      if (!handler) throw new Error("Select job handler was not registered");
      return handler.process(
        input,
        jobId,
        createMockProgressReporter(),
        new AbortController().signal,
      );
    },
  };
}

function seeded(
  entityType: string,
  id: string,
  extra: { content?: string; metadata?: Record<string, unknown> } = {},
): Parameters<
  ReturnType<typeof createPluginHarness>["addEntities"]
>[0][number] {
  return {
    id,
    entityType,
    content: extra.content ?? `---\ntitle: ${id}\n---\nBody.`,
    contentHash: `${id}-hash`,
    metadata: { title: id, ...extra.metadata },
  };
}

/** What a select answers with, and the job it queued. */
async function selected(
  installedPackage: Installed,
  input: Record<string, unknown>,
): Promise<{ jobId: string }> {
  const result = await installedPackage.select(input);
  const data = expectToolSuccess(result).data;
  return z.object({ jobId: z.string() }).parse(data);
}

describe("stock-photo_search", () => {
  it("answers with what the provider found", async () => {
    const { search, harness } = await installed({
      searchPhotos: async () => found,
    });

    const result = await search({ query: "mountains" });

    expect(expectToolSuccess(result).data).toEqual(found);
    await harness.reset();
  });

  it("passes the page and page size through", async () => {
    const { search, recorded, harness } = await installed();

    await search({ query: "test", perPage: 5, page: 2 });

    expect(recorded.searches).toEqual([{ query: "test", page: 2, perPage: 5 }]);
    await harness.reset();
  });

  it("reports a provider failure as the tool's error", async () => {
    const { search, harness } = await installed({
      searchPhotos: async () => {
        throw new Error("Rate limited");
      },
    });

    const result = await search({ query: "test" });

    expect(expectToolError(result).code).toBe("handler_failed");
    expect(expectToolError(result).error).not.toContain("Rate limited");
    await harness.reset();
  });

  it("refuses a page size the provider would not serve", async () => {
    const { search, recorded, harness } = await installed();

    const result = await search({ query: "test", perPage: 50 });

    expect(expectToolError(result).code).toBe("invalid_input");
    expect(recorded.searches).toEqual([]);
    await harness.reset();
  });
});

describe("stock-photo_select", () => {
  it("queues the download and answers with the attribution to show", async () => {
    const installedPackage = await installed();
    const { select, recorded, harness } = installedPackage;

    const result = await select(selection);

    expect(expectToolSuccess(result).data).toEqual({
      attribution,
      jobId: expect.any(String),
      status: "generating",
    });
    // Nothing reaches the provider or the image host until the job runs:
    // the tool answers the agent, the queue does the work.
    expect(recorded.downloads).toEqual([]);
    expect(recorded.fetched).toEqual([]);
    await harness.reset();
  });

  it("refuses a selection without the fields attribution needs", async () => {
    const { select, harness } = await installed();

    const result = await select({ photoId: "abc" });

    expect(expectToolError(result).code).toBe("invalid_input");
    await harness.reset();
  });
});

describe("the select job", () => {
  it("stores the photo through the image type's route, tracking the download first", async () => {
    const installedPackage = await installed();
    const { runSelectJob, recorded, harness } = installedPackage;
    const { jobId } = await selected(installedPackage, selection);

    const result = await runSelectJob(jobId, selection);

    // Parsed before any matcher touches it: bun's `toMatchObject` writes an
    // `expect.any` matcher back into the received object.
    const { imageEntityId } = z
      .object({ imageEntityId: z.string() })
      .parse(result);
    expect(result).toMatchObject({ alreadyExisted: false });
    expect(recorded.downloads).toEqual([selection.downloadLocation]);
    expect(recorded.fetched).toEqual([selection.imageUrl]);
    const image = await harness
      .getEntityService()
      .getEntity({ entityType: "image", id: imageEntityId });
    if (!image) throw new Error("The image was not stored");
    expect(image.content).toContain(PNG_DATA_URL);
    expect(image.metadata).toMatchObject({
      title: "Mountain sunset",
      sourceUrl: selection.imageUrl,
    });
    await harness.reset();
  });

  it("names an untitled photo after its id", async () => {
    const installedPackage = await installed();
    const { runSelectJob, harness } = installedPackage;
    const { title: _title, ...untitled } = selection;
    const { jobId } = await selected(installedPackage, untitled);

    const result = await runSelectJob(jobId, untitled);

    const { imageEntityId } = z
      .object({ imageEntityId: z.string() })
      .parse(result);
    const image = await harness
      .getEntityService()
      .getEntity({ entityType: "image", id: imageEntityId });
    expect(image?.metadata).toMatchObject({ title: "Stock photo abc123" });
    await harness.reset();
  });

  it("makes the photo the target's cover", async () => {
    const installedPackage = await installed();
    const { runSelectJob, harness } = installedPackage;
    harness.addEntities([seeded("post", "launch-post")]);
    const input = {
      ...selection,
      targetEntityType: "post",
      targetEntityId: "launch-post",
    };
    const { jobId } = await selected(installedPackage, input);

    const result = await runSelectJob(jobId, input);

    expect(result).toMatchObject({ alreadyExisted: false, coverSet: true });
    const { imageEntityId } = z
      .object({ imageEntityId: z.string() })
      .parse(result);
    const target = await harness
      .getEntityService()
      .getEntity({ entityType: "post", id: "launch-post" });
    expect(target?.content).toContain(`coverImageId: ${imageEntityId}`);
    await harness.reset();
  });

  it("reuses a photo already held, and still links it", async () => {
    const installedPackage = await installed();
    const { runSelectJob, harness } = installedPackage;
    harness.addEntities([
      seeded("post", "launch-post"),
      seeded("image", "held-photo", {
        content: "the bytes already stored",
        metadata: { sourceUrl: selection.imageUrl },
      }),
    ]);
    const input = {
      ...selection,
      targetEntityType: "post",
      targetEntityId: "launch-post",
    };
    const { jobId } = await selected(installedPackage, input);

    const result = await runSelectJob(jobId, input);

    // The image route recognises the source URL: nothing is stored twice,
    // and choosing the picture again links it again.
    expect(result).toEqual({
      imageEntityId: "held-photo",
      alreadyExisted: true,
      coverSet: true,
    });
    const entities = harness.getEntityService();
    expect(
      (await entities.getEntity({ entityType: "image", id: "held-photo" }))
        ?.content,
    ).toBe("the bytes already stored");
    expect(
      (await entities.getEntity({ entityType: "post", id: "launch-post" }))
        ?.content,
    ).toContain("coverImageId: held-photo");
    await harness.reset();
  });

  it("refuses a cover for a target that is gone rather than storing an orphan", async () => {
    const installedPackage = await installed();
    const { runSelectJob, harness } = installedPackage;
    const input = {
      ...selection,
      targetEntityType: "post",
      targetEntityId: "never-written",
    };
    const { jobId } = await selected(installedPackage, input);

    expect(runSelectJob(jobId, input)).rejects.toThrow(
      "Target entity not found: post/never-written",
    );
    expect(
      await harness.getEntityService().listEntities({ entityType: "image" }),
    ).toHaveLength(0);
    await harness.reset();
  });

  it("omits the cover outcome when no target was asked for", async () => {
    const installedPackage = await installed();
    const { runSelectJob, harness } = installedPackage;
    const { jobId } = await selected(installedPackage, selection);

    const result = await runSelectJob(jobId, selection);

    expect(result).not.toHaveProperty("coverSet");
    await harness.reset();
  });
});
