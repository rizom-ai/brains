import { describe, expect, it } from "bun:test";
import { createMockShell } from "../src/test/mock-shell";
import { probeRuntime } from "../src/test/probe-service-runtime";

/**
 * A first-party service converted from a class finds the brain's git
 * broker where its class did, through context.gitBrokerSocket and
 * context.gitBrokerCheckout: directory-sync connects to the checkout's
 * owner there and syncs in its checkout.
 */

describe("a first-party service's git broker", () => {
  it("is the brain's broker socket and checkout, as its class read them", async () => {
    const runtime = await probeRuntime(
      createMockShell({
        gitBrokerSocket: "/run/brain/git.sock",
        gitBrokerCheckout: "/data/brain-data",
      }),
    );
    expect(runtime.gitBroker).toEqual({
      socket: "/run/brain/git.sock",
      checkout: "/data/brain-data",
    });
  });

  it("is none on a brain without Git", async () => {
    const runtime = await probeRuntime(createMockShell());
    expect(runtime.gitBroker).toEqual({
      socket: undefined,
      checkout: undefined,
    });
  });
});
