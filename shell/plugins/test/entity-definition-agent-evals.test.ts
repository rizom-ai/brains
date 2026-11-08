import { describe, expect, it } from "bun:test";
import {
  agentContextContract,
  generateExecuteContract,
  generateReportFailureContract,
  generateReportSuccessContract,
} from "@brains/contracts";
import type { BaseEntity } from "@brains/entity-service";
import {
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import { queuedByPackage } from "../src/test/package-job-data";
import {
  createTemplate,
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
  type EntityEvalContext,
  type PluginCapabilities,
} from "../src";

type Harness = ReturnType<typeof createPluginHarness>;

const essayMetadata = z.object({
  title: z.string(),
  status: z.string().optional(),
});
const digestMetadata = z.object({
  title: z.string(),
  sourceEntityType: z.string().optional(),
  sourceEntityId: z.string().optional(),
  sourceEntityIds: z.array(z.string()).optional(),
});

const essay = defineEntity({
  type: "essay",
  purpose: "Long-form writing digests are made from.",
  metadata: essayMetadata,
});

async function install(
  entities: readonly AnyEntityDefinition[],
  prepare: (harness: Harness) => void = (): void => {},
): Promise<{ harness: Harness; capabilities: PluginCapabilities[] }> {
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "reading", entities }),
    {},
    { name: "@fixture/reading", version: "0.1.0" },
  );
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-agent-evals"),
  });
  prepare(harness);
  const capabilities = await plugins.reduce<Promise<PluginCapabilities[]>>(
    async (installed, plugin) => [
      ...(await installed),
      await harness.installPlugin(plugin),
    ],
    Promise.resolve([]),
  );
  return { harness, capabilities };
}

async function seedEssays(harness: Harness): Promise<void> {
  await Promise.all(
    [
      { id: "one", status: "published" },
      { id: "two", status: "published" },
      { id: "draft", status: "draft" },
    ].map(({ id, status }) =>
      harness.getEntityService().createEntity({
        entity: {
          id,
          entityType: "essay",
          content: `Essay ${id}`,
          metadata: { title: id, status },
        },
      }),
    ),
  );
}

async function enqueued(
  harness: Harness,
): Promise<{ type: string; data: unknown }[]> {
  const jobs = await harness
    .getMockShell()
    .getJobQueueService()
    .getRecentJobs(undefined, 50);
  return jobs.map(({ type, data }) => ({ type, data: JSON.parse(data) }));
}

function listen(harness: Harness, channel: string): unknown[] {
  const heard: unknown[] = [];
  harness
    .getMockShell()
    .getMessageBus()
    .subscribe(channel, async (message) => {
      heard.push(message.payload);
      return { success: true };
    });
  return heard;
}

describe("declared instructions", () => {
  it("reach the agent through the plugin's capabilities", async () => {
    const { harness, capabilities } = await install([
      defineEntity({
        type: "digest",
        purpose: "A digest of saved reading.",
        metadata: digestMetadata,
        instructions: "Answer digest questions from the newest digest first.",
      }),
    ]);
    try {
      expect(capabilities[0]?.instructions).toBe(
        "Answer digest questions from the newest digest first.",
      );
    } finally {
      await harness.reset();
    }
  });
});

