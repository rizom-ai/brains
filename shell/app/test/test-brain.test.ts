import { afterEach, describe, expect, it } from "bun:test";
import { caughtError } from "@brains/test-utils";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { use } from "@brains/sdk";
import { defineEntity } from "@brains/sdk/entities";
import {
  SdkError,
  defineBusContract,
  defineJob,
  defineRoute,
  defineServicePlugin,
  defineTool,
  z,
} from "@brains/sdk/services";
import { startTestBrain, type TestBrain } from "../src/testing";

const note = defineEntity({
  type: "kept-note",
  purpose: "A note to keep",
  metadata: z.object({ pinned: z.boolean().default(false) }),
});

const pinnedCount = defineBusContract({
  channel: "@test/notes:pinned-count",
  request: z.object({}),
  response: z.object({ count: z.number().int() }),
  delivery: "request",
});

const archive = defineJob({
  name: "archive",
  input: z.object({ id: z.string() }),
  output: z.object({ archived: z.string() }),
});

const notes = defineServicePlugin(
  {
    id: "notes",
    config: z.object({ greeting: z.string().default("Hello") }),
    entities: [note],
  },
  {
    tools: ({ config, entities, jobs }) => [
      defineTool({
        name: "keep",
        description: "Keep a note",
        input: z.object({
          id: z.string(),
          content: z.string(),
          pinned: z.boolean().optional(),
        }),
        output: z.object({ id: z.string() }),
        sideEffects: "writes",
        execute: ({ input }) =>
          entities.create(note, {
            id: input.id,
            content: input.content,
            metadata: { pinned: input.pinned ?? false },
          }),
      }),
      defineTool({
        name: "greet",
        description: "Greet as configured",
        input: z.object({}),
        output: z.object({ greeting: z.string() }),
        execute: () => ({ greeting: config.greeting }),
      }),
      defineTool({
        name: "forget",
        description: "Forget a note",
        input: z.object({ id: z.string() }),
        output: z.object({ id: z.string() }),
        confirmation: (input) => `Forget ${input.id}?`,
        sideEffects: "writes",
        execute: ({ input }) => ({ id: input.id }),
      }),
      defineTool({
        name: "archive",
        description: "Archive a note, as durable work",
        input: archive.input,
        output: z.object({ jobId: z.string() }),
        sideEffects: "writes",
        execute: async ({ input }) => ({
          jobId: (await jobs.enqueue(archive, input)).id,
        }),
      }),
    ],
    jobs: ({ entities }) => [
      archive.handle(async ({ input }) => {
        const item = await entities.get(note, input.id);
        if (!item) {
          throw new SdkError("not_found", {
            message: `Note ${input.id} is missing`,
          });
        }
        return { archived: item.content };
      }),
    ],
    subscriptions: ({ answer, entities }) => [
      answer(pinnedCount, async () => ({
        count: (await entities.list(note)).filter(
          (item) => item.metadata.pinned,
        ).length,
      })),
    ],
    routes: ({ entities }) => [
      defineRoute({
        method: "GET",
        path: "/notes/count",
        security: { kind: "public" },
        response: z.object({ count: z.number().int() }),
        handle: async () => ({ count: await entities.count(note) }),
      }),
    ],
  },
);

const brainVersion = "0.2.0-alpha.500";
const directories: string[] = [];
const brains: TestBrain[] = [];

afterEach(async () => {
  for (const brain of brains.splice(0)) await brain.stop();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** A package directory, as an author's checkout of their package is one. */
function packageDirectory(
  peerRange: string = ">=0.2.0-alpha.0 <0.3.0",
): string {
  const directory = mkdtempSync(join(tmpdir(), "test-brain-package-"));
  directories.push(directory);
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({
      name: "@test/notes",
      version: "1.2.3",
      type: "module",
      peerDependencies: { "@rizom/brain": peerRange },
    }),
  );
  return directory;
}

/** Where a brain keeps what it stores, apart from the package. */
function temporaryRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), "test-brain-storage-"));
  directories.push(directory);
  return directory;
}

async function start(
  directory: string = packageDirectory(),
  greeting?: string,
  storage: string = temporaryRoot(),
): Promise<TestBrain> {
  const brain = await startTestBrain(
    {
      plugins: [use(notes, greeting === undefined ? {} : { greeting })],
    },
    { directory, brainVersion, temporaryRoot: storage },
  );
  brains.push(brain);
  return brain;
}

/** Why a call was refused; a call that answers fails the test. */
async function refusal(call: PromiseLike<unknown>): Promise<string> {
  return caughtError(await Promise.resolve(call).catch(caughtError)).message;
}

const queued = z.object({
  success: z.literal(true),
  data: z.object({ jobId: z.string() }),
});

