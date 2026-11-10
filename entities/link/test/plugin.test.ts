import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { BaseEntity, EntityAdapter } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { linkMetadataSchema, type LinkEntity } from "../src";
import {
  createMockLinkEntity,
  mockLinkContent,
} from "./fixtures/link-entities";
import { linkPlugin } from "./link-plugin";

const caller = {
  interfaceType: "test",
  actor: { kind: "user" as const, userId: "test-user" },
  userPermissionLevel: "admin" as const,
};

describe("the link adapter", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let adapter: EntityAdapter<BaseEntity>;

  beforeEach(async () => {
    harness = createPluginHarness();
    await harness.installPlugin(linkPlugin());
    adapter = harness.getEntityRegistry().getAdapter("link");
  });

  afterEach(async () => {
    await harness.reset();
  });

  it("reads the frontmatter as metadata and the summary as the body", () => {
    const parsed = adapter.fromMarkdown(mockLinkContent.simple);
    expect(parsed.metadata).toEqual({
      status: "draft",
      title: "Test Article",
      url: "https://example.com/test",
      description: "Test description",
      capturedAt: "2025-01-30T10:00:00.000Z",
      source: { ref: "cli:local", label: "CLI" },
    });
    // A link stored with a domain still parses; the copy is not kept.
    expect(parsed.metadata).not.toHaveProperty("domain");
    expect(parsed.content).toBe("Test summary");
  });

  it("writes a new link's frontmatter in the order the adapter wrote it", () => {
    const entity: LinkEntity = createMockLinkEntity({
      id: "test-id",
      content: "This is a test article summary.",
      metadata: linkMetadataSchema.parse({
        status: "draft",
        title: "Test Article",
        url: "https://example.com/test",
        description: "A test article",
        capturedAt: "2025-01-30T10:00:00.000Z",
        source: { ref: "cli:local", label: "CLI" },
      }),
    });
    expect(adapter.toMarkdown(entity)).toBe(
      "---\nstatus: draft\ntitle: Test Article\nurl: 'https://example.com/test'\ndescription: A test article\ncapturedAt: '2025-01-30T10:00:00.000Z'\nsource:\n  ref: 'cli:local'\n  label: CLI\n---\nThis is a test article summary.\n",
    );
  });
});

describe("the link create routes", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });
    await harness.installPlugin(linkPlugin());
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function intercept(
    input: Record<string, unknown>,
    context: Record<string, unknown> = {},
  ): Promise<unknown> {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("link");
    if (!interceptor) throw new Error("Expected link create interceptor");
    return interceptor(
      { entityType: "link", ...input },
      { ...caller, ...context },
    );
  }

  async function queued(): Promise<
    Array<{ type: string; data: unknown; metadata: unknown }>
  > {
    const jobs = await harness
      .getMockShell()
      .getJobQueueService()
      .getRecentJobs(undefined, 10);
    return jobs.map(({ type, data, metadata }) => ({
      type,
      data: JSON.parse(data),
      metadata,
    }));
  }

  it("captures the URL a prompt names: a pending link and the capture, in the caller's channel", async () => {
    const result = await intercept(
      {
        visibility: "shared",
        prompt: "Save this: https://anthropic.com/research",
      },
      { channelId: "!room:test", channelName: "#test" },
    );

    expect(result).toMatchObject({
      kind: "handled",
      result: {
        success: true,
        data: { entityId: "anthropic-com-abdc4a", status: "generating" },
      },
    });
    const pending = await harness.getEntityService().getEntity({
      entityType: "link",
      id: "anthropic-com-abdc4a",
      visibilityScope: "shared",
    });
    expect(pending?.metadata).toEqual({
      status: "pending",
      title: "anthropic.com",
      url: "https://anthropic.com/research",
      description: "Link capture is in progress.",
      capturedAt: expect.any(String),
      source: { ref: "matrix:!room:test", label: "#test" },
    });
    expect(pending?.content).toBe(
      "Pending link capture for https://anthropic.com/research.",
    );
    expect(pending?.visibility).toBe("shared");
    expect(await queued()).toEqual([
      {
        type: "link:capture",
        data: {
          url: "https://anthropic.com/research",
          metadata: {
            interfaceId: "test",
            userId: "test-user",
            channelId: "!room:test",
            channelName: "#test",
            timestamp: expect.any(String),
          },
        },
        metadata: expect.objectContaining({
          operationType: "data_processing",
          requestedByActor: { kind: "user", userId: "test-user" },
          requestedByUserId: "test-user",
          channelId: "!room:test",
        }),
      },
    ]);
  });

  it("prefers the request's URL to one its prompt names", async () => {
    await intercept({
      url: "https://anthropic.com/research",
      prompt: "Save this: https://different.example.com/ignored",
    });
    expect((await queued()).map(({ data }) => data)).toEqual([
      {
        url: "https://anthropic.com/research",
        metadata: {
          interfaceId: "test",
          userId: "test-user",
          timestamp: expect.any(String),
        },
      },
    ]);
  });

  it("captures a URL alone, as system_create hands a URL source on", async () => {
    expect(
      await intercept({ url: "https://anthropic.com/research" }),
    ).toMatchObject({
      result: { success: true, data: { entityId: "anthropic-com-abdc4a" } },
    });
  });

  it("saves a full link document as written", async () => {
    const markdown = `---
status: draft
title: Anthropic Research
url: https://anthropic.com/research
description: Research updates from Anthropic
domain: anthropic.com
capturedAt: "2026-04-14T08:00:00.000Z"
source:
  ref: "manual:local"
  label: MANUAL
---

A saved research link.`;
    expect(await intercept({ content: markdown })).toEqual({
      kind: "handled",
      result: {
        success: true,
        data: { entityId: "httpsanthropiccomresearch", status: "created" },
      },
    });
    expect(await queued()).toEqual([]);
  });

  it("refuses text and prompts that name no URL, and leaves a title alone to the ordinary create", async () => {
    expect(await intercept({ content: "just some text" })).toEqual({
      kind: "handled",
      result: {
        success: false,
        error:
          "Direct link creation requires full link markdown/frontmatter, or provide a URL to capture.",
      },
    });
    expect(await intercept({ prompt: "save something" })).toEqual({
      kind: "handled",
      result: {
        success: false,
        error:
          "Link creation requires a URL in the prompt, content, or title, or full link markdown content for direct creation.",
      },
    });
    expect(await intercept({ title: "Nothing" })).toEqual({
      kind: "continue",
      input: { entityType: "link", title: "Nothing" },
    });
  });
});
