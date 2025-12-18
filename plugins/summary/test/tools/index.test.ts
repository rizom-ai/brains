import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from "bun:test";
import { createGetTool } from "../../src/tools";
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
import { createMockSummaryEntity } from "../fixtures/summary-entities";

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
      const mockSummary = createMockSummaryEntity({
        id: "conv-123",
        content: "# Summary\n\nContent",
        metadata: {
          conversationId: "conv-123",
          channelName: "Test Channel",
          channelId: "test-channel",
          interfaceType: "cli",
          entryCount: 1,
          totalMessages: 10,
        },
      });
      const getSummarySpy = spyOn(
        SummaryService.prototype,
        "getSummary",
      ).mockResolvedValue(mockSummary);

      await tool.handler({ conversationId: "conv-123" }, mockToolContext);

      expect(getSummarySpy).toHaveBeenCalledWith("conv-123");
    });
  });

  // Note: export/delete/stats tools removed - use system tools instead:
  // - system_list with entityType="summary" for listing
  // - system_get for reading full content (can be exported as markdown)
  // - AI can calculate stats from list results
});
