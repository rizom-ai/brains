import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createInterfacePluginHarness } from "@brains/plugins/test";
import { WebserverInterface } from "../src/webserver-interface";
import { createSilentLogger } from "@brains/test-utils";

describe("WebserverInterface", () => {
  let harness: ReturnType<
    typeof createInterfacePluginHarness<WebserverInterface>
  >;
  let plugin: WebserverInterface;

  beforeEach(async () => {
    plugin = new WebserverInterface({
      previewDistDir: "./test-website",
      productionDistDir: "./test-website-production",
      previewPort: 4322,
      productionPort: 8081,
    });

    harness = createInterfacePluginHarness<WebserverInterface>({
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

  it("should initialize with default config", async () => {
    const defaultPlugin = new WebserverInterface();
    const defaultHarness = createInterfacePluginHarness<WebserverInterface>({
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
