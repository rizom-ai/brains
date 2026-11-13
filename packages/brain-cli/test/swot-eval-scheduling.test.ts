import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { agentEntity, skill } from "@brains/agent-discovery";
import { EvalHandlerRegistry } from "@brains/ai-evaluation";
import { MigrationManager } from "@brains/app";
import { derivedSwot, swotPackage } from "@brains/assessment";
import swotEvalPackage from "@brains/assessment/eval";
import { PROJECTION_RULE_JOB_TYPE, Shell } from "@brains/core";
import { OperationContext } from "@brains/operation-context";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { waitUntil } from "@brains/test-utils";
import { ConsoleLogger, LogLevel } from "@brains/utils/logger";
import { fromYaml } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";
import {
  MOCK_LOAD_API_KEY,
  MOCK_LOAD_MODEL,
  MockLoadAIService,
  MockLoadEmbeddingService,
  MockLoadTracker,
} from "./helpers/mocked-ai-load-services";

/**
 * The SWOT eval brain runs the production swot-derivation rule only when
 * an eval runs it: seeding a test case's agents and skills queues no
 * derivation, as main's eval brain, which registered no rule, queued none.
 * A brain whose swot type carries the scheduled rule queues one for the
 * same seeding within the same window, so the window shows the scheduler
 * would have queued it.
 */

const SCHEDULER_WINDOW_MS = 2_500;

const basicCase = z
  .object({
    plugin: z.string(),
    handler: z.string(),
    input: z.looseObject({
      skills: z.array(z.looseObject({ name: z.string() })),
      agents: z.array(z.looseObject({ url: z.string() })),
    }),
  })
  .parse(
    fromYaml(
      await readFile(
        join(
          import.meta.dir,
          "../../../entities/assessment/evals/test-cases/swot-derive-basic.yaml",
        ),
        "utf8",
      ),
    ),
  );

/** A job the brain's queue was asked to run. */
type JobQueueEnqueueRequest = Parameters<
  ReturnType<Shell["getJobQueueService"]>["enqueue"]
>[0];

const metadata = { name: "@brains/assessment", version: "0.0.0-test" };

/** The eval brain, as evals/eval.yaml installs it. */
const evalBrain = (): Plugin[] =>
  instantiatePluginPackageDefinition(swotEvalPackage, {}, metadata, {
    pluginId: "assessment",
  });

/** The same types as the eval brain's, the swot type with its scheduled rule. */
const scheduledBrain = (): Plugin[] =>
  instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "assessment",
      config: z.object({}),
      entities: [derivedSwot, agentEntity(undefined), skill],
    }),
    {},
    metadata,
    { pluginId: "assessment" },
  );

/**
 * A brain with derivation off, as the composer installs it, beside the
 * agent and skill types its rule reads.
 */
const derivationOffBrain = (): Plugin[] => [
  ...instantiatePluginPackageDefinition(swotPackage, {}, metadata, {
    pluginId: "swot",
  }),
  ...instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "directory",
      config: z.object({}),
      entities: [agentEntity(undefined), skill],
    }),
    {},
    { name: "@brains/agent-discovery", version: "0.0.0-test" },
    { pluginId: "directory" },
  ),
];

interface EvalBrain {
  shell: Shell;
  registry: EvalHandlerRegistry;
  queued: JobQueueEnqueueRequest[];
}

