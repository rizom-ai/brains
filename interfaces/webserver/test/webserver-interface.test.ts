import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { WebserverInterface } from "../src/webserver-interface";
import { createSilentLogger } from "@brains/test-utils";

describe("WebserverInterface", () => {
  let harness: ReturnType<typeof createPluginHarness<WebserverInterface>>;
  let plugin: WebserverInterface;

  beforeEach(async () => {
    plugin = new WebserverInterface({
      previewDistDir: "./test-website",
      productionDistDir: "./test-website-production",
      previewPort: 4322,
      productionPort: 8081,
    });

    harness = createPluginHarness<WebserverInterface>({
      logger: createSilentLogger("webserver-test"),
      // A domain is what gives the context a previewUrl; without one the
      // preview surface never registers and the assertions below say nothing.
      domain: "test.example",
    });

    await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  it("should register successfully", () => {
    expect(plugin.id).toBe("webserver");
    expect(plugin.type).toBe("interface");
    expect(plugin.version).toBeDefined();
  });

  it("registers a preview interaction when preview is enabled", () => {
    expect(
      harness
        .getMockShell()
        .listInteractions()
        .map((interaction) => interaction.id),
    ).toContain("preview");
  });

  it("should allow preview to be disabled for core-style usage", async () => {
    const corePlugin = new WebserverInterface({
      enablePreview: false,
      productionDistDir: "./test-website-production-core",
      productionPort: 8083,
    });
    const coreHarness = createPluginHarness<WebserverInterface>({
      logger: createSilentLogger("webserver-core-test"),
      domain: "test.example",
    });

    await coreHarness.installPlugin(corePlugin);

    // The point of enablePreview: false is that no preview surface appears.
    expect(
      coreHarness
        .getMockShell()
        .listInteractions()
        .map((interaction) => interaction.id),
    ).not.toContain("preview");

    coreHarness.reset();
  });

  it("should initialize with default config", async () => {
    const defaultPlugin = new WebserverInterface();
    const defaultHarness = createPluginHarness<WebserverInterface>({
      logger: createSilentLogger("webserver-default-test"),
    });

    await defaultHarness.installPlugin(defaultPlugin);
    expect(defaultPlugin).toBeDefined();

    defaultHarness.reset();
  });
});
