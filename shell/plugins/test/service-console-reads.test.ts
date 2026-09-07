import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type RuntimeReadiness,
  type ServiceChannelReader,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

/**
 * Two things a console shows that nothing else on the setup context said:
 * the theme the brain is dressed in, which the editor shell inlines, and
 * whether the runtime's dependencies are up, which the overview reports.
 * Both are reads the base context already answered.
 * Named consumer: @brains/studio.
 */
describe("what a console reads about the brain it runs in", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("console-reads-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function install(): Promise<{
    themeCSS: string;
    readiness: () => Promise<RuntimeReadiness>;
    channels: ServiceChannelReader;
  }> {
    let captured:
      | {
          themeCSS: string;
          readiness: () => Promise<RuntimeReadiness>;
          channels: ServiceChannelReader;
        }
      | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "studio",
        config: z.object({}),
        setup: ({ themeCSS, readiness, channels }) => {
          captured = { themeCSS, readiness, channels };
          return {};
        },
      }),
      {},
      { name: "@fixture/studio", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);
    // The channel list is read once every channel has registered.
    await harness.finalizeRegistration();
    if (!captured) throw new Error("setup did not run");
    return captured;
  }

  it("reads the theme the brain is dressed in", async () => {
    const { themeCSS } = await install();

    expect(typeof themeCSS).toBe("string");
  });

  it("counts the channels the brain can be reached on", async () => {
    const { channels } = await install();

    expect(Array.isArray(channels.listDescriptors())).toBe(true);
  });

  it("reads whether the runtime is ready", async () => {
    const { readiness } = await install();

    const report = await readiness();

    expect(report).toBeDefined();
  });
});
