import { describe, expect, test, beforeEach } from "bun:test";
import { DataSourceRegistry } from "../src/registry";
import type { DataSource } from "../src/types";
import { createSilentLogger } from "@brains/utils";

// Test data sources
const mockFetchDataSource: DataSource = {
  id: "test-fetch",
  name: "Test Fetch DataSource",
  description: "A test data source that fetches data",
  fetch: async (query?: unknown) => ({ result: "fetched", query }),
};

const mockGenerateDataSource: DataSource = {
  id: "test-generate",
  name: "Test Generate DataSource",
  generate: async (request: unknown) => ({ result: "generated", request }),
};

const mockTransformDataSource: DataSource = {
  id: "test-transform",
  name: "Test Transform DataSource",
  transform: async (content: unknown, format: string) => ({
    result: "transformed",
    content,
    format,
  }),
};

const mockMultiCapabilityDataSource: DataSource = {
  id: "test-multi",
  name: "Test Multi-Capability DataSource",
  fetch: async () => ({ result: "multi-fetch" }),
  generate: async () => ({ result: "multi-generate" }),
  transform: async () => ({ result: "multi-transform" }),
};

describe("DataSourceRegistry", () => {
  let registry: DataSourceRegistry;
  const logger = createSilentLogger();

  beforeEach(() => {
    DataSourceRegistry.resetInstance();
    registry = DataSourceRegistry.createFresh(logger);
  });

  describe("Component Interface Standardization", () => {
    test("should implement singleton pattern", () => {
      const instance1 = DataSourceRegistry.getInstance(logger);
      const instance2 = DataSourceRegistry.getInstance(logger);
      expect(instance1).toBe(instance2);
    });

    test("should reset instance", () => {
      const instance1 = DataSourceRegistry.getInstance(logger);
      DataSourceRegistry.resetInstance();
      const instance2 = DataSourceRegistry.getInstance(logger);
      expect(instance1).not.toBe(instance2);
    });

    test("should create fresh instance", () => {
      const singleton = DataSourceRegistry.getInstance(logger);
      const fresh = DataSourceRegistry.createFresh(logger);
      expect(singleton).not.toBe(fresh);
    });
  });

  describe("Registration", () => {
    test("should register a fetch data source", () => {
      registry.register(mockFetchDataSource);
      expect(registry.has("test-fetch")).toBe(true);
      expect(registry.get("test-fetch")).toEqual(mockFetchDataSource);
    });

    test("should register a generate data source", () => {
      registry.register(mockGenerateDataSource);
      expect(registry.has("test-generate")).toBe(true);
      expect(registry.get("test-generate")).toEqual(mockGenerateDataSource);
    });

    test("should register a transform data source", () => {
      registry.register(mockTransformDataSource);
      expect(registry.has("test-transform")).toBe(true);
      expect(registry.get("test-transform")).toEqual(mockTransformDataSource);
    });

    test("should register a multi-capability data source", () => {
      registry.register(mockMultiCapabilityDataSource);
      expect(registry.has("test-multi")).toBe(true);
      expect(registry.get("test-multi")).toEqual(mockMultiCapabilityDataSource);
    });

    test("should throw error for duplicate IDs", () => {
      registry.register(mockFetchDataSource);
      expect(() => registry.register(mockFetchDataSource)).toThrow(
        'DataSource with id "test-fetch" already exists',
      );
    });

    test("should register data source with prefix", () => {
      registry.registerWithPrefix("stats", mockFetchDataSource, "plugin1");
      expect(registry.has("plugin1:stats")).toBe(true);
      expect(registry.get("plugin1:stats")).toEqual(mockFetchDataSource);
    });

    test("should register data source with shell prefix when no prefix provided", () => {
      registry.registerWithPrefix("stats", mockFetchDataSource);
      expect(registry.has("shell:stats")).toBe(true);
      expect(registry.get("shell:stats")).toEqual(mockFetchDataSource);
    });

    test("should prevent duplicate prefixed IDs", () => {
      registry.registerWithPrefix("stats", mockFetchDataSource, "plugin1");
      expect(() =>
        registry.registerWithPrefix("stats", mockGenerateDataSource, "plugin1"),
      ).toThrow('DataSource with id "plugin1:stats" already exists');
    });
  });

  describe("Retrieval", () => {
    beforeEach(() => {
      registry.register(mockFetchDataSource);
      registry.register(mockGenerateDataSource);
      registry.register(mockTransformDataSource);
      registry.register(mockMultiCapabilityDataSource);
    });

    test("should get data source by ID", () => {
      expect(registry.get("test-fetch")).toEqual(mockFetchDataSource);
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    test("should check if data source exists", () => {
      expect(registry.has("test-fetch")).toBe(true);
      expect(registry.has("nonexistent")).toBe(false);
    });

    test("should list all data sources", () => {
      const dataSources = registry.list();
      expect(dataSources).toHaveLength(4);
      expect(dataSources).toContain(mockFetchDataSource);
      expect(dataSources).toContain(mockGenerateDataSource);
      expect(dataSources).toContain(mockTransformDataSource);
      expect(dataSources).toContain(mockMultiCapabilityDataSource);
    });

    test("should get all data source IDs", () => {
      const ids = registry.getIds();
      expect(ids).toHaveLength(4);
      expect(ids).toContain("test-fetch");
      expect(ids).toContain("test-generate");
      expect(ids).toContain("test-transform");
      expect(ids).toContain("test-multi");
    });
  });

  describe("Capability-based queries", () => {
    beforeEach(() => {
      registry.register(mockFetchDataSource);
      registry.register(mockGenerateDataSource);
      registry.register(mockTransformDataSource);
      registry.register(mockMultiCapabilityDataSource);
    });

    test("should get data sources by fetch capability", () => {
      const fetchDataSources = registry.getByCapability("canFetch");
      expect(fetchDataSources).toHaveLength(2);
      expect(fetchDataSources).toContain(mockFetchDataSource);
      expect(fetchDataSources).toContain(mockMultiCapabilityDataSource);
    });

    test("should get data sources by generate capability", () => {
      const generateDataSources = registry.getByCapability("canGenerate");
      expect(generateDataSources).toHaveLength(2);
      expect(generateDataSources).toContain(mockGenerateDataSource);
      expect(generateDataSources).toContain(mockMultiCapabilityDataSource);
    });

    test("should get data sources by transform capability", () => {
      const transformDataSources = registry.getByCapability("canTransform");
      expect(transformDataSources).toHaveLength(2);
      expect(transformDataSources).toContain(mockTransformDataSource);
      expect(transformDataSources).toContain(mockMultiCapabilityDataSource);
    });

    test("should find data sources with custom predicate", () => {
      const multiCapabilityDataSources = registry.find(
        (ds) => !!ds.fetch && !!ds.generate && !!ds.transform,
      );
      expect(multiCapabilityDataSources).toHaveLength(1);
      expect(multiCapabilityDataSources[0]).toEqual(
        mockMultiCapabilityDataSource,
      );
    });
  });

  describe("Management", () => {
    test("should unregister data source", () => {
      registry.register(mockFetchDataSource);
      expect(registry.has("test-fetch")).toBe(true);

      registry.unregister("test-fetch");
      expect(registry.has("test-fetch")).toBe(false);
      expect(registry.get("test-fetch")).toBeUndefined();
    });

    test("should clear all data sources", () => {
      registry.register(mockFetchDataSource);
      registry.register(mockGenerateDataSource);
      expect(registry.list()).toHaveLength(2);

      registry.clear();
      expect(registry.list()).toHaveLength(0);
    });
  });
});
