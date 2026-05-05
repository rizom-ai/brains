import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { AgentDataSource } from "../src/datasources/agent-datasource";
import type { AgentEntity, AgentStatus } from "../src/schemas/agent";
import type { IEntityService, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import { createMockLogger, createMockEntityService } from "@brains/test-utils";
import { createTestAgent } from "./fixtures/agent";

function createMockAgent(
  id: string,
  name: string,
  status: AgentStatus,
  url = `https://${name.toLowerCase()}.io`,
): AgentEntity {
  return createTestAgent({
    id,
    name,
    url,
    status,
    organization: "Rizom",
    brainName: `${name}'s Brain`,
    did: `did:web:${name.toLowerCase()}.io`,
    about: `${name} is a brain agent.`,
    notes: "Connected via A2A.",
  });
}

describe("AgentDataSource", () => {
  let datasource: AgentDataSource;
  let mockEntityService: IEntityService;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockEntityService = createMockEntityService();
    mockContext = { entityService: mockEntityService };
    datasource = new AgentDataSource(mockLogger);
  });

  describe("metadata", () => {
    it("should have correct datasource ID", () => {
      expect(datasource.id).toBe("agent-discovery:entities");
    });

    it("should have descriptive name and description", () => {
      expect(datasource.name).toBe("Agent Directory DataSource");
      expect(datasource.description).toContain("agent");
    });
  });

  describe("list", () => {
    const listSchema = z.object({
      agents: z.array(z.any()),
      pagination: z.any().nullable(),
    });

    it("should return transformed agents with parsed body sections", async () => {
      const agents = [
        createMockAgent("agent-1", "Yeehaa", "approved"),
        createMockAgent("agent-2", "Phoney", "approved"),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(agents);

      const result = await datasource.fetch(
        { entityType: "agent" },
        listSchema,
        mockContext,
      );

      expect(result.agents).toHaveLength(2);
      expect(result.agents[0].frontmatter.name).toBe("Yeehaa");
      expect(result.agents[0].about).toBe("Yeehaa is a brain agent.");
      expect(result.agents[0].skills).toHaveLength(1);
      expect(result.agents[0].skills[0].name).toBe("Content Creation");
    });

    it("should sort by discoveredAt descending", async () => {
      spyOn(mockEntityService, "listEntities").mockResolvedValue([]);

      await datasource.fetch({ entityType: "agent" }, listSchema, mockContext);

      expect(mockEntityService.listEntities).toHaveBeenCalledWith({
        entityType: "agent",
        options: expect.objectContaining({
          sortFields: [{ field: "discoveredAt", direction: "desc" }],
        }),
      });
    });

    it("should filter by status at the entity-service level", async () => {
      spyOn(mockEntityService, "listEntities").mockResolvedValue([]);
      spyOn(mockEntityService, "countEntities").mockResolvedValue(0);

      await datasource.fetch(
        { entityType: "agent", query: { status: "approved", page: 1 } },
        listSchema,
        mockContext,
      );

      expect(mockEntityService.listEntities).toHaveBeenCalledWith({
        entityType: "agent",
        options: expect.objectContaining({
          filter: { metadata: { status: "approved" } },
        }),
      });
    });
  });

  describe("detail", () => {
    const detailSchema = z.object({
      agent: z.any(),
      prevAgent: z.any().nullable(),
      nextAgent: z.any().nullable(),
    });

    it("should return single agent with parsed sections", async () => {
      const agent = createMockAgent("agent-1", "Yeehaa", "approved");

      // First call: lookup by slug, second: all for navigation
      spyOn(mockEntityService, "listEntities")
        .mockResolvedValueOnce([agent])
        .mockResolvedValueOnce([agent]);

      const result = await datasource.fetch(
        { query: { id: "yeehaa" } },
        detailSchema,
        mockContext,
      );

      expect(result.agent.frontmatter.name).toBe("Yeehaa");
      expect(result.agent.about).toBe("Yeehaa is a brain agent.");
      expect(result.agent.notes).toBe("Connected via A2A.");
    });

    it("should include prev/next navigation", async () => {
      const alpha = createMockAgent("agent-1", "Alpha", "approved");
      const beta = createMockAgent("agent-2", "Beta", "approved");
      const gamma = createMockAgent("agent-3", "Gamma", "approved");
      const agents = [alpha, beta, gamma];

      spyOn(mockEntityService, "listEntities")
        .mockResolvedValueOnce([beta])
        .mockResolvedValueOnce(agents);

      const result = await datasource.fetch(
        { query: { id: "beta" } },
        detailSchema,
        mockContext,
      );

      expect(result.agent.frontmatter.name).toBe("Beta");
      expect(result.prevAgent?.frontmatter.name).toBe("Alpha");
      expect(result.nextAgent?.frontmatter.name).toBe("Gamma");
    });
  });
});
