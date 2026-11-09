import { afterEach, describe, expect, spyOn, test } from "bun:test";
import type { CreateExecutionContext } from "@brains/plugins";
import linkPackage from "@brains/link";
import { createMockProgressReporter } from "@brains/test-utils";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared links on the brain's own entity store: every link stored as
 * the link adapter wrote it, byte for byte (a hand-written file in its own
 * order), whether imported, updated, captured from a request or by its
 * capture job, and the capture queued as the link plugin class queued it.
 */

const stores: DeclaredEntityStore[] = [];
const restores: Array<() => void> = [];
afterEach(async () => {
  for (const restore of restores.splice(0)) restore();
  for (const store of stores.splice(0)) await store.close();
});

let reply: unknown;
let page: { status: number; body: string };

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    linkPackage,
    "@brains/link",
    "link",
    {
      projectionSourceRole: "supporting",
      retiredFields: ["domain"],
    },
  );
  opened.shell.generateContent = async (): Promise<unknown> => reply;
  reply = {
    success: true,
    error: "",
    title: "Example Page",
    description: "An example.",
    summary: "It explains examples.",
  };
  page = {
    status: 200,
    body: "# Example\n\nSome page text that is long enough.\n\nMore.",
  };
  const fetched = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (): Promise<Response> =>
        new Response(page.body, { status: page.status }),
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  restores.push(() => fetched.mockRestore());
  stores.push(opened);
  return opened;
}

/** A stored document with its capture time, which the run sets, masked. */
async function stored(
  opened: DeclaredEntityStore,
  id: string,
): Promise<string | undefined> {
  return (await opened.stored("link", id))?.content.replace(
    /capturedAt: '[^']+'/u,
    "capturedAt: <now>",
  );
}

async function imported(
  opened: DeclaredEntityStore,
  id: string,
  markdown: string,
): Promise<string | undefined> {
  await opened.service.createEntityFromMarkdown({
    input: { entityType: "link", id, markdown },
  });
  return (await opened.stored("link", id))?.content;
}

const reordered =
  "---\ntitle: Reordered\nurl: https://example.com/b\nnote: kept\nstatus: published\ncapturedAt: 2025-01-01T00:00:00.000Z\nsource:\n  label: CLI\n  ref: cli:local\ndomain: example.com\n---\n\nSummary\n";

const matrix = {
  interfaceType: "matrix",
  actor: { kind: "user", userId: "u1" },
  userPermissionLevel: "admin",
  channelId: "!room:server",
  channelName: "#eng",
} satisfies CreateExecutionContext;

describe("the declared links on the entity store", () => {
  // Each expected document is what the link adapter stored for it.
  test.each([
    [
      "a link in the adapter's order",
      "---\nstatus: draft\ntitle: Example\nurl: https://example.com/a\ndescription: An example.\ncapturedAt: 2025-01-01T00:00:00.000Z\nsource:\n  ref: cli:local\n  label: CLI\n---\nSummary text\n",
      "---\nstatus: draft\ntitle: Example\nurl: 'https://example.com/a'\ndescription: An example.\ncapturedAt: '2025-01-01T00:00:00.000Z'\nsource:\n  ref: 'cli:local'\n  label: CLI\n---\nSummary text\n",
    ],
    [
      "a hand-written link in its own order",
      reordered,
      "---\ntitle: Reordered\nurl: 'https://example.com/b'\nnote: kept\nstatus: published\ncapturedAt: '2025-01-01T00:00:00.000Z'\nsource:\n  label: CLI\n  ref: 'cli:local'\n---\nSummary\n",
    ],
    [
      "a pending link without a description or summary",
      "---\nstatus: pending\ntitle: example.com\nurl: https://example.com/c\ncapturedAt: 2025-01-01T00:00:00.000Z\nsource:\n  ref: mcp:local\n  label: MCP\n---\n",
      "---\nstatus: pending\ntitle: example.com\nurl: 'https://example.com/c'\ncapturedAt: '2025-01-01T00:00:00.000Z'\nsource:\n  ref: 'mcp:local'\n  label: MCP\n---\n\n",
    ],
  ])("stores %s as the link adapter wrote it", async (_, markdown, content) => {
    const opened = await store();
    expect(await imported(opened, "link-1", markdown)).toBe(content);
  });

  test("keeps a hand-written link's order through an update of its summary", async () => {
    const opened = await store();
    await imported(opened, "reordered", reordered);
    const read = await opened.service.getEntity({
      entityType: "link",
      id: "reordered",
    });
    if (!read) throw new Error("Missing link");
    await opened.service.updateEntity({
      entity: {
        ...read,
        content: read.content.replace("Summary", "Changed summary"),
      },
    });
    expect((await opened.stored("link", "reordered"))?.content).toBe(
      "---\ntitle: Reordered\nurl: 'https://example.com/b'\nnote: kept\nstatus: published\ncapturedAt: '2025-01-01T00:00:00.000Z'\nsource:\n  label: CLI\n  ref: 'cli:local'\n---\nChanged summary\n",
    );
  });
});

