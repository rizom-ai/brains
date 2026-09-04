import { describe, expect, it } from "bun:test";
import type { JobHandler } from "@brains/job-queue";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineJob,
  defineServicePlugin,
  defineSubscription,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "../src";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * What `@brains/profile` needs that the declarative surface could not say:
 * profile kinds declared as data, a boot-signal-gated seeding flow shaped as
 * a job, and that job reading the brain's domain and the finalized kind
 * selection.
 */

const seedInput = z.object({});
const seedOutput = z.object({ seeded: z.boolean() });

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  name: string,
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name, version: "0.1.0" },
  );
  if (!plugin) throw new Error(`Plugin ${name} was not created`);
  return plugin;
}

/** Pin the mock queue so registered handlers can be driven by the test. */
function captureJobHandlers(
  harness: ReturnType<typeof createPluginHarness>,
): Map<string, JobHandler> {
  const shell = harness.getMockShell();
  const queue = shell.getJobQueueService();
  const handlers = new Map<string, JobHandler>();
  const register = queue.registerHandler.bind(queue);
  queue.registerHandler = (
    name: string,
    handler: JobHandler,
    pluginId?: string,
  ): void => {
    handlers.set(name, handler);
    register(name, handler, pluginId);
  };
  shell.getJobQueueService = (): typeof queue => queue;
  return handlers;
}

describe("declared profile kinds", () => {
  it("registers each declared kind, and the selection resolves after finalize", async () => {
    const definition = defineServicePlugin({
      id: "identity-shapes",
      config: z.object({}),
      setup: () => ({}),
      profileKinds: () => [
        {
          kind: "professional",
          category: "person",
          fields: z.object({ headline: z.string().optional() }),
          labels: { singular: "Professional", plural: "Professionals" },
        },
      ],
    });
    const harness = createPluginHarness({ profileKind: "professional" });
    await harness.installPlugin(instantiate(definition, "@fixture/shapes"));

    const registry = harness.getMockShell().getProfileKindRegistry();
    const resolved = registry.finalize();
    expect(resolved).toMatchObject({
      kind: "professional",
      category: "person",
    });
  });
});

describe("declared entity extensions", () => {
  const SYSTEM_TYPE = "anchor-profile";

  function harnessWithSystemType(options?: {
    profileKind?: string;
  }): ReturnType<typeof createPluginHarness> {
    const harness = createPluginHarness(
      options?.profileKind ? { profileKind: options.profileKind } : {},
    );
    harness
      .getEntityRegistry()
      .registerEntityType(SYSTEM_TYPE, baseEntitySchema, {
        entityType: SYSTEM_TYPE,
        // The base schema is this type's schema: the lifecycle under test reads
        // no metadata, so there is nothing narrower to describe.
        schema: baseEntitySchema,
        purpose: "The anchor profile.",
        fromMarkdown: () => ({}),
        toMarkdown: (entity) => entity.content,
        extractMetadata: () => ({}),
        parseFrontMatter: <T>(_markdown: string, schema: z.ZodSchema<T>): T =>
          schema.parse({}),
        generateFrontMatter: () => "",
        getBodyTemplate: () => "",
      });
    return harness;
  }

  it("applies frontmatter and validator to a stewarded type after finalize, seeing the selection", async () => {
    const extended: string[] = [];
    const validators: string[] = [];
    let selectionSeen: string | undefined;
    const definition = defineServicePlugin({
      id: "identity-shape",
      config: z.object({}),
      setup: () => ({}),
      stewards: [SYSTEM_TYPE],
      profileKinds: () => [
        {
          kind: "professional",
          category: "person",
          fields: z.object({ headline: z.string().optional() }),
          labels: { singular: "Professional", plural: "Professionals" },
        },
      ],
      entityExtensions: ({ profileKinds }) => {
        selectionSeen = profileKinds.getResolved()?.kind;
        return [
          {
            entityType: SYSTEM_TYPE,
            frontmatter: z.object({ name: z.string().optional() }),
            validate: async (): Promise<void> => undefined,
          },
        ];
      },
    });
    const harness = harnessWithSystemType({ profileKind: "professional" });
    const registry = harness.getEntityRegistry();
    const extend = registry.extendFrontmatterSchema.bind(registry);
    registry.extendFrontmatterSchema = (type, extension): void => {
      extended.push(type);
      extend(type, extension);
    };
    const registerValidator = registry.registerPersistValidator.bind(registry);
    registry.registerPersistValidator = (type, validator): void => {
      validators.push(type);
      registerValidator(type, validator);
    };

    await harness.installPlugin(instantiate(definition, "@fixture/shape"));
    harness.getMockShell().getProfileKindRegistry().finalize();
    await harness.finalizeRegistration();

    expect(extended).toEqual([SYSTEM_TYPE]);
    expect(validators).toEqual([SYSTEM_TYPE]);
    expect(selectionSeen).toBe("professional");
  });

  it("refuses an extension on a type the package neither declares nor stewards", async () => {
    const definition = defineServicePlugin({
      id: "identity-shape",
      config: z.object({}),
      setup: () => ({}),
      entityExtensions: () => [
        {
          entityType: SYSTEM_TYPE,
          frontmatter: z.object({ name: z.string().optional() }),
        },
      ],
    });
    const harness = harnessWithSystemType();
    await harness.installPlugin(instantiate(definition, "@fixture/shape"));
    expect(harness.finalizeRegistration()).rejects.toThrow(/steward/);
  });
});

