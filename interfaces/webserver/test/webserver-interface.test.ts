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
    });

    await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  it("should register successfully", () => {
    expect(plugin.id).toBe("webserver");
    expect(plugin.type).toBe("interface");
  });

  it("should initialize with custom config", () => {
    // Test passes if constructor doesn't throw and plugin registers successfully
    expect(plugin).toBeDefined();
  });

  it("should allow preview to be disabled for core-style usage", async () => {
    const corePlugin = new WebserverInterface({
      enablePreview: false,
      productionDistDir: "./test-website-production-core",
      productionPort: 8083,
    });
    const coreHarness = createPluginHarness<WebserverInterface>({
      logger: createSilentLogger("webserver-core-test"),
    });

    await coreHarness.installPlugin(corePlugin);
    expect(corePlugin).toBeDefined();

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

  it("should be properly configured", () => {
    // Plugin should be registered and configured
    expect(plugin.id).toBe("webserver");
    expect(plugin.type).toBe("interface");
    expect(plugin.version).toBeDefined();
  });
});
