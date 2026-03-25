import { describe, it, expect, beforeEach } from "bun:test";
import { TopicsDataSource } from "../../src/datasources/topics-datasource";
import { createSilentLogger } from "@brains/test-utils";
import {
  createMockShell,
  type MockShell,
  createEntityPluginContext,
  type EntityPluginContext,
  type Logger,
} from "@brains/plugins/test";
import type { BaseDataSourceContext } from "@brains/plugins";
import { topicListSchema } from "../../src/templates/topic-list/schema";

describe("TopicsDataSource", () => {
  let dataSource: TopicsDataSource;
  let context: EntityPluginContext;
  let mockContext: BaseDataSourceContext;
  let logger: Logger;
  let mockShell: MockShell;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = createMockShell({ logger });
    context = createEntityPluginContext(mockShell, "topics");
    dataSource = new TopicsDataSource(logger);
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