describe("a link captured from a request on the entity store", () => {
  async function intercept(
    opened: DeclaredEntityStore,
    input: Record<string, unknown>,
    caller: CreateExecutionContext = matrix,
  ): Promise<unknown> {
    const interceptor = opened.shell
      .getEntityRegistry()
      .getCreateInterceptor("link");
    if (!interceptor) throw new Error("No link create interceptor");
    return interceptor({ entityType: "link", ...input }, caller);
  }

  test("writes the class's pending link and queues the capture as it did", async () => {
    const opened = await store();
    expect(
      await intercept(opened, { url: "https://example.com/page" }),
    ).toEqual({
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: "example-com-3641c5",
          status: "generating",
          jobId: expect.any(String),
        },
      },
    });
    expect(await stored(opened, "example-com-3641c5")).toBe(
      "---\nstatus: pending\ntitle: example.com\nurl: 'https://example.com/page'\ndescription: Link capture is in progress.\ncapturedAt: <now>\nsource:\n  ref: 'matrix:!room:server'\n  label: '#eng'\n---\nPending link capture for https://example.com/page.\n",
    );
    const [job] = await opened.shell
      .getJobQueueService()
      .getRecentJobs(undefined, 10);
    expect(job?.type).toBe("link:capture");
    expect(JSON.parse(job?.data ?? "{}")).toEqual({
      url: "https://example.com/page",
      metadata: {
        interfaceId: "matrix",
        userId: "u1",
        channelId: "!room:server",
        channelName: "#eng",
        timestamp: expect.any(String),
      },
    });
    expect(job?.source).toBe("link");
    expect(job?.metadata).toMatchObject({
      operationType: "data_processing",
      pluginId: "link",
      interfaceType: "matrix",
      requestedByActor: { kind: "user", userId: "u1" },
      requestedByUserId: "u1",
      channelId: "!room:server",
    });
  });

  test("answers a link that exists at another visibility as the class did", async () => {
    const opened = await store();
    await intercept(opened, { url: "https://example.com/page" });
    expect(
      await intercept(opened, {
        url: "https://example.com/page",
        visibility: "restricted",
      }),
    ).toEqual({
      kind: "handled",
      result: {
        success: false,
        error:
          'Existing link visibility "public" does not match requested visibility "restricted".',
      },
    });
  });

  test("saves a full link document as written, and captures one whose id is taken", async () => {
    const opened = await store();
    const document =
      "---\ntitle: Direct\nurl: https://example.com/direct\nstatus: draft\ncapturedAt: 2025-02-02T00:00:00.000Z\nsource:\n  ref: cli:local\n  label: CLI\n---\nDirect summary";
    const cli: CreateExecutionContext = {
      interfaceType: "cli",
      actor: { kind: "user", userId: "u2" },
      userPermissionLevel: "admin",
    };
    expect(await intercept(opened, { content: document }, cli)).toEqual({
      kind: "handled",
      result: {
        success: true,
        data: { entityId: "httpsexamplecomdirect", status: "created" },
      },
    });
    expect(await opened.stored("link", "httpsexamplecomdirect")).toMatchObject({
      content:
        "---\ntitle: Direct\nurl: 'https://example.com/direct'\nstatus: draft\ncapturedAt: '2025-02-02T00:00:00.000Z'\nsource:\n  ref: 'cli:local'\n  label: CLI\n---\nDirect summary\n",
    });
    expect(
      await intercept(
        opened,
        { content: document.replace("Direct summary", "Again") },
        cli,
      ),
    ).toMatchObject({
      result: {
        success: true,
        data: { entityId: "example-com-f25a25", status: "generating" },
      },
    });
  });

  test("stores a full link document that validates byte for byte as written", async () => {
    const opened = await store();
    const document =
      "---\nstatus: published\ntitle: As Written\nurl: 'https://example.com/as-written'\ndescription: Kept.\ncapturedAt: '2025-02-02T00:00:00.000Z'\nsource:\n  ref: 'cli:local'\n  label: CLI\n---\nWritten summary\n";
    const cli: CreateExecutionContext = {
      interfaceType: "cli",
      actor: { kind: "user", userId: "u2" },
      userPermissionLevel: "admin",
    };
    expect(await intercept(opened, { content: document }, cli)).toEqual({
      kind: "handled",
      result: {
        success: true,
        data: { entityId: "httpsexamplecomas-written", status: "created" },
      },
    });
    expect(
      (await opened.stored("link", "httpsexamplecomas-written"))?.content,
    ).toBe(document);
  });

  test("captures the URL of a full link document that does not validate, as the class did", async () => {
    const opened = await store();
    const cli: CreateExecutionContext = {
      interfaceType: "cli",
      actor: { kind: "user", userId: "u2" },
      userPermissionLevel: "admin",
    };
    const answer = await intercept(
      opened,
      {
        content:
          "---\ntitle: Invalid\nurl: https://example.com/invalid\nstatus: archived\n---\nNot a link's status",
      },
      cli,
    );
    expect(answer).toMatchObject({
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: expect.stringMatching(/^example-com-/u),
          status: "generating",
        },
      },
    });
    const ids = (await opened.service.listEntities({ entityType: "link" })).map(
      ({ id }) => id,
    );
    expect(ids).not.toContain("httpsexamplecominvalid");
    const [captured] = ids;
    expect(await stored(opened, captured ?? "")).toBe(
      "---\nstatus: pending\ntitle: example.com\nurl: 'https://example.com/invalid'\ndescription: Link capture is in progress.\ncapturedAt: <now>\nsource:\n  ref: 'cli:local'\n  label: CLI\n---\nPending link capture for https://example.com/invalid.\n",
    );
    const queued = await opened.shell
      .getJobQueueService()
      .getRecentJobs(undefined, 10);
    expect(queued.map((job) => job.type)).toEqual(["link:capture"]);
  });
});

