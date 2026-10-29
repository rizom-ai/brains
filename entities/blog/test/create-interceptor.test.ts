import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type { CreateInput } from "@brains/plugins";
import { BlogPlugin } from "../src/plugin";

const executionContext = {
  interfaceType: "test",
  actor: { kind: "user" as const, userId: "test-user" },
};

const essay =
  "# On slowness\n\nI write slowly, and I keep it that way.\n\n> A quote I chose.\n\nThe last paragraph, exactly as written.";
const body =
  "I write slowly, and I keep it that way.\n\n> A quote I chose.\n\nThe last paragraph, exactly as written.";

describe("BlogPlugin create interceptor", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let enqueued: Array<{ type: string; data: unknown }>;

  beforeEach(async () => {
    harness = createPluginHarness({
      dataDir: "/tmp/test-datadir-blog-create",
      logContext: "blog-create-test",
    });
    enqueued = [];
    const mockShell = harness.getMockShell();
    const jobQueue = mockShell.getJobQueueService();
    mockShell.getJobQueueService = (): ReturnType<
      typeof mockShell.getJobQueueService
    > => ({
      ...jobQueue,
      enqueue: async ({ type, data }): Promise<string> => {
        enqueued.push({ type, data });
        return "job-1";
      },
    });
    await harness.installPlugin(new BlogPlugin({}));
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function intercept(input: CreateInput): Promise<unknown> {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("post");
    if (!interceptor) throw new Error("Expected a post create interceptor");
    return interceptor(input, executionContext);
  }

  it("turns plain text into a post: the H1 titles it, the body stays as written, the excerpt is generated", async () => {
    const result = await intercept({ entityType: "post", content: essay });

    expect(result).toMatchObject({
      kind: "handled",
      result: {
        success: true,
        data: { entityId: "on-slowness", status: "generating", jobId: "job-1" },
      },
    });
    expect(enqueued).toEqual([
      {
        type: "post:generation",
        data: { entityId: "on-slowness", title: "On slowness", content: body },
      },
    ]);
    const stub = await harness.getEntityService().getEntity({
      entityType: "post",
      id: "on-slowness",
      visibilityScope: "restricted",
    });
    expect(stub?.metadata).toMatchObject({
      title: "On slowness",
      status: "generating",
    });
  });

  it("drops a leading H1 that repeats the given title", async () => {
    await intercept({
      entityType: "post",
      title: "On Slowness",
      content: essay,
    });
    expect(enqueued[0]?.data).toMatchObject({
      title: "On Slowness",
      content: body,
    });
  });

  it("keeps a leading H1 that differs from the given title", async () => {
    await intercept({
      entityType: "post",
      title: "Slow writing",
      content: essay,
    });
    expect(enqueued[0]?.data).toMatchObject({
      title: "Slow writing",
      content: essay,
    });
  });

  it("asks for a title when the text has none", async () => {
    const result = await intercept({
      entityType: "post",
      content: "Just a paragraph.",
    });
    expect(result).toMatchObject({
      kind: "handled",
      result: { success: false },
    });
    expect(JSON.stringify(result)).toContain("title");
    expect(enqueued).toEqual([]);
  });

  it("imports an essay already published elsewhere with its date and original address", async () => {
    await intercept({
      entityType: "post",
      title: "On slowness",
      content: essay,
      fields: {
        status: "published",
        publishedAt: "2025-03-12",
        canonicalUrl: "https://example.substack.com/p/on-slowness",
      },
    });
    expect(enqueued[0]?.data).toEqual({
      entityId: "on-slowness",
      title: "On slowness",
      content: body,
      status: "published",
      publishedAt: "2025-03-12T00:00:00.000Z",
      canonicalUrl: "https://example.substack.com/p/on-slowness",
    });
  });

  it("keeps post fields the text's own frontmatter already states", async () => {
    await intercept({
      entityType: "post",
      content: `---\nexcerpt: My own summary.\nauthor: Someone\n---\n\n${essay}`,
    });
    expect(enqueued[0]?.data).toMatchObject({
      title: "On slowness",
      content: body,
      excerpt: "My own summary.",
      author: "Someone",
    });
  });

  it("refuses fields a post does not have", async () => {
    const result = await intercept({
      entityType: "post",
      content: essay,
      fields: { mood: "calm" },
    });
    expect(result).toMatchObject({
      kind: "handled",
      result: { success: false },
    });
    expect(JSON.stringify(result)).toContain("mood");
    expect(enqueued).toEqual([]);
  });

  it("refuses an original address that is not a URL", async () => {
    const result = await intercept({
      entityType: "post",
      content: essay,
      fields: { canonicalUrl: "substack" },
    });
    expect(result).toMatchObject({
      kind: "handled",
      result: { success: false },
    });
  });

  it("keeps the requested visibility on the post", async () => {
    await intercept({
      entityType: "post",
      content: essay,
      visibility: "restricted",
    });
    const stub = await harness.getEntityService().getEntity({
      entityType: "post",
      id: "on-slowness",
      visibilityScope: "restricted",
    });
    expect(stub?.visibility).toBe("restricted");
  });

  it("leaves a complete post document to the direct create", async () => {
    const input: CreateInput = {
      entityType: "post",
      content:
        "---\ntitle: Done\nstatus: draft\nexcerpt: Ready.\nauthor: Me\n---\n\nBody",
    };
    expect(await intercept(input)).toEqual({ kind: "continue", input });
    expect(enqueued).toEqual([]);
  });

  it("leaves prompt generation alone", async () => {
    const input: CreateInput = { entityType: "post", prompt: "Write about X" };
    expect(await intercept(input)).toEqual({ kind: "continue", input });
  });
});