describe("a test brain", () => {
  it("calls a tool as the brain's operator and reads back what it stored", async () => {
    const brain = await start();

    expect(
      await brain.tool("notes_keep", { id: "milk", content: "Buy milk" }),
    ).toEqual({ success: true, data: { id: "milk" } });
    const stored = await brain.entities.get(note, "milk");
    expect(stored?.content).toBe("Buy milk");
    expect(stored?.metadata).toEqual({ pinned: false });
    expect(await brain.entities.count(note)).toBe(1);
  });

  it("configures a package as use() configures it", async () => {
    const brain = await start(packageDirectory(), "Hi");

    expect(await brain.tool("notes_greet", {})).toEqual({
      success: true,
      data: { greeting: "Hi" },
    });
  });

  it("answers a refused call in its public form", async () => {
    const brain = await start();

    expect(await brain.tool("notes_keep", { id: "milk" })).toMatchObject({
      success: false,
      code: "invalid_input",
    });
  });

  it("tells a pending approval by its summary alone", async () => {
    const brain = await start();

    expect(await brain.tool("notes_forget", { id: "milk" })).toEqual({
      needsConfirmation: true,
      summary: "Forget milk?",
    });
  });

  it("refuses a tool no package declares, naming the tools it has", async () => {
    const brain = await start();

    expect(await refusal(brain.tool("notes_missing", {}))).toMatch(
      /^No tool "notes_missing"; this brain has .*notes_keep/u,
    );
  });

  it("asks a contract as the brain itself asks", async () => {
    const brain = await start();
    await brain.tool("notes_keep", { id: "a", content: "A", pinned: true });
    await brain.tool("notes_keep", { id: "b", content: "B" });

    expect(await brain.request(pinnedCount, {})).toEqual({
      status: "answered",
      data: { count: 1 },
    });
  });

  it("serves the routes its packages declare, and nothing else", async () => {
    const brain = await start();
    await brain.tool("notes_keep", { id: "a", content: "A" });

    const served = await brain.fetch(
      new Request("https://brain.test/notes/count"),
    );
    expect(served.status).toBe(200);
    expect(await served.json()).toEqual({ count: 1 });
    expect(
      (await brain.fetch(new Request("https://brain.test/notes/other"))).status,
    ).toBe(404);
  });

  it("waits for a job and reads its result by its definition", async () => {
    const brain = await start();
    await brain.tool("notes_keep", { id: "milk", content: "Buy milk" });
    const { data } = queued.parse(
      await brain.tool("notes_archive", { id: "milk" }),
    );

    expect(await brain.jobs.wait(archive, data.jobId)).toMatchObject({
      id: data.jobId,
      status: "completed",
      result: { archived: "Buy milk" },
    });
  });

  it("waits for a failed attempt and reports its code while the job waits to be retried", async () => {
    const brain = await start();
    const { data } = queued.parse(
      await brain.tool("notes_archive", { id: "missing" }),
    );

    const status = await brain.jobs.wait(archive, data.jobId);
    expect(status).toMatchObject({ code: "not_found", error: "Not found" });
    expect(status?.status).toBe("pending");
    expect(JSON.stringify(status)).not.toContain("is missing");
  });

  it("finds no job of a definition by another definition's id", async () => {
    const brain = await start();
    const other = defineJob({
      name: "other",
      input: z.object({}),
      output: z.object({}),
    });
    await brain.tool("notes_keep", { id: "milk", content: "Buy milk" });
    const { data } = queued.parse(
      await brain.tool("notes_archive", { id: "milk" }),
    );

    expect(await brain.jobs.wait(other, data.jobId)).toBeNull();
    expect(await brain.jobs.wait(archive, "no-such-job")).toBeNull();
  });

  it("names its packages by the nearest manifest, so their channels are theirs", async () => {
    const root = packageDirectory();
    const nested = join(root, "test");
    mkdirSync(nested);
    const brain = await start(nested);

    expect(await brain.request(pinnedCount, {})).toEqual({
      status: "answered",
      data: { count: 0 },
    });
  });

  it("refuses a package whose Brain peer range the brain does not satisfy", async () => {
    expect(await refusal(start(packageDirectory(">=0.3.0 <0.4.0")))).toBe(
      'Package "@test/notes@1.2.3" requires @rizom/brain ">=0.3.0 <0.4.0", but "0.2.0-alpha.500" is installed; install a compatible Brain version or update the peer range only after testing that release',
    );
  });

  it("refuses a plugin that use() did not configure", async () => {
    const directory = packageDirectory();
    expect(
      await refusal(
        startTestBrain(
          // @ts-expect-error The brain runs what use() configured, as defineBrain does.
          { plugins: [notes] },
          { directory, brainVersion },
        ),
      ),
    ).toBe(
      "A test brain runs packages configured with use(), as defineBrain does",
    );
  });

  it("stores nothing in the package directory and deletes what it stored on stop", async () => {
    const directory = packageDirectory();
    const storage = temporaryRoot();
    const brain = await start(directory, undefined, storage);
    await brain.tool("notes_keep", { id: "milk", content: "Buy milk" });
    const [kept] = readdirSync(storage);

    expect(readdirSync(directory)).toEqual(["package.json"]);
    expect(kept).toBeDefined();
    expect(readdirSync(join(storage, kept ?? ""))).toContain("brain.db");
    await brain.stop();
    await brain.stop();
    expect(readdirSync(storage)).toEqual([]);
  });
});