describe("the declared link capture on the entity store", () => {
  async function capture(
    opened: DeclaredEntityStore,
    type: "link:capture" | "link:generation",
    data: unknown,
  ): Promise<unknown> {
    const handler = opened.shell.getJobQueueService().getHandler(type);
    if (!handler) throw new Error(`No ${type}`);
    return handler.process(
      handler.validateAndParse(data),
      "job-under-test",
      createMockProgressReporter(),
      new AbortController().signal,
    );
  }

  test("fills the pending link as a draft, and answers it as captured after", async () => {
    const opened = await store();
    const interceptor = opened.shell
      .getEntityRegistry()
      .getCreateInterceptor("link");
    await interceptor?.(
      { entityType: "link", url: "https://example.com/page" },
      matrix,
    );
    const data = {
      url: "https://example.com/page",
      metadata: {
        interfaceId: "matrix",
        userId: "u1",
        channelId: "!room:server",
        channelName: "#eng",
        timestamp: "2025-01-01T00:00:00.000Z",
      },
    };
    const captured = {
      success: true,
      entityId: "example-com-3641c5",
      title: "Example Page",
      url: "https://example.com/page",
      status: "draft",
    };
    expect(await capture(opened, "link:capture", data)).toEqual(captured);
    expect(await stored(opened, "example-com-3641c5")).toBe(
      "---\nstatus: draft\ntitle: Example Page\nurl: 'https://example.com/page'\ndescription: An example.\ncapturedAt: <now>\nsource:\n  ref: 'matrix:!room:server'\n  label: '#eng'\n---\nIt explains examples.\n",
    );
    expect(
      await capture(opened, "link:capture", {
        url: "https://example.com/page",
      }),
    ).toEqual(captured);
  });

  test("keeps an incomplete extraction pending with what it found", async () => {
    const opened = await store();
    reply = {
      success: true,
      error: "",
      title: "",
      description: "",
      summary: "",
    };
    expect(
      await capture(opened, "link:capture", {
        url: "https://example.com/incomplete",
      }),
    ).toEqual({
      success: true,
      entityId: "example-com-61072d",
      title: "example.com",
      url: "https://example.com/incomplete",
      status: "pending",
    });
    expect(await stored(opened, "example-com-61072d")).toBe(
      "---\nstatus: pending\ntitle: example.com\nurl: 'https://example.com/incomplete'\ndescription: ''\ncapturedAt: <now>\nsource:\n  ref: 'cli:local'\n  label: CLI\n---\n\n",
    );
  });

  test("keeps a page out of reach pending with why", async () => {
    const opened = await store();
    page = { status: 404, body: "" };
    expect(
      await capture(opened, "link:capture", {
        url: "https://example.com/missing",
        metadata: { interfaceId: "cli" },
      }),
    ).toEqual({
      success: false,
      entityId: "example-com-5f3c18",
      title: "example.com",
      url: "https://example.com/missing",
      status: "pending",
      error:
        "Could not capture link: Page not found: https://example.com/missing",
    });
    expect(await stored(opened, "example-com-5f3c18")).toBe(
      "---\nstatus: pending\ntitle: example.com\nurl: 'https://example.com/missing'\ndescription: 'Could not capture link: Page not found: https://example.com/missing'\ncapturedAt: <now>\nsource:\n  ref: 'cli:local'\n  label: CLI\n---\nCould not capture link: Page not found: https://example.com/missing\n",
    );
  });

  test("captures under the class's generation job name too", async () => {
    const opened = await store();
    reply = {
      success: true,
      error: "",
      title: "Gen Page",
      description: "Gen.",
      summary: "Gen summary.",
    };
    expect(
      await capture(opened, "link:generation", {
        url: "https://example.com/gen",
      }),
    ).toEqual({
      success: true,
      entityId: "example-com-9f24c9",
      title: "Gen Page",
      url: "https://example.com/gen",
      status: "draft",
    });
    expect(await stored(opened, "example-com-9f24c9")).toBe(
      "---\nstatus: draft\ntitle: Gen Page\nurl: 'https://example.com/gen'\ndescription: Gen.\ncapturedAt: <now>\nsource:\n  ref: 'cli:local'\n  label: CLI\n---\nGen summary.\n",
    );
  });
});