describe("declared agent context", () => {
  it("answers the agent's context request with reads scoped to the asker", async () => {
    const digest = defineEntity({
      type: "digest",
      purpose: "Grounds the agent in recent reading.",
      metadata: digestMetadata,
      agentContext: async ({ request, entities }) => {
        const essays = await entities.list(essay);
        return essays.map((entry) => ({
          id: entry.id,
          source: "digest",
          title: entry.metadata.title,
          content: `${request.message}: ${entry.content}`,
        }));
      },
    });
    const { harness } = await install([essay, digest]);
    try {
      await harness.getEntityService().createEntity({
        entity: {
          id: "public-essay",
          entityType: "essay",
          content: "Open",
          metadata: { title: "Open" },
        },
      });
      await harness.getEntityService().createEntity({
        entity: {
          id: "private-essay",
          entityType: "essay",
          content: "Closed",
          metadata: { title: "Closed" },
          visibility: "restricted",
        },
      });
      const ask = async (
        userPermissionLevel: "admin" | "public",
      ): Promise<string[]> => {
        const responses = await harness
          .getMockShell()
          .getMessageBus()
          .collect({
            type: agentContextContract.name,
            payload: {
              conversationId: "conversation-1",
              message: "What did I read",
              interfaceType: "cli",
              userPermissionLevel,
            },
            sender: "agent",
          });
        return responses
          .flatMap((response) =>
            "data" in response
              ? agentContextContract.response.parse(response.data).items
              : [],
          )
          .map(({ id }) => id)
          .sort();
      };
      expect(await ask("public")).toEqual(["public-essay"]);
      expect(await ask("admin")).toEqual(["private-essay", "public-essay"]);
    } finally {
      await harness.reset();
    }
  });
});

describe("declared scheduled generation", () => {
  const generationInput = z.object({
    sourceEntityType: z.string().optional(),
    sourceEntityId: z.string().optional(),
    sourceEntityIds: z.array(z.string()).optional(),
  });

  function digestType(mode: "each" | "batch"): AnyEntityDefinition {
    return defineEntity({
      type: "digest",
      purpose: "A digest written on a schedule.",
      metadata: digestMetadata,
      scheduledGeneration: {
        from: { entityType: "essay", status: "published", limit: 10 },
        mode,
      },
      generation: {
        input: generationInput,
        generate: async ({ input }) => ({
          success: true,
          id: `digest-${input.sourceEntityId ?? "batch"}`,
          content: "Digest",
          metadata: {
            title: "Digest",
            ...(input.sourceEntityType && {
              sourceEntityType: input.sourceEntityType,
            }),
            ...(input.sourceEntityId && {
              sourceEntityId: input.sourceEntityId,
            }),
          },
        }),
      },
    });
  }

  it("writes from one source at a time, skipping sources already digested", async () => {
    const { harness } = await install([essay, digestType("each")]);
    try {
      await seedEssays(harness);
      await harness.getEntityService().createEntity({
        entity: {
          id: "digest-one",
          entityType: "digest",
          content: "Digest",
          metadata: {
            title: "Digest",
            sourceEntityType: "essay",
            sourceEntityId: "one",
          },
        },
      });
      await harness.sendMessage(generateExecuteContract.name, {
        entityType: "digest",
      });
      // The package starts it, so it is queued as the package, at its grant,
      // with the entry it is written from beside its input.
      expect(await enqueued(harness)).toEqual([
        {
          type: "digest:generation",
          data: queuedByPackage(
            "@fixture/reading:digest",
            { sourceEntityType: "essay", sourceEntityId: "two" },
            { source: { entityType: "essay", ids: ["two"] } },
          ),
        },
      ]);
    } finally {
      await harness.reset();
    }
  });

  it("writes from every source at once in batch mode", async () => {
    const { harness } = await install([essay, digestType("batch")]);
    try {
      await seedEssays(harness);
      await harness.sendMessage(generateExecuteContract.name, {
        entityType: "digest",
      });
      const [job] = await enqueued(harness);
      expect(job?.type).toBe("digest:generation");
      const queued = z
        .object({
          byPackage: z.literal(true),
          input: z.object({
            sourceEntityType: z.literal("essay"),
            sourceEntityIds: z.array(z.string()),
          }),
        })
        .parse(job?.data);
      expect(queued.input.sourceEntityIds.sort()).toEqual(["one", "two"]);
    } finally {
      await harness.reset();
    }
  });

  it("ignores schedules for other types and reports when nothing qualifies", async () => {
    const { harness } = await install([essay, digestType("each")]);
    try {
      const failures = listen(harness, generateReportFailureContract.name);
      await harness.sendMessage(generateExecuteContract.name, {
        entityType: "newsletter",
      });
      expect(failures).toEqual([]);
      await harness.sendMessage(generateExecuteContract.name, {
        entityType: "digest",
      });
      expect(failures).toEqual([
        {
          entityType: "digest",
          error: "No published essay available to write a digest from",
        },
      ]);
      expect(await enqueued(harness)).toEqual([]);
    } finally {
      await harness.reset();
    }
  });

  it("reports the generation it ran back to the pipeline", async () => {
    const { harness } = await install([essay, digestType("each")]);
    try {
      const successes = listen(harness, generateReportSuccessContract.name);
      const handler = harness
        .getMockShell()
        .getJobQueueService()
        .getHandler("digest:generation");
      if (!handler) throw new Error("No digest generation registered");
      const data = handler.validateAndParse(
        queuedByPackage("@fixture/reading:digest", {
          sourceEntityType: "essay",
          sourceEntityId: "one",
        }),
      );
      if (data === null)
        throw new Error("The digest generation refused its data");
      await handler.process(
        data,
        "job-1",
        createMockProgressReporter(),
        new AbortController().signal,
      );
      expect(successes).toEqual([
        { entityType: "digest", entityId: "digest-one" },
      ]);
    } finally {
      await harness.reset();
    }
  });

  it("refuses a schedule for a type without a generation", () => {
    expect(() =>
      defineEntity({
        type: "digest",
        purpose: "Scheduled without a generation.",
        metadata: digestMetadata,
        scheduledGeneration: {
          from: { entityType: "essay", limit: 5 },
          mode: "each",
        },
      }),
    ).toThrow("declares a scheduled generation but no generation");
  });
});