describe("a boot-gated seeding job", () => {
  it("lets ready enqueue a declared job", async () => {
    const seedJob = defineJob({
      name: "seed-identity",
      input: seedInput,
      output: seedOutput,
    });
    let enqueuedId: string | null = null;
    const definition = defineServicePlugin({
      id: "identity-seeder",
      config: z.object({}),
      setup: () => ({}),
      jobs: () => [seedJob.handle(async () => ({ seeded: true }))],
      ready: async ({ jobs }) => {
        const reference = await jobs.enqueue(seedJob, {});
        enqueuedId = reference.id;
      },
    });
    const harness = createPluginHarness();
    const plugin = instantiate(definition, "@fixture/seeder");
    await harness.installPlugin(plugin);
    await plugin.ready?.();
    expect(enqueuedId).not.toBeNull();
  });

  it("lets a subscription enqueue a declared job when its signal arrives", async () => {
    const seedJob = defineJob({
      name: "seed-identity",
      input: seedInput,
      output: seedOutput,
    });
    let enqueuedId: string | null = null;
    const definition = defineServicePlugin({
      id: "identity-seeder",
      config: z.object({}),
      setup: () => ({}),
      jobs: () => [seedJob.handle(async () => ({ seeded: true }))],
      subscriptions: ({ jobs }) => [
        defineSubscription({
          topic: "system:initial-sync:completed",
          payload: z.object({ success: z.boolean().optional() }),
          handle: async ({ payload }) => {
            if (payload.success !== true) return { success: true };
            const reference = await jobs.enqueue(seedJob, {});
            enqueuedId = reference.id;
            return { success: true };
          },
        }),
      ],
    });
    const harness = createPluginHarness();
    await harness.installPlugin(instantiate(definition, "@fixture/seeder"));
    await harness.sendMessage("system:initial-sync:completed", {
      success: true,
    });
    expect(enqueuedId).not.toBeNull();
  });

  it("hands the job handler the domain and the finalized profile selection", async () => {
    const seedJob = defineJob({
      name: "seed-identity",
      input: seedInput,
      output: seedOutput,
    });
    const seen: { domain?: string | undefined; kind?: string | undefined } = {};
    const definition = defineServicePlugin({
      id: "identity-seeder",
      config: z.object({}),
      setup: () => ({}),
      profileKinds: () => [
        {
          kind: "professional",
          category: "person",
          fields: z.object({}),
          labels: { singular: "Professional", plural: "Professionals" },
        },
      ],
      jobs: () => [
        seedJob.handle(async ({ domain, profileKinds }) => {
          seen.domain = domain;
          seen.kind = profileKinds.getResolved()?.kind;
          return { seeded: true };
        }),
      ],
    });
    const harness = createPluginHarness({
      domain: "smoke.rizom.ai",
      profileKind: "professional",
    });
    const handlers = captureJobHandlers(harness);
    await harness.installPlugin(instantiate(definition, "@fixture/seeder"));
    harness.getMockShell().getProfileKindRegistry().finalize();

    const entry = [...handlers.entries()].find(([name]) =>
      name.includes("seed-identity"),
    );
    if (!entry) throw new Error("seed job handler was not registered");
    await entry[1].process(
      {},
      "job-1",
      createMockProgressReporter(),
      new AbortController().signal,
    );

    expect(seen).toEqual({ domain: "smoke.rizom.ai", kind: "professional" });
  });
});
