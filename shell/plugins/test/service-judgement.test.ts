import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { stubMethod } from "@brains/test-utils";
import type { JudgeInput } from "../src";
import type {
  BaseEntity,
  EntitySchema,
  EntitySearchRequest,
  SearchResult,
} from "@brains/entity-service";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * What `@brains/playbooks` needs that the declarative surface could not say.
 *
 * Its goal check asks whether a run's stated outcome actually holds. That is
 * two reads it cannot make from a declaration: search the corpus for evidence,
 * and put the evidence to the model for a bounded verdict. Both are handles
 * `setup` hands to state, because the check runs long after registration.
 */

describe("a service that decides whether something holds", () => {
  it("searches the corpus for evidence and asks for a verdict on it", async () => {
    let verdict: { met: boolean } | undefined;
    const definition = defineServicePlugin({
      id: "goal-desk",
      config: z.object({}),
      setup: ({ corpus, judge }) => ({
        check: async (goal: string): Promise<{ met: boolean }> => {
          const evidence = await corpus.search({
            query: goal,
            limit: 8,
            excludeTypes: ["playbook"],
          });
          const answer = await judge({
            instruction: "Does the goal hold?",
            material: evidence.map((hit) => hit.excerpt).join("\n"),
            schema: z.object({ met: z.boolean() }),
          });
          return answer.verdict;
        },
      }),
      ready: async ({ state }) => {
        verdict = await state.check("ship the thing");
      },
    });
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/goal-desk", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness();
    const shell = harness.getMockShell();
    let searched: { query: string; excludeTypes: unknown } | undefined;
    const hit: BaseEntity = {
      id: "note-1",
      entityType: "note",
      content: "full private body",
      created: "2026-09-01T00:00:00.000Z",
      updated: "2026-09-01T00:00:00.000Z",
      visibility: "public",
      metadata: {},
      contentHash: "hash",
    };
    // The service's own overload pair: without a schema the hit comes back as
    // the entity it is, and with one it is parsed rather than asserted into
    // the caller's type.
    async function searchStub(
      request: EntitySearchRequest,
    ): Promise<SearchResult<BaseEntity>[]>;
    async function searchStub<T extends BaseEntity>(
      request: EntitySearchRequest,
      schema: EntitySchema<T>,
    ): Promise<SearchResult<T>[]>;
    async function searchStub<T extends BaseEntity>(
      request: EntitySearchRequest,
      schema?: EntitySchema<T>,
    ): Promise<SearchResult<BaseEntity>[] | SearchResult<T>[]> {
      searched = {
        query: request.query,
        excludeTypes: request.options?.excludeTypes,
      };
      const result = {
        excerpt: "the thing shipped on Tuesday",
        score: 0.9,
      };
      return schema
        ? [{ ...result, entity: schema.parse(hit) }]
        : [{ ...result, entity: hit }];
    }
    stubMethod(shell.getEntityService(), "search", searchStub);
    let judged: { instruction: string; material: string } | undefined;
    stubMethod(shell, "judge", async <T>(input: JudgeInput<T>) => {
      judged = { instruction: input.instruction, material: input.material };
      return {
        verdict: input.schema.parse({ met: true }),
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      };
    });

    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready?.();

    // The question the package asked, not a rephrasing of it.
    expect(searched?.query).toBe("ship the thing");
    // A playbook must not find the playbook that states the goal.
    expect(searched?.excludeTypes).toEqual(["playbook"]);
    // What the model saw is the excerpt, never the entity's whole body.
    expect(judged?.material).toBe("the thing shipped on Tuesday");
    expect(judged?.instruction).toBe("Does the goal hold?");
    expect(verdict).toEqual({ met: true });

    harness.reset();
  });
});

describe("a service whose engine reads its own types", () => {
  it("holds entity access from setup rather than per call", async () => {
    let listed: string[] | undefined;
    const definition = defineServicePlugin({
      id: "run-desk",
      config: z.object({}),
      entities: [
        defineEntity({
          type: "playbook",
          purpose: "A sequence someone can be walked through",
          metadata: z.object({}),
        }),
      ],
      setup: ({ entities }) => ({
        // The engine reads definitions when an agent asks, not when a caller
        // does, so the handle is held rather than handed in per call.
        listPlaybooks: async (): Promise<string[]> => {
          const found = await entities.listEntities({ entityType: "playbook" });
          return found.map((entity) => entity.id);
        },
      }),
      ready: async ({ state }) => {
        listed = await state.listPlaybooks();
      },
    });
    const plugins = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/run-desk", version: "0.1.0" },
    );
    const [service] = plugins;
    if (!service) throw new Error("Service plugin was not created");

    const harness = createPluginHarness();
    await Promise.all(plugins.map((plugin) => harness.installPlugin(plugin)));
    await harness.finalizeRegistration();
    await service.ready?.();

    expect(listed).toEqual([]);
    harness.reset();
  });
});
