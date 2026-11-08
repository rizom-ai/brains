import { describe, expect, it } from "bun:test";
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
  defineEntityJob,
  defineEntityPackage,
  entityRuntime,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
  type EntityRuntime,
} from "../src";

/**
 * The internal runtime a first-party definition reaches with
 * entityRuntime(context) inside its own generation and jobs: the package's
 * logger, the anchor's profile, free-form structured AI and untyped reads at
 * the run's own scope, as the entity plugin classes' handlers had them.
 */

type Harness = ReturnType<typeof createPluginHarness>;

const metadata = z.object({ title: z.string(), status: z.string().optional() });
const other = defineEntity({
  type: "other",
  purpose: "Another package's type.",
  metadata: z.object({ title: z.string() }),
});

async function install(
  entities: readonly AnyEntityDefinition[],
): Promise<Harness> {
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-runtime-jobs"),
    // The requester a job records is signed in as an admin.
    resolvePrincipal: async () => ({
      userId: "tester",
      permissionLevel: "admin",
    }),
  });
  for (const plugin of [
    ...instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "memos", entities }),
      {},
      { name: "@fixture/memos", version: "0.1.0" },
    ),
    ...instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "others", entities: [other] }),
      {},
      { name: "@fixture/others", version: "0.1.0" },
    ),
  ]) {
    await harness.installPlugin(plugin);
  }
  for (const [id, visibility] of [
    ["open", "public"],
    ["kept", "restricted"],
  ] as const) {
    await harness.getEntityService().createEntity({
      entity: {
        id,
        entityType: "other",
        content: `About ${id}`,
        metadata: { title: id },
        visibility,
      },
    });
  }
  return harness;
}

async function run(
  harness: Harness,
  type: string,
  data: unknown,
): Promise<unknown> {
  const handler = harness.getMockShell().getJobQueueService().getHandler(type);
  if (!handler) throw new Error(`No job handler registered for ${type}`);
  const parsed = handler.validateAndParse(data);
  if (parsed === null) throw new Error(`Job data refused for ${type}`);
  return handler.process(
    parsed,
    "job-under-test",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

/** What a run reached through its runtime. */
async function reach(runtime: EntityRuntime): Promise<Record<string, unknown>> {
  runtime.logger.info("reached from the run");
  const titled = await runtime.generateObject(
    "Name it",
    z.object({ title: z.string().default("Named") }),
  );
  const reads = await runtime.anyEntities.listEntities({ entityType: "other" });
  return {
    author: runtime.identity.getProfile().name,
    title: titled.title,
    others: reads.map(({ id }) => id).sort(),
  };
}

const generationTemplate = createTemplate({
  name: "generation",
  description: "Writes a memo",
  schema: z.object({ title: z.string() }),
  requiredPermission: "public",
  dataSourceId: "shell:ai-content",
  basePrompt: "Write a memo.",
});

describe("entityRuntime(context) in a generation", () => {
  it("reaches the logger, the profile, structured AI and reads at the run's scope", async () => {
    let reached: Record<string, unknown> | undefined;
    const memo = defineEntity({
      type: "memo",
      purpose: "A memo.",
      metadata,
      templates: { generation: generationTemplate },
      generation: {
        input: z.object({}),
        generate: async (context) => {
          reached = await reach(entityRuntime(context));
          return { success: true, content: "Body", metadata: { title: "M" } };
        },
      },
    });
    const harness = await install([memo]);
    try {
      // Queued by the package for itself: it reads other types at its own
      // grant, which is public.
      await run(
        harness,
        "memo:generation",
        queuedByPackage("@fixture/memos:memo", {}),
      );
      expect(reached).toEqual({
        author: "Test Owner",
        title: "Named",
        others: ["open"],
      });
    } finally {
      await harness.reset();
    }
  });
});

/** A job an admin started, as the runtime queues it. */
function asAdmin(input: unknown): unknown {
  return {
    authority: {
      actor: { kind: "user", userId: "tester" },
      permissionCeiling: "admin",
      principalId: "tester",
    },
    input,
  };
}

describe("entityRuntime(context) reads as the run's requester", () => {
  it("reads other types at the requester's visibility, not the package's", async () => {
    let reached: Record<string, unknown> | undefined;
    const memo = defineEntity({
      type: "memo",
      purpose: "A memo.",
      metadata,
      templates: { generation: generationTemplate },
      generation: {
        input: z.object({}),
        generate: async (context) => {
          reached = await reach(entityRuntime(context));
          return { success: true, content: "Body", metadata: { title: "M" } };
        },
      },
    });
    const harness = await install([memo]);
    try {
      await run(harness, "memo:generation", asAdmin({}));
      expect(reached?.["others"]).toEqual(["kept", "open"]);
    } finally {
      await harness.reset();
    }
  });
});

describe("entityRuntime(context) in a declared job", () => {
  it("reaches the logger, the profile, structured AI and reads at the run's scope", async () => {
    let reached: Record<string, unknown> | undefined;
    const memo = defineEntity({
      type: "memo",
      purpose: "A memo.",
      metadata,
      jobs: {
        tally: defineEntityJob({
          input: z.object({}),
          handle: async (context) => {
            reached = await reach(entityRuntime(context));
            return { done: true };
          },
        }),
      },
    });
    const harness = await install([memo]);
    try {
      await run(
        harness,
        "@fixture/memos:memo:tally",
        queuedByPackage("@fixture/memos:memo", {}),
      );
      expect(reached).toEqual({
        author: "Test Owner",
        title: "Named",
        others: ["open"],
      });
    } finally {
      await harness.reset();
    }
  });
});
