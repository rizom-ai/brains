import { describe, expect, it } from "bun:test";
import { createMockShell } from "../src/test/mock-shell";
import { createServicePluginContext } from "../src";
import { probeService } from "../src/test/probe-service-runtime";

/**
 * A first-party service converted from a class reads what the brain says
 * about itself as its class did through its context: the app's metadata,
 * whether this process serves the brain's HTTP surface, and the public
 * skills its card advertises. Atproto's brain card is built from them.
 */

describe("a first-party service's reads of the brain's self-description", () => {
  it("reads the app's metadata and the public skills as its class did", async () => {
    const shell = createMockShell();
    const { runtime } = await probeService(shell);
    const context = createServicePluginContext(shell, "probe");

    expect(await runtime.identity.getAppInfo()).toEqual(
      await context.identity.getAppInfo(),
    );
    expect(await runtime.publicSkills.list()).toEqual(
      await context.publicSkills.list(),
    );
  });

  it("knows whether this process serves the brain's HTTP surface", async () => {
    const plain = await probeService(createMockShell());
    expect(plain.runtime.servesHttp).toBe(false);

    const web = createMockShell();
    web.serveHttp();
    expect((await probeService(web)).runtime.servesHttp).toBe(true);
  });
});
