import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type Plugin,
  type ServiceGitBroker,
  type ServiceRole,
} from "../src";
import { createPluginHarness } from "../src/test/harness";
import { createMockShell } from "../src/test/mock-shell";

interface Seen {
  role: ServiceRole;
  gitBroker: ServiceGitBroker;
  dataDir: string;
}

/** A service that reports the process it was set up in. */
function instantiate(): { plugin: Plugin; seen: () => Seen } {
  let seen: Seen | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "directory-sync",
      config: z.object({}),
      setup: ({ role, gitBroker, dataDir }) => {
        seen = { role, gitBroker, dataDir };
        return {};
      },
    }),
    {},
    { name: "@fixture/directory-sync", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Service plugin was not created");
  return {
    plugin,
    seen: (): Seen => {
      if (!seen) throw new Error("setup did not run");
      return seen;
    },
  };
}

/**
 * Two facts about the process a declared service runs in.
 *
 * The runtime already withholds operator bindings from a worker. A package
 * whose own duties differ by role — one that reconciles a git checkout only
 * where the scheduler runs, and must never open admission from a worker —
 * reads which role it is in, and where the broker that owns the checkout
 * listens. Named consumer: @brains/directory-sync.
 */
describe("the process a declared service runs in", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("role-test"),
    gitBrokerSocket: "/run/brain/git-broker.sock",
    gitBrokerCheckout: "/srv/brain/checkout",
    dataDir: "/srv/brain/data",
  });

  afterEach(async () => {
    await harness.reset();
  });

  it("reads the scheduling role, the broker's whereabouts and the data dir", async () => {
    const { plugin, seen } = instantiate();

    await harness.installPlugin(plugin);

    expect(seen()).toEqual({
      role: "scheduler",
      gitBroker: {
        socket: "/run/brain/git-broker.sock",
        checkout: "/srv/brain/checkout",
      },
      dataDir: "/srv/brain/data",
    });
  });

  it("knows a worker from a scheduler, and a brain with no owner", async () => {
    const shell = createMockShell({ logger: createSilentLogger("role-test") });
    const { plugin, seen } = instantiate();

    await plugin.register(shell, { executionOnly: true });

    expect(seen()).toMatchObject({
      role: "worker",
      gitBroker: { socket: undefined, checkout: undefined },
    });
    if (plugin.shutdown) await plugin.shutdown();
  });
});
