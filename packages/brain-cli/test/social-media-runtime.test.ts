import { afterEach, describe, expect, test } from "bun:test";
import { generateExecuteContract } from "@brains/contracts";
import blogPackage from "@brains/blog";
import { createServicePluginContext } from "@brains/plugins/test";
import socialMediaPackage from "@brains/social-media";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared social posts on the brain's own entity store: every post
 * stored as the social post adapter wrote it, byte for byte, whether
 * imported, updated by the publish pipeline, generated or scheduled, and
 * the follow-up work and pipeline reports as the class's generation
 * handler sent them.
 */

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

interface Heard {
  readonly channel: string;
  readonly payload: unknown;
}

interface Opened {
  readonly store: DeclaredEntityStore;
  readonly prompts: unknown[];
  readonly heard: Heard[];
  reply: { title: string; content: string };
  retitle: string;
}

async function open(): Promise<Opened> {
  const store = await declaredEntityStore(
    socialMediaPackage,
    "@brains/social-media",
    "social-media",
    {
      projectionSourceRole: "secondary",
      publish: { publishStatuses: ["queued", "published", "failed"] },
    },
    [blogPackage],
  );
  stores.push(store);
  const opened: Opened = {
    store,
    prompts: [],
    heard: [],
    reply: { title: "Shaped Title", content: "Shaped body #tag" },
    retitle: "Launch Day Again",
  };
  store.shell.generateContent = async (config): Promise<unknown> => {
    opened.prompts.push(config);
    return opened.reply;
  };
  store.shell.generateObject = async <T>(): Promise<{ object: T }> => ({
    object: z.custom<T>().parse({ title: opened.retitle }),
  });
  const bus = store.shell.getMessageBus();
  for (const channel of [
    "generate:report:success",
    "generate:report:failure",
  ]) {
    bus.subscribe(channel, async (message) => {
      opened.heard.push({ channel, payload: message.payload });
      return { success: true };
    });
  }
  return opened;
}

async function imported(
  store: DeclaredEntityStore,
  id: string,
  markdown: string,
): Promise<string | undefined> {
  await store.service.createEntityFromMarkdown({
    input: { entityType: "social-post", id, markdown },
  });
  return (await store.stored("social-post", id))?.content;
}

