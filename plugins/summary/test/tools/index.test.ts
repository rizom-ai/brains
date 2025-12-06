import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from "bun:test";
import {
  createGetTool,
  createListTool,
  createExportTool,
  createDeleteTool,
  createStatsTool,
} from "../../src/tools";
import { SummaryService } from "../../src/lib/summary-service";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
  type ToolContext,
} from "@brains/plugins/test";
import type { SummaryConfig } from "../../src/schemas/summary";

describe("Summary Tools", () => {
  let context: ServicePluginContext;
  let config: SummaryConfig;
  let logger: Logger;
  let mockShell: MockShell;
  let mockToolContext: ToolContext;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "summary");
    config = {
      enableAutoSummary: true,
      includeDecisions: true,
      includeActionItems: true,
      maxSummaryLength: 500,
    };
    mockToolContext = {
      interfaceType: "cli",
      userId: "test-user",
      channelId: "test-channel",
    };
  });

  afterEach(() => {
    // Restore all mocked functions to prevent test pollution
    mock.restore();
  });

  describe("summary-get tool", () => {
    it("should have correct metadata", () => {
      const tool = createGetTool(context, config, logger);

      expect(tool.name).toBe("summary_get");
      expect(tool.description).toContain("conversation's summary");
      expect(tool.inputSchema).toBeDefined();
    });

    it("should call SummaryService.getSummary with correct ID", async () => {
      const tool = createGetTool(context, config, logger);
      const mockSummary = {
        id: "conv-123",
        entityType: "summary" as const,
        content: "# Summary\n\nContent",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
        metadata: {
          conversationId: "conv-123",
          channelName: "Test Channel",
          channelId: "test-channel",
          interfaceType: "cli",
          entryCount: 1,
          totalMessages: 10,
        },
      };
      const getSummarySpy = spyOn(
        SummaryService.prototype,
        "getSummary",
      ).mockResolvedValue(mockSummary);

      await tool.handler({ conversationId: "conv-123" }, mockToolContext);

      expect(getSummarySpy).toHaveBeenCalledWith("conv-123");
    });
  });

  describe("summary-list tool", () => {
    it("should have correct metadata", () => {
      const tool = createListTool(context, config, logger);

      expect(tool.name).toBe("summary_list");
      expect(tool.description).toContain("List all conversation summaries");
      expect(tool.inputSchema).toBeDefined();
    });

    it("should call SummaryService.getAllSummaries with correct parameters", async () => {
      const tool = createListTool(context, config, logger);
      const getAllSummariesSpy = spyOn(
        SummaryService.prototype,
        "getAllSummaries",
      ).mockResolvedValue([]);

      await tool.handler({ limit: 5 }, mockToolContext);

      expect(getAllSummariesSpy).toHaveBeenCalled();
    });

    it("should call SummaryService.getAllSummaries with default limit", async () => {
      const tool = createListTool(context, config, logger);
      const getAllSummariesSpy = spyOn(
        SummaryService.prototype,
        "getAllSummaries",
      ).mockResolvedValue([]);

      await tool.handler({}, mockToolContext);

      expect(getAllSummariesSpy).toHaveBeenCalled();
    });
  });

  describe("summary-export tool", () => {
    it("should have correct metadata", () => {
      const tool = createExportTool(context, config, logger);

      expect(tool.name).toBe("summary_export");
      expect(tool.description).toContain("Export a conversation summary");
      expect(tool.inputSchema).toBeDefined();
    });

    it("should call SummaryService.exportSummary with correct ID", async () => {
      const tool = createExportTool(context, config, logger);
      const exportSummarySpy = spyOn(
        SummaryService.prototype,
        "exportSummary",
      ).mockResolvedValue("# Exported");

      await tool.handler({ conversationId: "conv-123" }, mockToolContext);

      expect(exportSummarySpy).toHaveBeenCalledWith("conv-123");
    });
  });

  describe("summary-delete tool", () => {
    it("should have correct metadata", () => {
      const tool = createDeleteTool(context, config, logger);

      expect(tool.name).toBe("summary_delete");
      expect(tool.description).toContain("Delete a conversation summary");
      expect(tool.inputSchema).toBeDefined();
    });

    it("should call SummaryService.deleteSummary with correct ID", async () => {
      const tool = createDeleteTool(context, config, logger);
      const deleteSummarySpy = spyOn(
        SummaryService.prototype,
        "deleteSummary",
      ).mockResolvedValue(true);

      await tool.handler({ conversationId: "conv-123" }, mockToolContext);

      expect(deleteSummarySpy).toHaveBeenCalledWith("conv-123");
    });
  });

  describe("summary-stats tool", () => {
    it("should have correct metadata", () => {
      const tool = createStatsTool(context, config, logger);

      expect(tool.name).toBe("summary_stats");
      expect(tool.description).toContain("statistics about all summaries");
      expect(tool.inputSchema).toBeDefined();
    });

    it("should call SummaryService.getStatistics", async () => {
      const tool = createStatsTool(context, config, logger);
      const getStatisticsSpy = spyOn(
        SummaryService.prototype,
        "getStatistics",
      ).mockResolvedValue({
        totalSummaries: 5,
        totalEntries: 25,
        averageEntriesPerSummary: 5,
      });

      await tool.handler({}, mockToolContext);

      expect(getStatisticsSpy).toHaveBeenCalled();
    });
  });
});
