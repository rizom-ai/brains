import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type EntitySearchRequest,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service whose class judged a goal against the brain, as
 * the playbooks class did, asks the brain's judge for a verdict and
 * searches the brain at the scope each call names, as the class searched
 * through its entity service. It reaches no service that writes.
 */

async function runtimeOf(shell: MockShell): Promise<ServiceRuntime> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin(
      { id: "probe", config: z.object({}) },
      {
        subscriptions: (context) => {
          runtime = serviceRuntime(context);
          return [];
        },
      },
    ),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(shell);
  if (!runtime) throw new Error("No runtime");
  return runtime;
}

describe("a first-party service judging against the brain", () => {
  it("asks the brain's judge for a verdict", async () => {
    const shell = createMockShell();
    const asked: { instruction: string; material: string }[] = [];
    shell.judge = async <T>(input: {
      instruction: string;
      material: string;
      schema: { parse(value: unknown): T };
    }): Promise<{
      verdict: T;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    }> => {
      asked.push({ instruction: input.instruction, material: input.material });
      return {
        verdict: input.schema.parse({ met: true, reason: "Saved." }),
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      };
    };
    const runtime = await runtimeOf(shell);

    const { verdict } = await runtime.ai.judge({
      instruction: "Is the goal met?",
      material: "A note was saved.",
      schema: z.object({ met: z.boolean(), reason: z.string() }),
    });

    expect(verdict).toEqual({ met: true, reason: "Saved." });
    expect(asked).toEqual([
      { instruction: "Is the goal met?", material: "A note was saved." },
    ]);
  });

  it("searches the brain at the scope the call names", async () => {
    const shell = createMockShell();
    const base = shell.getEntityService();
    const searched: EntitySearchRequest[] = [];
    shell.getEntityService = (): ReturnType<typeof shell.getEntityService> =>
      new Proxy(base, {
        get(target, property, receiver): unknown {
          if (property === "search") {
            return async (request: EntitySearchRequest): Promise<[]> => {
              searched.push(request);
              return [];
            };
          }
          return Reflect.get(target, property, receiver);
        },
      });
    const runtime = await runtimeOf(shell);

    expect(
      await runtime.entityReads.search({
        query: "the goal",
        options: { limit: 8, visibilityScope: "restricted" },
      }),
    ).toEqual([]);
    expect(searched).toEqual([
      {
        query: "the goal",
        options: { limit: 8, visibilityScope: "restricted" },
      },
    ]);
  });
});