describe("the SWOT eval brain", () => {
  let shell: Shell | undefined;
  let tempRoot: string | undefined;

  afterEach(async () => {
    await shell?.shutdown();
    shell = undefined;
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
    ConsoleLogger.resetInstance();
  });

  async function boot(plugins: Plugin[]): Promise<EvalBrain> {
    tempRoot = await mkdtemp(join(tmpdir(), "swot-eval-scheduling-"));
    const logger = ConsoleLogger.getInstance({ level: LogLevel.ERROR });
    const url = (name: string): string => `file:${join(tempRoot ?? "", name)}`;
    await new MigrationManager(logger).runAllMigrations({
      database: url("brain.db"),
      jobQueueDatabase: url("jobs.db"),
      conversationDatabase: url("conversations.db"),
      runtimeStateDatabase: url("runtime-state.db"),
    });
    const tracker = new MockLoadTracker();
    const operationContext = OperationContext.createFresh();
    const registry = EvalHandlerRegistry.createFresh();
    const booted = Shell.createFresh(
      {
        name: "SWOT eval scheduling",
        version: "0.0.0-test",
        plugins,
        permissions: {},
        spaces: [],
        database: { url: url("brain.db") },
        jobQueueDatabase: { url: url("jobs.db") },
        conversationDatabase: { url: url("conversations.db") },
        runtimeStateDatabase: { url: url("runtime-state.db") },
        embeddingDatabase: { url: url("embeddings.db") },
        dataDir: join(tempRoot, "brain-data"),
        ai: {
          providerKeys: { openai: MOCK_LOAD_API_KEY },
          model: MOCK_LOAD_MODEL,
        },
        embedding: { enabled: true },
        logging: { level: "error", context: "swot-eval-scheduling" },
        evalHandlerRegistry: registry,
      },
      {
        logger,
        aiService: new MockLoadAIService(tracker, { delayMs: 0 }),
        embeddingService: new MockLoadEmbeddingService(tracker, {
          delayMs: 0,
          dimensions: 1536,
        }),
        operationContext,
      },
    );
    shell = booted;
    // The projection scheduler queues each rule's job on this queue.
    const queue = booted.getJobQueueService();
    const queued: JobQueueEnqueueRequest[] = [];
    const enqueue = queue.enqueue.bind(queue);
    queue.enqueue = (request): Promise<string> => {
      queued.push(request);
      return enqueue(request);
    };
    await booted.initialize();
    return { shell: booted, registry, queued };
  }

  const seedResearch = async (brain: EvalBrain): Promise<void> => {
    await brain.shell.getEntityService().createEntityFromMarkdown({
      input: {
        entityType: "skill",
        id: "research",
        markdown:
          "---\nname: Research\ndescription: Turn source material into grounded findings.\ntags:\n  - research\nexamples: []\n---\n",
      },
    });
  };

  const swotDerivations = (queued: readonly JobQueueEnqueueRequest[]): number =>
    queued.filter(
      ({ type, data }) =>
        type === PROJECTION_RULE_JOB_TYPE &&
        z.looseObject({ ruleId: z.string() }).safeParse(data).data?.ruleId ===
          "swot-derivation",
    ).length;

  it("queues no swot derivation when a test case is seeded", async () => {
    const brain = await boot(evalBrain());
    const handler = brain.registry.get(basicCase.plugin, basicCase.handler);
    if (!handler) throw new Error("No deriveSwot eval");

    expect(await handler(basicCase.input)).toMatchObject({
      strengths: expect.any(Array),
      derivedAt: expect.any(String),
    });
    await Bun.sleep(SCHEDULER_WINDOW_MS);

    expect(swotDerivations(brain.queued)).toBe(0);
    // The case's directory, as agent-discovery reads it; the rule wrote
    // no SWOT.
    const service = brain.shell.getEntityService();
    const agents = await service.listEntities({ entityType: "agent" });
    expect(agents.map(({ metadata }) => metadata["url"]).sort()).toEqual(
      basicCase.input.agents.map(({ url }) => url).sort(),
    );
    const skills = await service.listEntities({ entityType: "skill" });
    expect(skills.map(({ metadata }) => metadata["name"]).sort()).toEqual(
      basicCase.input.skills.map(({ name }) => name).sort(),
    );
    expect(await service.listEntities({ entityType: "swot" })).toEqual([]);
  });

  it("queues one for the same seeding when the rule is scheduled", async () => {
    const brain = await boot(scheduledBrain());

    await seedResearch(brain);
    await waitUntil(
      () => swotDerivations(brain.queued) > 0,
      "the scheduler queues swot-derivation",
      { timeoutMs: SCHEDULER_WINDOW_MS, intervalMs: 25 },
    );

    expect(swotDerivations(brain.queued)).toBeGreaterThan(0);
  });

  it("with derivation off, answers swot:deriveSwot and queues no derivation", async () => {
    const brain = await boot(derivationOffBrain());
    const handler = brain.registry.get("swot", "deriveSwot");
    if (!handler) throw new Error("No swot:deriveSwot eval");

    await seedResearch(brain);
    expect(await handler({})).toMatchObject({
      strengths: expect.any(Array),
      derivedAt: expect.any(String),
    });
    await Bun.sleep(SCHEDULER_WINDOW_MS);

    expect(swotDerivations(brain.queued)).toBe(0);
  });
});
