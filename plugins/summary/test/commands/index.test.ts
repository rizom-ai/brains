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
  createListCommand,
  createGetCommand,
  createExportCommand,
  createDeleteCommand,
  createStatsCommand,
} from "../../src/commands";
import { SummaryService } from "../../src/lib/summary-service";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
  type CommandContext,
} from "@brains/plugins";
import type { SummaryConfig } from "../../src/schemas/summary";

describe("Summary Commands", () => {
  let context: ServicePluginContext;
  let config: SummaryConfig;
  let logger: Logger;
  let mockShell: MockShell;
  let mockCommandContext: CommandContext;

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
    mockCommandContext = {
      messageId: "test-message",
      userId: "test-user",
      channelId: "test-channel",
      interfaceType: "cli",
      userPermissionLevel: "public",
    };
  });

  afterEach(() => {
    // Restore all mocked functions to prevent test pollution
    mock.restore();
  });

  describe("summary-list command", () => {
    it("should have correct metadata", () => {
      const command = createListCommand(context, config, logger);

      expect(command.name).toBe("summary-list");
      expect(command.description).toContain("List all conversation summaries");
    });

    it("should call SummaryService.getAllSummaries", async () => {
      const command = createListCommand(context, config, logger);
      const getAllSummariesSpy = spyOn(
        SummaryService.prototype,
        "getAllSummaries",
      ).mockResolvedValue([]);

      await command.handler([], mockCommandContext);

      expect(getAllSummariesSpy).toHaveBeenCalled();
    });

    it("should handle limit argument", async () => {
      const command = createListCommand(context, config, logger);
      const mockSummaries = [
        {
          id: "1",
          entityType: "summary" as const,
          content: "content1",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T00:00:00Z",
          metadata: {
            conversationId: "conv-1",
            channelName: "Test Channel",
            entryCount: 5,
            totalMessages: 50,
            lastUpdated: "2025-01-01T00:00:00Z",
          },
        },
        {
          id: "2",
          entityType: "summary" as const,
          content: "content2",
          created: "2025-01-02T00:00:00Z",
          updated: "2025-01-02T00:00:00Z",
          metadata: {
            conversationId: "conv-2",
            channelName: "Test Channel",
            entryCount: 3,
            totalMessages: 30,
            lastUpdated: "2025-01-02T00:00:00Z",
          },
        },
      ];
      spyOn(SummaryService.prototype, "getAllSummaries").mockResolvedValue(
        mockSummaries,
      );

      const result = await command.handler(
        ["--limit", "1"],
        mockCommandContext,
      );

      expect(result).toBeDefined();
      expect(result.type).toBe("message");
      expect(result.message).toContain("📋 **Found 1 summaries:**");
      expect(result.message).toContain("conv-2");
    });
  });

  describe("summary-get command", () => {
    it("should have correct metadata", () => {
      const command = createGetCommand(context, config, logger);

      expect(command.name).toBe("summary-get");
      expect(command.description).toContain(
        "Get summary for a specific conversation",
      );
    });

    it("should call SummaryService.getSummary with correct ID", async () => {
      const command = createGetCommand(context, config, logger);
      const getSummarySpy = spyOn(
        SummaryService.prototype,
        "getSummary",
      ).mockResolvedValue(null);

      await command.handler(["conv-123"], mockCommandContext);

      expect(getSummarySpy).toHaveBeenCalledWith("conv-123");
    });

    it("should handle missing conversation ID", async () => {
      const command = createGetCommand(context, config, logger);

      const result = await command.handler([], mockCommandContext);

      expect(result).toBeDefined();
      expect(result.type).toBe("message");
      expect(result.message).toBe("Usage: /summary-get <conversation-id>");
    });
  });

  describe("summary-export command", () => {
    it("should have correct metadata", () => {
      const command = createExportCommand(context, config, logger);

      expect(command.name).toBe("summary-export");
      expect(command.description).toContain("Export summary as markdown");
    });

    it("should call SummaryService.exportSummary with correct ID", async () => {
      const command = createExportCommand(context, config, logger);
      const exportSummarySpy = spyOn(
        SummaryService.prototype,
        "exportSummary",
      ).mockResolvedValue("# Exported");

      await command.handler(["conv-123"], mockCommandContext);

      expect(exportSummarySpy).toHaveBeenCalledWith("conv-123");
    });

    it("should handle missing conversation ID", async () => {
      const command = createExportCommand(context, config, logger);

      const result = await command.handler([], mockCommandContext);

      expect(result).toBeDefined();
      expect(result.type).toBe("message");
      expect(result.message).toBe("Usage: /summary-export <conversation-id>");
    });
  });

  describe("summary-delete command", () => {
    it("should have correct metadata", () => {
      const command = createDeleteCommand(context, config, logger);

      expect(command.name).toBe("summary-delete");
      expect(command.description).toContain("Delete a conversation summary");
    });

    it("should call SummaryService.deleteSummary with correct ID", async () => {
      const command = createDeleteCommand(context, config, logger);

      // Mock getSummary to return an existing summary
      const mockSummary = {
        id: "conv-123",
        entityType: "summary" as const,
        content: "content",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
        metadata: {
          conversationId: "conv-123",
          channelName: "Test Channel",
          entryCount: 1,
          totalMessages: 10,
          lastUpdated: "2025-01-01T00:00:00Z",
        },
      };
      spyOn(SummaryService.prototype, "getSummary").mockResolvedValue(
        mockSummary,
      );

      // Mock deleteSummary
      const deleteSummarySpy = spyOn(
        SummaryService.prototype,
        "deleteSummary",
      ).mockResolvedValue(true);

      await command.handler(["conv-123"], mockCommandContext);

      expect(deleteSummarySpy).toHaveBeenCalledWith("conv-123");
    });

    it("should handle missing conversation ID", async () => {
      const command = createDeleteCommand(context, config, logger);

      const result = await command.handler([], mockCommandContext);

      expect(result).toBeDefined();
      expect(result.type).toBe("message");
      expect(result.message).toBe("Usage: /summary-delete <conversation-id>");
    });
  });

  describe("summary-stats command", () => {
    it("should have correct metadata", () => {
      const command = createStatsCommand(context, config, logger);

      expect(command.name).toBe("summary-stats");
      expect(command.description).toContain("Get summary statistics");
    });

    it("should call SummaryService.getStatistics", async () => {
      const command = createStatsCommand(context, config, logger);
      const getStatisticsSpy = spyOn(
        SummaryService.prototype,
        "getStatistics",
      ).mockResolvedValue({
        totalSummaries: 5,
        totalEntries: 25,
        averageEntriesPerSummary: 5,
      });

      const result = await command.handler([], mockCommandContext);

      expect(getStatisticsSpy).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.type).toBe("message");
      expect(result.message).toContain("**Summaries:** 5");
      expect(result.message).toContain("**Total Entries:** 25");
      expect(result.message).toContain("**Avg Entries/Summary:** 5.0");
    });
  });
});