describe("declared evals", () => {
  it("registers each handler with a fixture-controlled context", async () => {
    const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
    let given: EntityEvalContext | undefined;
    const digest = defineEntity({
      type: "digest",
      purpose: "Measured by its evals.",
      metadata: digestMetadata,
      templates: {
        summary: createTemplate({
          name: "summary",
          description: "Summarizes",
          schema: z.object({ body: z.string() }),
          basePrompt: "Summarize.",
          requiredPermission: "admin",
        }),
      },
      evals: {
        seededCount: async (input, context) => {
          given = context;
          const { essays } = z
            .object({ essays: z.array(z.string()) })
            .parse(input);
          await Promise.all(
            essays.map((id) =>
              context.fixtures.seed({
                id,
                entityType: "essay",
                content: `Essay ${id}`,
                metadata: { title: id },
              }),
            ),
          );
          await context.fixtures.settleEmbeddings();
          return { count: await context.entities.count(essay) };
        },
        summarize: async (_input, { ai }) =>
          ai.generate(
            { template: "summary", prompt: "x" },
            z.object({ body: z.string() }),
          ),
      },
    });
    const { harness } = await install([essay, digest], (prepared) => {
      prepared.getMockShell().registerEvalHandler = (
        _pluginId,
        id,
        handler,
      ): void => {
        handlers.set(id, handler);
      };
    });
    try {
      harness.getMockShell().generateContent = async (): Promise<unknown> => ({
        body: "Summary",
      });

      expect(
        await handlers.get("seededCount")?.({ essays: ["a", "b"] }),
      ).toEqual({ count: 2 });
      if (!given) throw new Error("The eval was not given a context");
      expect(Object.isFrozen(given)).toBe(true);
      expect(Object.keys(given).sort()).toEqual(["ai", "entities", "fixtures"]);

      // Reset removes what was seeded and what the type itself stores.
      await harness.getEntityService().createEntity({
        entity: {
          id: "stored-digest",
          entityType: "digest",
          content: "Digest",
          metadata: { title: "Digest" },
        },
      });
      await given.fixtures.reset();
      const remaining = (type: string): Promise<BaseEntity[]> =>
        harness.getEntityService().listEntities({ entityType: type });
      expect(await remaining("essay")).toEqual([]);
      expect(await remaining("digest")).toEqual([]);

      expect(await handlers.get("summarize")?.({})).toEqual({
        body: "Summary",
      });
    } finally {
      await harness.reset();
    }
  });
});