async function generate(
  store: DeclaredEntityStore,
  data: unknown,
): Promise<unknown> {
  const handler = store.shell
    .getJobQueueService()
    .getHandler("social-post:generation");
  if (!handler) throw new Error("No social post generation");
  return handler.process(
    handler.validateAndParse(data),
    "job-under-test",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

async function storedPost(
  store: DeclaredEntityStore,
  id: string,
): Promise<string | undefined> {
  return (await store.stored("social-post", id))?.content;
}

const essay =
  "---\ntitle: My Essay\nslug: my-essay\nstatus: published\npublishedAt: 2025-01-01T00:00:00.000Z\nexcerpt: An essay.\nauthor: Me\n---\nThe essay body.\n";

describe("declared social posts on the entity store", () => {
  test("imports each file as the adapter wrote it", async () => {
    const { store } = await open();
    expect(
      await imported(
        store,
        "canonical",
        "---\ntitle: Launch Day\nplatform: linkedin\nstatus: draft\nsourceEntityId: my-post\nsourceEntityType: post\n---\nBody text\n",
      ),
    ).toBe(
      "---\ntitle: Launch Day\nplatform: linkedin\nstatus: draft\nsourceEntityId: my-post\nsourceEntityType: post\n---\nBody text\n",
    );
    // The type's own order, a field it does not know kept after it.
    expect(
      await imported(
        store,
        "reordered",
        "---\nstatus: queued\ncoverImageId: img-1\ntitle: Reordered Post\nnote: kept\nplatform: linkedin\ndocuments:\n  - id: doc-1\n---\n\nBody\n",
      ),
    ).toBe(
      "---\ntitle: Reordered Post\nplatform: linkedin\nstatus: queued\ncoverImageId: img-1\ndocuments:\n  - id: doc-1\nnote: kept\n---\nBody\n",
    );
    // A file with a title alone is a LinkedIn draft.
    expect(
      await imported(store, "minimal", "---\ntitle: Minimal\n---\nJust text\n"),
    ).toBe(
      "---\ntitle: Minimal\nplatform: linkedin\nstatus: draft\n---\nJust text\n",
    );
    expect(
      await imported(
        store,
        "published",
        "---\ntitle: Done\nplatform: linkedin\nstatus: published\npublishedAt: 2025-03-01T10:00:00.000Z\nplatformPostId: urn:li:share:1\n---\nPosted\n",
      ),
    ).toBe(
      "---\ntitle: Done\nplatform: linkedin\nstatus: published\npublishedAt: '2025-03-01T10:00:00.000Z'\nplatformPostId: 'urn:li:share:1'\n---\nPosted\n",
    );
    // Record dates are the store's; a slug the file states is kept, but
    // the record's own is resolved from its platform and title.
    expect(
      await imported(
        store,
        "dated",
        "---\ntitle: Dated\nplatform: linkedin\nstatus: draft\ncreated: 2025-09-20T00:00:00.000Z\nslug: custom-slug\n---\nDated body\n",
      ),
    ).toBe(
      "---\ntitle: Dated\nplatform: linkedin\nstatus: draft\nslug: custom-slug\n---\nDated body\n",
    );
    expect(
      (
        await store.service.getEntity({
          entityType: "social-post",
          id: "dated",
        })
      )?.metadata,
    ).toMatchObject({ slug: "linkedin-dated" });
  });

  test("records a failed publish's status in the file and its error on the record", async () => {
    const { store } = await open();
    await imported(
      store,
      "reordered",
      "---\nstatus: queued\ncoverImageId: img-1\ntitle: Reordered Post\nnote: kept\nplatform: linkedin\ndocuments:\n  - id: doc-1\n---\n\nBody\n",
    );
    const read = await store.service.getEntity({
      entityType: "social-post",
      id: "reordered",
    });
    if (!read) throw new Error("No post");
    // As the publish pipeline records a failure.
    await store.service.updateEntity({
      entity: {
        ...read,
        metadata: { ...read.metadata, status: "failed", error: "boom" },
      },
    });
    expect(await storedPost(store, "reordered")).toBe(
      "---\ntitle: Reordered Post\nplatform: linkedin\nstatus: failed\ncoverImageId: img-1\ndocuments:\n  - id: doc-1\nnote: kept\n---\nBody\n",
    );
    expect(
      (
        await store.service.getEntity({
          entityType: "social-post",
          id: "reordered",
        })
      )?.metadata,
    ).toMatchObject({ status: "failed", error: "boom" });
  });

  test("records a publish's id and time in the file, and keeps them through an edit", async () => {
    const { store } = await open();
    await imported(
      store,
      "canonical",
      "---\ntitle: Launch Day\nplatform: linkedin\nstatus: draft\nsourceEntityId: my-post\nsourceEntityType: post\n---\nBody text\n",
    );
    const read = await store.service.getEntity({
      entityType: "social-post",
      id: "canonical",
    });
    if (!read) throw new Error("No post");
    // As the publish pipeline marks a post published.
    await store.service.updateEntity({
      entity: {
        ...read,
        metadata: {
          ...read.metadata,
          status: "published",
          publishedAt: "2025-04-01T00:00:00.000Z",
          platformId: "urn:2",
          platformPostId: "urn:2",
        },
      },
    });
    const published =
      "---\ntitle: Launch Day\nplatform: linkedin\nstatus: published\npublishedAt: '2025-04-01T00:00:00.000Z'\nplatformPostId: 'urn:2'\nsourceEntityId: my-post\nsourceEntityType: post\n---\n";
    expect(await storedPost(store, "canonical")).toBe(
      `${published}Body text\n`,
    );
    const again = await store.service.getEntity({
      entityType: "social-post",
      id: "canonical",
    });
    if (!again) throw new Error("No post");
    await store.service.updateEntity({
      entity: { ...again, content: "Edited text" },
    });
    expect(await storedPost(store, "canonical")).toBe(
      `${published}Edited text\n`,
    );
  });

  test("writes the placeholder system_generate starts from", async () => {
    const { store } = await open();
    const stub = store.shell
      .getEntityRegistry()
      .getAdapter("social-post")
      .buildStub?.({ id: "linkedin-stub-title", title: "Stub Title" });
    if (!stub) throw new Error("No stub");
    expect(stub.metadata).toMatchObject({
      title: "Stub Title",
      slug: "linkedin-stub-title",
      platform: "linkedin",
      status: "generating",
    });
    await store.service.createEntity({
      entity: {
        id: "linkedin-stub-title",
        entityType: "social-post",
        content: stub.content,
        metadata: stub.metadata,
      },
    });
    expect(await storedPost(store, "linkedin-stub-title")).toBe(
      "---\ntitle: Stub Title\nplatform: linkedin\nstatus: generating\n---\n\n",
    );
  });
});

describe("the declared social post generation on the entity store", () => {
  test("writes a post from text and a title, queued when asked", async () => {
    const opened = await open();
    expect(
      await generate(opened.store, {
        title: "Direct Post",
        content: "Direct body",
        addToQueue: true,
      }),
    ).toMatchObject({
      success: true,
      entityId: "linkedin-direct-post",
      slug: "linkedin-direct-post",
    });
    expect(await storedPost(opened.store, "linkedin-direct-post")).toBe(
      "---\ntitle: Direct Post\nplatform: linkedin\nstatus: queued\n---\nDirect body\n",
    );
    expect(opened.prompts).toEqual([]);
    expect(opened.heard).toEqual([
      {
        channel: "generate:report:success",
        payload: {
          entityType: "social-post",
          entityId: "linkedin-direct-post",
        },
      },
    ]);
  });

  test("shapes and titles text through the LinkedIn template", async () => {
    const opened = await open();
    expect(
      await generate(opened.store, { content: "Raw text to shape" }),
    ).toMatchObject({ success: true, entityId: "linkedin-shaped-title" });
    expect(opened.prompts).toEqual([
      expect.objectContaining({
        prompt: "Raw text to shape",
        templateName: "social-media:linkedin",
        representedIdentity: "anchor",
      }),
    ]);
    expect(await storedPost(opened.store, "linkedin-shaped-title")).toBe(
      "---\ntitle: Shaped Title\nplatform: linkedin\nstatus: draft\n---\nShaped body #tag\n",
    );
  });

  test("shares a blog post by its title and text, and queues its graphic when asked", async () => {
    const opened = await open();
    await opened.store.service.createEntityFromMarkdown({
      input: { entityType: "post", id: "my-essay", markdown: essay },
    });
    opened.reply = { title: "From Essay", content: "Read my essay #essay" };
    expect(
      await generate(opened.store, {
        sourceEntityType: "post",
        sourceEntityId: "my-essay",
        generateImage: true,
      }),
    ).toMatchObject({ success: true, entityId: "linkedin-from-essay" });
    expect(opened.prompts).toEqual([
      expect.objectContaining({
        prompt:
          "Write a linkedin post to share this post:\n\nSource: post/my-essay\n\nTitle: My Essay\n\nThe essay body.",
        templateName: "social-media:linkedin",
        representedIdentity: "anchor",
      }),
    ]);
    expect(await storedPost(opened.store, "linkedin-from-essay")).toBe(
      "---\ntitle: From Essay\nplatform: linkedin\nstatus: draft\nsourceEntityId: my-essay\nsourceEntityType: post\n---\nRead my essay #essay\n",
    );
    const jobs = await opened.store.shell
      .getJobQueueService()
      .getRecentJobs(undefined, 10);
    expect(
      jobs.map((job) => ({
        type: job.type,
        data: JSON.parse(job.data),
        source: job.source,
        metadata: job.metadata,
      })),
    ).toEqual([
      {
        type: "image:image-generate",
        data: {
          prompt: "Social media graphic for: From Essay",
          title: "From Essay Image",
          aspectRatio: "16:9",
          targetEntityType: "social-post",
          targetEntityId: "linkedin-from-essay",
        },
        source: "social-media",
        metadata: expect.objectContaining({
          operationType: "data_processing",
          pluginId: "social-media",
          interfaceType: "job",
          requestedByActor: {
            kind: "service",
            serviceId: "social-media-generation",
          },
        }),
      },
    ]);
  });

  test("answers a request with nothing to write from, or a source that is gone, and reports it", async () => {
    const opened = await open();
    expect(await generate(opened.store, {})).toMatchObject({
      success: false,
      error: "No content source provided (prompt, sourceEntityId, or content)",
    });
    expect(
      await generate(opened.store, {
        sourceEntityType: "post",
        sourceEntityId: "nope",
      }),
    ).toMatchObject({
      success: false,
      error: "Source entity not found: post/nope",
    });
    expect(opened.heard).toEqual([
      {
        channel: "generate:report:failure",
        payload: {
          entityType: "social-post",
          error:
            "No content source provided (prompt, sourceEntityId, or content)",
        },
      },
      {
        channel: "generate:report:failure",
        payload: {
          entityType: "social-post",
          error: "Source entity not found: post/nope",
        },
      },
    ]);
    expect(
      await opened.store.service.listEntities({ entityType: "social-post" }),
    ).toEqual([]);
  });

  test("asks again for a title that is taken, and lands beside a post with its id", async () => {
    const opened = await open();
    await imported(
      opened.store,
      "linkedin-launch-day",
      "---\ntitle: Launch Day\nplatform: linkedin\nstatus: draft\n---\nx\n",
    );
    expect(
      await generate(opened.store, { title: "Launch Day", content: "Again" }),
    ).toMatchObject({
      success: true,
      entityId: "linkedin-launch-day-again",
      slug: "linkedin-launch-day-again",
    });
    expect(await storedPost(opened.store, "linkedin-launch-day-again")).toBe(
      "---\ntitle: Launch Day Again\nplatform: linkedin\nstatus: draft\n---\nAgain\n",
    );
    await imported(
      opened.store,
      "linkedin-prompted",
      "---\ntitle: Prompted\nplatform: linkedin\nstatus: draft\n---\nFirst\n",
    );
    opened.reply = { title: "Prompted", content: "Prompted body two" };
    expect(
      await generate(opened.store, { prompt: "Write about tea again" }),
    ).toMatchObject({
      success: true,
      entityId: "linkedin-launch-day-again-2",
      slug: "linkedin-launch-day-again",
    });
    expect(await storedPost(opened.store, "linkedin-launch-day-again-2")).toBe(
      "---\ntitle: Launch Day Again\nplatform: linkedin\nstatus: draft\n---\nPrompted body two\n",
    );
  });
});

describe("the scheduled social post generation", () => {
  async function schedule(opened: Opened): Promise<unknown[]> {
    await createServicePluginContext(
      opened.store.shell,
      "content-pipeline",
    ).messaging.command(generateExecuteContract, { entityType: "social-post" });
    const jobs = await opened.store.shell
      .getJobQueueService()
      .getRecentJobs(undefined, 10);
    return jobs
      .filter((job) => job.type === "social-post:generation")
      .map(
        (job) =>
          z.looseObject({ input: z.unknown() }).parse(JSON.parse(job.data))
            .input,
      );
  }

  test("shares a published blog post no social post was written from", async () => {
    const opened = await open();
    await opened.store.service.createEntityFromMarkdown({
      input: { entityType: "post", id: "my-essay", markdown: essay },
    });
    await opened.store.service.createEntityFromMarkdown({
      input: {
        entityType: "post",
        id: "second-essay",
        markdown: essay
          .replace("My Essay", "Second Essay")
          .replace("slug: my-essay", "slug: second-essay"),
      },
    });
    // Written from the first essay already, as a generation records it.
    await imported(
      opened.store,
      "linkedin-shared",
      "---\ntitle: Shared\nplatform: linkedin\nstatus: draft\nsourceEntityId: my-essay\nsourceEntityType: post\n---\nShared\n",
    );
    expect(await schedule(opened)).toEqual([
      { sourceEntityType: "post", sourceEntityId: "second-essay" },
    ]);
  });

  test("reports that every published blog post was shared already", async () => {
    const opened = await open();
    await opened.store.service.createEntityFromMarkdown({
      input: { entityType: "post", id: "my-essay", markdown: essay },
    });
    await imported(
      opened.store,
      "linkedin-shared",
      "---\ntitle: Shared\nplatform: linkedin\nstatus: draft\nsourceEntityId: my-essay\nsourceEntityType: post\n---\nShared\n",
    );
    expect(await schedule(opened)).toEqual([]);
    expect(opened.heard).toEqual([
      {
        channel: "generate:report:failure",
        payload: {
          entityType: "social-post",
          error: expect.stringContaining("published post"),
        },
      },
    ]);
  });
});
