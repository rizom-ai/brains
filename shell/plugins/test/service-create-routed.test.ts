import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  createMockProgressReporter,
  createSilentLogger,
  stubMethod,
} from "@brains/test-utils";
import type { JobHandler } from "@brains/job-queue";
import { PermissionService } from "@brains/templates";
import { createPluginHarness } from "../src/test/harness";
import type { CreateResult, ToolContext } from "../src";
import {
  defineEntity,
  defineEntityPackage,
  defineJob,
  defineServicePlugin,
  defineTool,
  frontmatterInContent,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * A service asks the owner of a type to create one.
 *
 * Writes are scoped to the types a package declares, and that rule holds. A
 * service that has bytes for an image does not write an image: it hands the
 * request to the image type's declared create route — the same route
 * `system_create` would take — and the owner writes. What the service gets
 * back is what the runtime did, attributed to whoever asked the service.
 *
 * No fallback. `system_create` writes an ordinary entity when no route claims
 * the input; from a service that would be the trespass this exists to
 * remove, so an unclaimed input is refused.
 */

const caller: ToolContext = {
  interfaceType: "test",
  actor: { kind: "user", userId: "tester" },
  userPermissionLevel: "admin",
};

const poster = defineEntity({
  type: "poster",
  purpose: "A picture handed over whole.",
  metadata: z.object({ title: z.string(), by: z.string().optional() }),
  create: {
    fromContent: {
      resolve: async ({ input }) => ({
        create: {
          id: "poster-1",
          content: input.content ?? "",
          metadata: { title: input.title ?? "Poster" },
        },
        ...(input.targetEntityType && input.targetEntityId
          ? {
              linkInto: {
                entityType: input.targetEntityType,
                entityId: input.targetEntityId,
                field: "coverImageId",
              },
            }
          : {}),
      }),
    },
  },
});

const titleMetadata = z.object({ title: z.string() });
const notice = defineEntity({
  type: "notice",
  purpose: "Something a poster can be the cover of.",
  metadata: titleMetadata,
  markdown: frontmatterInContent((frontmatter) =>
    titleMetadata.parse(frontmatter),
  ),
  coverImage: true,
});

const requestInput = z.object({
  content: z.string(),
  entityType: z.string().default("poster"),
  target: z.string().optional(),
});

const pickJob = defineJob({
  name: "pick",
  input: requestInput,
  output: z.object({ status: z.string(), entityId: z.string().optional() }),
});

/** A service owning no types, which needs a poster made. */
function printShop(): ReturnType<typeof defineServicePlugin> {
  return defineServicePlugin(
    {
      id: "print-shop",
      config: z.object({}),
    },
    {
      tools: ({ jobs }) => [
        defineTool({
          name: "order",
          description: "Order a poster from bytes.",
          input: requestInput,
          output: z.object({
            status: z.string(),
            entityId: z.string().optional(),
          }),
          sideEffects: "writes",
          execute: async ({ input, createRouted }) => {
            const result = await createRouted({
              entityType: input.entityType,
              content: input.content,
              title: "Ordered",
              ...(input.target
                ? { targetEntityType: "notice", targetEntityId: input.target }
                : {}),
            });
            return outcome(result);
          },
        }),
        defineTool({
          name: "queue",
          description: "Order a poster later.",
          input: requestInput,
          output: z.object({ jobId: z.string() }),
          sideEffects: "writes",
          execute: async ({ input }) => ({
            jobId: (await jobs.enqueue(pickJob, input)).id,
          }),
        }),
      ],
      jobs: () => [
        pickJob.handle(async ({ input, createRouted }) =>
          outcome(
            await createRouted({
              entityType: input.entityType,
              content: input.content,
              title: "Queued",
            }),
          ),
        ),
      ],
    },
  );
}

function outcome(result: CreateResult): {
  status: string;
  entityId?: string;
} {
  if (!result.success) return { status: `refused: ${result.error}` };
  return {
    status: result.data.status,
    ...(result.data.entityId ? { entityId: result.data.entityId } : {}),
  };
}

async function installed(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  order: (input: unknown, who?: ToolContext) => Promise<unknown>;
  queue: (input: unknown, who?: ToolContext) => Promise<unknown>;
  handlers: Map<string, JobHandler>;
}> {
  const harness = createPluginHarness({
    logger: createSilentLogger("service-create-routed"),
  });
  // A poster takes someone trusted to order; the fake shell's default policy
  // allows everything, which would let the refusal case pass for no reason.
  harness.getMockShell().getPermissionService = (): PermissionService =>
    new PermissionService({
      entityActions: { poster: { create: "trusted" } },
    });
  const handlers = new Map<string, JobHandler>();
  const queue = harness.getMockShell().getJobQueueService();
  stubMethod(queue, "registerHandler", (name, handler) => {
    handlers.set(name, handler);
  });
  harness.getMockShell().getJobQueueService = (): typeof queue => queue;

  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "notices", entities: [poster, notice] }),
    {},
    { name: "@fixture/notices", version: "0.1.0" },
  )) {
    await harness.installPlugin(plugin);
  }
  const [shop] = instantiatePluginPackageDefinition(
    printShop(),
    {},
    {
      name: "@fixture/print-shop",
      version: "0.1.0",
    },
  );
  if (!shop) throw new Error("Service plugin was not created");
  const capabilities = await harness.installPlugin(shop);
  const tool = (name: string): NonNullable<(typeof capabilities.tools)[0]> => {
    const found = capabilities.tools.find((candidate) =>
      candidate.name.endsWith(`_${name}`),
    );
    if (!found) throw new Error(`Tool ${name} was not registered`);
    return found;
  };
  return {
    harness,
    handlers,
    order: (input, who = caller) => tool("order").handler(input, who),
    queue: (input, who = caller) => tool("queue").handler(input, who),
  };
}

