import { describe, expect, it, spyOn } from "bun:test";
import { caughtError } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockEntityService } from "@brains/entity-service/test";
import {
  defineEntity,
  defineEntityPackage,
  defineJob,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type ServiceJobs,
} from "../src";
import { createJobEntityAccess } from "../src/job/job-entity-access";
import { createAuthoringEntityReader } from "../src/internal/authoring-entity-access";
import { createPluginHarness } from "../src/test/harness";

describe("ranked maintenance authoring contracts", () => {
  it("returns detached, frozen source policy scalars rather than type configuration", () => {
    const entities = createMockEntityService();
    const config = {
      projectionSource: true,
      projectionSourceRole: "supporting" as const,
      weight: 99,
    };
    entities.getEntityTypeConfig = (): typeof config => config;
    const reads = createAuthoringEntityReader(
      createJobEntityAccess(entities, new Set(), "reader"),
    );
    const policy = reads.getSourcePolicy("note");
    expect(policy).toEqual({
      projectionSource: true,
      projectionSourceRole: "supporting",
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Reflect.set(policy, "projectionSource", false)).toBe(false);
    expect(config.projectionSource).toBe(true);
    expect(reads.getSourcePolicy("note")).not.toBe(policy);
    config.projectionSource = false;
    expect(policy.projectionSource).toBe(true);
    expect(reads.getSourcePolicy("note").projectionSource).toBe(false);
  });

  it("mints independent roots, persists bounded delays and refuses caller-selected scheduling authority", async () => {
    const harness = createPluginHarness({ logContext: "maintenance-contract" });
    const queue = harness.getMockShell().getJobQueueService();
    const enqueue = spyOn(queue, "enqueue");
    harness.getMockShell().getJobQueueService = (): typeof queue => queue;
    let jobs: ServiceJobs | undefined;
    const independent = defineJob({
      name: "maintain",
      input: z.object({}),
      output: z.object({}),
      causality: "independent",
      deadline: "3m",
      oncePending: () => "maintain",
    });
    const ordinary = defineJob({
      name: "ordinary",
      input: z.object({}),
      output: z.object({}),
    });
    const definition = defineServicePlugin(
      {
        id: "owner",
        config: z.object({}),
        setup: (context) => {
          jobs = context.jobs;
          return {};
        },
      },
      {
        jobs: () => [
          independent.handle(async () => ({})),
          ordinary.handle(async () => ({})),
        ],
      },
    );
    try {
      for (const plugin of instantiatePluginPackageDefinition(
        definition,
        {},
        { name: "@fixture/maintenance", version: "1" },
      ))
        await harness.installPlugin(plugin);
      if (!jobs) throw new Error("Missing jobs");
      await jobs.enqueue(independent, {}, { delayMs: 30000 });
      await jobs.enqueue(independent, {}, { delayMs: 0 });
      await jobs.enqueue(ordinary, {});
      const requests = enqueue.mock.calls.map(([request]) => request);
      expect(requests).toHaveLength(3);
      expect(requests[0]).toMatchObject({
        type: "@fixture/maintenance:owner:maintain",
        options: {
          delayMs: 30000,
          rootJobId: expect.any(String),
          deduplication: "skip",
          deduplicationKey: "maintain",
          source: "@fixture/maintenance:owner",
        },
      });
      expect(requests[1]?.options?.rootJobId).not.toBe(
        requests[0]?.options?.rootJobId,
      );
      expect(requests[2]?.options?.rootJobId).toBeUndefined();
      expect(
        queue.getHandler("@fixture/maintenance:owner:maintain")
          ?.executionTimeoutMs,
      ).toBe(180000);
      for (const delayMs of [-1, 0.5, Infinity, NaN, 86400001])
        expect(
          await jobs.enqueue(independent, {}, { delayMs }).catch(caughtError),
        ).toMatchObject({ code: "invalid_input" });
      expect(
        await Promise.resolve(
          Reflect.apply(jobs.enqueue, jobs, [
            independent,
            {},
            { rootJobId: "foreign-root" },
          ]),
        ).catch(caughtError),
      ).toMatchObject({ code: "invalid_input" });
      expect(
        await jobs
          .enqueue(
            defineJob({
              name: "uninstalled",
              input: z.object({}),
              output: z.object({}),
              causality: "independent",
            }),
            {},
          )
          .catch(caughtError),
      ).toBeInstanceOf(Error);
      expect(
        await jobs
          .enqueueBatch([{ definition: independent, input: {} }])
          .catch(caughtError),
      ).toBeInstanceOf(Error);
      expect(enqueue).toHaveBeenCalledTimes(3);
    } finally {
      await harness.reset();
    }
  });

  it("detaches the exact retirement declaration and binds its target to the installed entity", async () => {
    const harness = createPluginHarness({ logContext: "retirement-contract" });
    const release = spyOn(
      harness.getEntityService(),
      "releaseProjectionOwnership",
    );
    const retired = [{ id: "old-rule", version: "1" }];
    const entity = defineEntity({
      type: "owned",
      purpose: "Owned fixture",
      metadata: z.object({}),
      retiredProjectionRules: retired,
    });
    const plugins = instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "owned", entities: [entity] }),
      {},
      { name: "@fixture/retirement", version: "1" },
    );
    retired.splice(0, 1, { id: "other-rule", version: "2" });
    try {
      for (const plugin of plugins) await harness.installPlugin(plugin);
      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith({
        entityType: "owned",
        ruleId: "old-rule",
        ruleVersion: "1",
      });
    } finally {
      await harness.reset();
    }
  });

  it("does not accept entity-type overrides in retirement data", () => {
    const foreign = { id: "old-rule", version: "1", entityType: "foreign" };
    const entity = defineEntity({
      type: "owned",
      purpose: "Owned fixture",
      metadata: z.object({}),
      retiredProjectionRules: [foreign],
    });
    expect(() =>
      instantiatePluginPackageDefinition(
        defineEntityPackage({ id: "owned", entities: [entity] }),
        {},
        { name: "@fixture/retirement", version: "1" },
      ),
    ).toThrow();
  });
});
