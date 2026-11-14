import { describe, expect, it, spyOn } from "bun:test";
import {
  createMockShell,
  type MockShell,
  type MockShellOptions,
} from "../src/test/mock-shell";
import { probeService } from "../src/test/probe-service-runtime";

/**
 * A first-party service converted from a class reads and registers what
 * the forms engine's service class did through its context: the brain's
 * theme stylesheet for the pages it serves, whether another plugin is
 * installed, the URL it advertises, and the health it reports.
 */

function shellWith(options: MockShellOptions = {}): MockShell {
  return createMockShell(options);
}

describe("a first-party service's forms-engine reads and registrations", () => {
  it("reads the brain's theme stylesheet, as its class read context.themeCSS", async () => {
    const { runtime } = await probeService(
      shellWith({ themeCSS: ":root { --color: red; }" }),
    );
    expect(runtime.themeCSS).toBe(":root { --color: red; }");
  });

  it("says whether a plugin is installed, as its class read context.plugins.has", async () => {
    const shell = shellWith();
    spyOn(shell, "getPluginPackageName").mockImplementation((id) =>
      id === "unified-inbox" ? "@brains/unified-inbox" : undefined,
    );
    const { runtime } = await probeService(shell);
    expect(runtime.hasPlugin("unified-inbox")).toBe(true);
    expect(runtime.hasPlugin("studio")).toBe(false);
  });

  it("advertises a URL under its plugin id, and none from a worker, as its class did through context.endpoints", async () => {
    const shell = shellWith();
    const { runtime } = await probeService(shell);
    runtime.endpoint({
      label: "Contact",
      url: "https://brain.test/contact",
      priority: 50,
      visibility: "public",
    });
    expect(shell.listEndpoints()).toEqual([
      {
        pluginId: "probe",
        label: "Contact",
        url: "https://brain.test/contact",
        priority: 50,
        visibility: "public",
      },
    ]);

    const workerShell = shellWith();
    const worker = await probeService(workerShell, { executionOnly: true });
    worker.runtime.endpoint({
      label: "Contact",
      url: "https://brain.test/contact",
    });
    expect(workerShell.listEndpoints()).toEqual([]);
  });

  it("reports a health check under its plugin id until it shuts down, as its class did through context.operationalHealth", async () => {
    const shell = shellWith();
    const { runtime, plugin } = await probeService(shell);
    runtime.operationalHealth("intake", async () => ({
      status: "healthy",
      message: "Intake is open.",
    }));
    expect(await shell.getOperationalHealthRegistry().getChecks()).toEqual([
      { name: "probe:intake", status: "healthy", message: "Intake is open." },
    ]);

    await plugin.shutdown?.();
    expect(await shell.getOperationalHealthRegistry().getChecks()).toEqual([]);
  });
});
