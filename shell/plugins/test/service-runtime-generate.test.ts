import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  withTools,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class generates through a
 * template as its class generated through context.ai.generate: the config
 * as written, template named in full, the result parsed by the schema the
 * call names, and a signal that cancels before anything is asked.
 */

async function runtimeOn(
  shell: ReturnType<typeof createMockShell>,
): Promise<ServiceRuntime> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    withTools(
      defineServicePlugin({ id: "probe", config: z.object({}) }),
      (context) => {
        runtime = serviceRuntime(context);
        return [];
      },
    ),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  await plugin?.register(shell);
  if (!runtime) throw new Error("The tools slot did not run");
  return runtime;
}

describe("a first-party service generating through a template", () => {
  it("hands the config to the brain as written and parses what comes back", async () => {
    const shell = createMockShell();
    const asked: Array<{ config: unknown; signal: AbortSignal | undefined }> =
      [];
    shell.generateContent = async (config, signal): Promise<unknown> => {
      asked.push({ config, signal });
      return { topics: ["tides"] };
    };
    const runtime = await runtimeOn(shell);
    const signal = new AbortController().signal;
    const config = {
      templateName: "topics:extraction",
      representedIdentity: "none" as const,
      prompt: "Extract the topics.",
    };

    expect(
      await runtime.ai.generate(
        config,
        z.object({ topics: z.array(z.string()) }),
        signal,
      ),
    ).toEqual({ topics: ["tides"] });
    expect(asked).toEqual([{ config, signal }]);
    // What the schema refuses is refused, not handed on.
    expect(
      runtime.ai.generate(config, z.object({ titles: z.array(z.string()) })),
    ).rejects.toThrow();
  });

  it("asks nothing once its signal is aborted", async () => {
    const shell = createMockShell();
    let asked = 0;
    shell.generateContent = async (): Promise<unknown> => {
      asked += 1;
      return {};
    };
    const runtime = await runtimeOn(shell);
    const aborted = new AbortController();
    aborted.abort();

    expect(
      runtime.ai.generate(
        { templateName: "topics:votes", prompt: "Vote." },
        z.object({}),
        aborted.signal,
      ),
    ).rejects.toThrow();
    expect(asked).toBe(0);
    expect(Object.keys(runtime.ai).sort()).toEqual([
      "generate",
      "generateObject",
      "judge",
    ]);
  });
});
