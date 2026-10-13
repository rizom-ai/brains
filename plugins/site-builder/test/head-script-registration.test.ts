import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import {
  defineServicePlugin,
  defineSubscription,
  z,
} from "@brains/sdk/services";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { caughtError } from "@brains/test-utils";
import { SiteBuilder } from "../src/lib/site-builder";
import { instantiate, SITE_BUILDER_PLUGIN_ID } from "./helpers/install";

describe("Head scripts at build time", () => {
  const harness = createPluginHarness();
  const rendered: Array<readonly string[] | undefined> = [];
  let restore = (): void => {};
  beforeEach(() => {
    const render = spyOn(SiteBuilder.prototype, "build").mockImplementation(
      async (options) => {
        rendered.push(options.headScripts);
        return {
          success: true,
          outputDir: options.outputDir,
          filesGenerated: 1,
          routesBuilt: 1,
        };
      },
    );
    restore = (): void => {
      render.mockRestore();
    };
  });
  afterEach(async () => {
    await harness.reset();
    rendered.length = 0;
    restore();
  });

  async function worker(plugin: Plugin): Promise<void> {
    const register = plugin.register.bind(plugin);
    plugin.register = (shell, options): ReturnType<typeof register> =>
      register(shell, { ...options, executionOnly: true });
    await harness.installPlugin(plugin);
  }
  async function builder(): Promise<void> {
    await worker(
      instantiate({ headScripts: ['<script src="/boot.js"></script>'] }),
    );
  }
  async function contribute(
    id: string,
    script: () => string | Promise<string>,
  ): Promise<void> {
    const definition = defineServicePlugin(
      { id, config: z.object({}) },
      {
        subscriptions: () => [
          defineSubscription({
            topic: SITE_BUILDER_CHANNELS.headScripts,
            payload: z.object({}),
            response: z.string(),
            execution: "all-roles",
            handle: script,
          }),
        ],
      },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: `@fixture/${id}`, version: "1" },
    );
    if (!plugin) throw new Error("Missing contributor");
    await worker(plugin);
  }
  const build = (): Promise<unknown> =>
    harness.runJob(`${SITE_BUILDER_PLUGIN_ID}:site-build`, {
      outputDir: "/tmp/head-script-fixture",
      environment: "preview",
    });

  it("asks on every worker build, in registration order after configured scripts", async () => {
    await contribute("first", async () => '<script src="/first.js"></script>');
    await builder();
    await build();
    let value = "one";
    await contribute("late", () => `<script>${value}</script>`);
    await build();
    value = "two";
    await build();
    expect(rendered).toEqual([
      ['<script src="/boot.js"></script>', '<script src="/first.js"></script>'],
      [
        '<script src="/boot.js"></script>',
        '<script src="/first.js"></script>',
        "<script>one</script>",
      ],
      [
        '<script src="/boot.js"></script>',
        '<script src="/first.js"></script>',
        "<script>two</script>",
      ],
    ]);
  });

  it("keeps configured scripts when nobody contributes", async () => {
    await builder();
    await build();
    expect(rendered).toEqual([['<script src="/boot.js"></script>']]);
  });

  it("refuses a failed contribution instead of certifying an incomplete render", async () => {
    await builder();
    await contribute("failed", () => {
      throw new Error("private provider details");
    });
    expect(await build().catch(caughtError)).toMatchObject({
      code: "handler_failed",
    });
    expect(rendered).toEqual([]);
  });
});
