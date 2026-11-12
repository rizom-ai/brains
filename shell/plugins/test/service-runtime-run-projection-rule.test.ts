import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineEntity,
  defineProjectionRule,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  withTools,
  type ProjectionWaveInput,
  type ProjectionWriteIntent,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service measures one of its own types' projection rules as
 * production runs it: the brain runs the registered rule's select and
 * derive, with no wave, memo or write, and hands back what it would write.
 * Only a rule one of the package's own types declares is run; any other
 * id, a rule of another package's type among them, is refused.
 */

const derived = defineProjectionRule({
  id: "derived-notes",
  version: "1",
  sources: [{ kind: "entity", types: ["topic"] }],
  targetType: "derived",
  inputSchema: z.object({}),
  selectInput: async () => ({}),
  derive: async () => [],
});

const derivedType = defineEntity({
  type: "derived",
  purpose: "A derived note.",
  metadata: z.object({}),
  projectionRules: [derived],
});

const intents: readonly ProjectionWriteIntent[] = [
  {
    operation: "delete",
    entityType: "derived",
    id: "stale",
  },
];

async function runtimeOn(
  ran: Array<[string, readonly ProjectionWaveInput[] | undefined]>,
): Promise<ServiceRuntime> {
  const shell = createMockShell();
  shell.runProjectionRule = async (
    ruleId,
    options,
  ): Promise<readonly ProjectionWriteIntent[]> => {
    ran.push([ruleId, options?.inputs]);
    return intents;
  };
  let runtime: ServiceRuntime | undefined;
  const plugins = instantiatePluginPackageDefinition(
    withTools(
      defineServicePlugin({
        id: "deriver",
        config: z.object({}),
        entities: [derivedType],
      }),
      (context) => {
        runtime = serviceRuntime(context);
        return [];
      },
    ),
    {},
    { name: "@brains/deriver", version: "0.1.0" },
    { pluginId: "deriver" },
  );
  for (const plugin of plugins) await plugin.register(shell);
  if (!runtime) throw new Error("The tools slot did not run");
  return runtime;
}

describe("a first-party service running its own projection rule", () => {
  it("hands back what the brain's run of the rule would write", async () => {
    const ran: Array<[string, readonly ProjectionWaveInput[] | undefined]> = [];
    const runtime = await runtimeOn(ran);
    const inputs: ProjectionWaveInput[] = [
      {
        sourceType: "topic",
        sourceId: "tides",
        revision: "eval",
        operation: "upsert",
      },
    ];

    expect(
      await runtime.runProjectionRule("derived-notes", { inputs }),
    ).toEqual(intents);
    expect(await runtime.runProjectionRule("derived-notes")).toEqual(intents);
    expect(ran).toEqual([
      ["derived-notes", inputs],
      ["derived-notes", undefined],
    ]);
  });

  it("refuses a rule none of its own types declares", async () => {
    const ran: Array<[string, readonly ProjectionWaveInput[] | undefined]> = [];
    const runtime = await runtimeOn(ran);

    expect(runtime.runProjectionRule("skill-derivation")).rejects.toThrow(
      'Unknown projection rule "skill-derivation" for deriver',
    );
    expect(ran).toEqual([]);
  });
});