describe("a service creating through the owner's route", () => {
  it("has the owner write, and the target linked, for the caller", async () => {
    const { harness, order } = await installed();
    harness.addEntities([
      {
        id: "notice-1",
        entityType: "notice",
        content: "---\ntitle: Open Day\n---\nCome along.",
        contentHash: "notice-1-hash",
        metadata: { title: "Open Day" },
      },
    ]);

    const result = await order({ content: "bytes", target: "notice-1" });

    expect(result).toMatchObject({
      success: true,
      data: { status: "created", entityId: "poster-1" },
    });
    const entities = harness.getEntityService();
    expect(
      (await entities.getEntity({ entityType: "poster", id: "poster-1" }))
        ?.content,
    ).toContain("bytes");
    expect(
      (await entities.getEntity({ entityType: "notice", id: "notice-1" }))
        ?.content,
    ).toContain("coverImageId: poster-1");

    await harness.reset();
  });

  it("refuses an input no route claims rather than writing a foreign type", async () => {
    const { harness, order } = await installed();

    // `notice` declares no create route: system_create would fall through to
    // an ordinary write here, and from a service that is exactly the write
    // this door exists to keep shut.
    const result = await order({ content: "bytes", entityType: "notice" });

    expect(result).toMatchObject({
      success: true,
      data: {
        status: expect.stringContaining("refused: Entity type 'notice'"),
      },
    });
    expect(
      await harness.getEntityService().listEntities({ entityType: "notice" }),
    ).toHaveLength(0);

    await harness.reset();
  });

  it("refuses a caller the type's policy refuses", async () => {
    const { harness, order } = await installed();

    const result = await order(
      { content: "bytes" },
      { ...caller, userPermissionLevel: "public" },
    );

    expect(result).toMatchObject({
      success: true,
      data: { status: expect.stringContaining("refused:") },
    });
    expect(
      await harness.getEntityService().listEntities({ entityType: "poster" }),
    ).toHaveLength(0);

    await harness.reset();
  });
});

describe("a job creating through the owner's route", () => {
  it("is attributed to whoever asked the service", async () => {
    const { harness, queue, handlers } = await installed();
    const queued = await queue({ content: "later" });
    if (!queued || typeof queued !== "object" || !("data" in queued)) {
      throw new Error("Queue tool did not answer");
    }
    const { jobId } = z.object({ jobId: z.string() }).parse(queued.data);
    const handler = handlers.get("@fixture/print-shop:print-shop:pick");
    if (!handler) throw new Error("Pick job handler was not registered");

    const result = await handler.process(
      { content: "later", entityType: "poster" },
      jobId,
      createMockProgressReporter(),
      new AbortController().signal,
    );

    // The job carries who enqueued it, so the owner's route runs for them —
    // the same request from a job nobody is recorded as having asked for is
    // refused, which is what the next case shows.
    expect(result).toMatchObject({ status: "created", entityId: "poster-1" });
    expect(
      (
        await harness
          .getEntityService()
          .getEntity({ entityType: "poster", id: "poster-1" })
      )?.content,
    ).toContain("later");

    await harness.reset();
  });

  it("refuses when nobody is recorded as having asked", async () => {
    const { harness, handlers } = await installed();
    const handler = handlers.get("@fixture/print-shop:print-shop:pick");
    if (!handler) throw new Error("Pick job handler was not registered");

    const result = await handler.process(
      { content: "orphan", entityType: "poster" },
      "job-that-was-never-enqueued",
      createMockProgressReporter(),
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      status: expect.stringContaining("refused:"),
    });
    expect(
      await harness.getEntityService().listEntities({ entityType: "poster" }),
    ).toHaveLength(0);

    await harness.reset();
  });
});
