import { describe, it, expect } from "bun:test";
import {
  createSilentLogger,
  createMockLogger,
  createMockAssetStore,
  createMockAssetsNamespace,
  createMockEntityPluginContext,
  createMockEntityService,
  createMockProgressReporter,
  createMockServicePluginContext,
} from "../src";

describe("@brains/test-utils", () => {
  describe("createSilentLogger", () => {
    it("should create a logger", () => {
      const logger = createSilentLogger("test");
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
    });
  });

  describe("createMockLogger", () => {
    it("should create a mock logger with spyable methods", () => {
      const logger = createMockLogger();
      expect(logger).toBeDefined();
      logger.info("test message");
      expect(logger.info).toHaveBeenCalledWith("test message");
    });
  });

  describe("createMockEntityService", () => {
    it("should create a mock entity service", () => {
      const service = createMockEntityService();
      expect(service).toBeDefined();
      expect(typeof service.getEntity).toBe("function");
      expect(typeof service.createEntity).toBe("function");
    });

    it("should return configured entity types", () => {
      const service = createMockEntityService({
        entityTypes: ["note", "post"],
      });
      expect(service.getEntityTypes()).toEqual(["note", "post"]);
    });
  });

  describe("durable asset mocks", () => {
    it("stores content-addressed bytes through the plugin namespace", async () => {
      const store = createMockAssetStore();
      const assets = createMockAssetsNamespace(store);
      const bytes = Buffer.from("asset bytes");

      const record = await assets.put(bytes, { maxBytes: bytes.byteLength });

      expect(Buffer.from(await assets.read(record.ref))).toEqual(bytes);
      expect(await assets.verify(record.ref)).toMatchObject({ valid: true });
    });

    it("exposes a configured asset namespace on entity plugin contexts", () => {
      const assets = createMockAssetsNamespace();
      const context = createMockEntityPluginContext({ assets });
      expect(context.assets).toBe(assets);
    });
  });

  describe("createMockProgressReporter", () => {
    it("should create a mock progress reporter", async () => {
      const reporter = createMockProgressReporter();
      await reporter.report({ progress: 50, message: "halfway" });
      expect(reporter.report).toHaveBeenCalledWith({
        progress: 50,
        message: "halfway",
      });
    });
  });

  describe("createMockServicePluginContext", () => {
    it("should create a mock context with entity service", () => {
      const context = createMockServicePluginContext();
      expect(context.entityService).toBeDefined();
      expect(context.logger).toBeDefined();
      expect(context.pluginId).toBe("test-plugin");
    });

    it("should accept custom options", () => {
      const context = createMockServicePluginContext({
        pluginId: "my-plugin",
        entityTypes: ["note"],
      });
      expect(context.pluginId).toBe("my-plugin");
      expect(context.entityService.getEntityTypes()).toEqual(["note"]);
    });
  });
});
