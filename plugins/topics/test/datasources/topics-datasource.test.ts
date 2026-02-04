import { describe, it, expect, beforeEach } from "bun:test";
import { TopicsDataSource } from "../../src/datasources/topics-datasource";
import { createSilentLogger } from "@brains/test-utils";
import {
  MockShell,
  createServicePluginContext,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import type { BaseDataSourceContext } from "@brains/plugins";
import { topicListSchema } from "../../src/templates/topic-list/schema";

describe("TopicsDataSource", () => {
  let dataSource: TopicsDataSource;
  let context: ServicePluginContext;
  let mockContext: BaseDataSourceContext;
  let logger: Logger;
  let mockShell: MockShell;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "topics");
    // Only pass logger to constructor - entityService comes from context
    dataSource = new TopicsDataSource(logger);
    // Create context with entityService for fetch calls
    mockContext = { entityService: context.entityService };
  });

  it("should be instantiable", () => {
    expect(dataSource).toBeDefined();
  });

  it("should have correct metadata", () => {
    expect(dataSource.id).toBe("topics:entities");
    expect(dataSource.name).toBeDefined();
    expect(dataSource.description).toBeDefined();
  });

  it("should fetch data without throwing", async () => {
    // Pass context with entityService to fetch
    const result = await dataSource.fetch(
      { entityType: "topic" },
      topicListSchema,
      mockContext,
    );
    expect(result).toBeDefined();
    expect(result.topics).toBeInstanceOf(Array);
    expect(result.totalCount).toBeGreaterThanOrEqual(0);
  });
});
