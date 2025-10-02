import { describe, it, expect, beforeEach } from "bun:test";
import { TopicsDataSource } from "../../src/datasources/topics-datasource";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins/test";
import { topicListSchema } from "../../src/templates/topic-list/schema";

describe("TopicsDataSource", () => {
  let dataSource: TopicsDataSource;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "topics");
    dataSource = new TopicsDataSource(context.entityService, logger);
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
    );
    expect(result).toBeDefined();
    expect(result.topics).toBeInstanceOf(Array);
    expect(result.totalCount).toBeGreaterThanOrEqual(0);
  });
});
