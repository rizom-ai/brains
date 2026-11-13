import { describe, it, expect, beforeEach } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import type { BaseDataSourceContext, DataSource } from "@brains/plugins";
import { topicListSchema } from "../../src/templates/topic-list/schema";
import { createTopicsPlugins } from "../topics-plugins";

describe("the topics data source", () => {
  let dataSource: DataSource;
  let mockContext: BaseDataSourceContext;
  let mockShell: MockShell;

  beforeEach(async () => {
    mockShell = createMockShell({ logger: createSilentLogger() });
    for (const plugin of createTopicsPlugins())
      await plugin.register(mockShell);
    const registered = mockShell.getDataSourceRegistry().get("topics:entities");
    if (!registered) throw new Error("No topics data source");
    dataSource = registered;
    mockContext = { entityService: mockShell.getEntityService() };
  });

  it("should have correct metadata", () => {
    expect(dataSource.id).toBe("topics:entities");
    expect(dataSource.name).toBeDefined();
    expect(dataSource.description).toBeDefined();
  });

  it("should fetch data without throwing", async () => {
    if (!dataSource.fetch) throw new Error("The data source does not fetch");
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
