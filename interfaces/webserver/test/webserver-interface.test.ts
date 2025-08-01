import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { InterfacePluginTestHarness } from "@brains/interface-plugin";
import { WebserverInterface } from "../src/webserver-interface";
import { createSilentLogger } from "@brains/utils";

describe("WebserverInterface", () => {
  let harness: InterfacePluginTestHarness<WebserverInterface>;
  let plugin: WebserverInterface;

  beforeEach(async () => {
    plugin = new WebserverInterface({
      previewDistDir: "./test-website",
      productionDistDir: "./test-website-production",
      previewPort: 4322,
      productionPort: 8081,
    });

    harness = new InterfacePluginTestHarness({
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
    const defaultHarness = new InterfacePluginTestHarness({
      logger: createSilentLogger("webserver-default-test"),
    });

    await defaultHarness.installPlugin(defaultPlugin);
    expect(defaultPlugin).toBeDefined();

    defaultHarness.reset();
  });

  it("should provide start and stop methods", () => {
    expect(typeof plugin.start).toBe("function");
    expect(typeof plugin.stop).toBe("function");
  });

  it("should implement isRunning method", () => {
    expect(typeof plugin.isRunning).toBe("function");
    expect(plugin.isRunning()).toBe(false); // Should be false before starting
  });
});
