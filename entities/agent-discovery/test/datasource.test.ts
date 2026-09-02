import { describe, it, expect, beforeEach } from "bun:test";
import { AgentDataSource } from "../src/datasources/agent-datasource";
import type { AgentEntity, AgentStatus } from "../src/schemas/agent";
import type { BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { createMockLogger, createMockShell } from "@brains/test-utils";
import type { MockShell } from "@brains/test-utils";
import { createTestAgent } from "./fixtures/agent";
import { getTemplates } from "../src/lib/register-templates";

function createMockAgent(
  id: string,
  name: string,
  status: AgentStatus,
  discoveredAt?: string,
): AgentEntity {
  return createTestAgent({
    id,
    name,
    url: `https://${name.toLowerCase()}.io`,
    status,
    ...(discoveredAt ? { discoveredAt } : {}),
    organization: "Rizom",
    brainName: `${name}'s Brain`,
    did: `did:web:${name.toLowerCase()}.io`,
    about: `${name} is a brain agent.`,
    notes: "Connected via A2A.",
  });
}

function slugOf(agent: AgentEntity): string {
  return agent.metadata.slug;
}

describe("AgentDataSource", () => {
  let datasource: AgentDataSource;
  let shell: MockShell;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;

  beforeEach(() => {
    mockLogger = createMockLogger();
    shell = createMockShell();
    mockContext = { entityService: shell.getEntityService() };
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

    it("accepts datasource output before site URL enrichment", async () => {
      shell.addEntities([createMockAgent("agent-1", "Yeehaa", "approved")]);

      const templateSchema = getTemplates()["agent-list"]?.schema;
      if (!templateSchema) throw new Error("agent-list template not found");

      const result = await datasource.fetch(
        { entityType: "agent", query: { page: 1, pageSize: 10 } },
        templateSchema,
        mockContext,
      );
      const parsed = listSchema.parse(result);

      expect(parsed.agents).toHaveLength(1);
      expect(parsed.agents[0]?.url).toBeNull();
      expect(parsed.agents[0]?.typeLabel).toBeNull();
      expect(
        z.looseObject({ baseUrl: z.null() }).parse(result).baseUrl,
      ).toBeNull();
      expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
    });

    it("should return transformed agents with parsed body sections", async () => {
      shell.addEntities([
        createMockAgent("agent-1", "Yeehaa", "approved"),
        createMockAgent("agent-2", "Phoney", "approved"),
      ]);

      const result = await datasource.fetch(
        { entityType: "agent" },
        listSchema,
        mockContext,
      );

      expect(result.agents).toHaveLength(2);
      const names = result.agents.map(
        (agent: { frontmatter: { name: string } }) => agent.frontmatter.name,
      );
      expect(names).toContain("Yeehaa");
      expect(names).toContain("Phoney");
      const yeehaa = result.agents.find(
        (agent: { frontmatter: { name: string } }) =>
          agent.frontmatter.name === "Yeehaa",
      );
      expect(yeehaa.about).toBe("Yeehaa is a brain agent.");
      expect(yeehaa.skills).toHaveLength(1);
      expect(yeehaa.skills[0].name).toBe("Content Creation");
    });

    it("should sort by discoveredAt descending", async () => {
      shell.addEntities([
        createMockAgent(
          "agent-old",
          "Oldest",
          "approved",
          "2026-01-01T10:00:00.000Z",
        ),
        createMockAgent(
          "agent-new",
          "Newest",
          "approved",
          "2026-01-03T10:00:00.000Z",
        ),
        createMockAgent(
          "agent-mid",
          "Middle",
          "approved",
          "2026-01-02T10:00:00.000Z",
        ),
      ]);

      const result = await datasource.fetch(
        { entityType: "agent" },
        listSchema,
        mockContext,
      );

      expect(
        result.agents.map(
          (agent: { frontmatter: { name: string } }) => agent.frontmatter.name,
        ),
      ).toEqual(["Newest", "Middle", "Oldest"]);
    });

    it("should filter by status at the entity-service level", async () => {
      shell.addEntities([
        createMockAgent("agent-1", "Approved", "approved"),
        createMockAgent("agent-2", "Sighted", "discovered"),
      ]);

      const result = await datasource.fetch(
        { entityType: "agent", query: { status: "approved", page: 1 } },
        listSchema,
        mockContext,
      );

      expect(
        result.agents.map(
          (agent: { frontmatter: { name: string } }) => agent.frontmatter.name,
        ),
      ).toEqual(["Approved"]);
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
      shell.addEntities([agent]);

      const result = await datasource.fetch(
        { query: { id: slugOf(agent) } },
        detailSchema,
        mockContext,
      );

      expect(result.agent.frontmatter.name).toBe("Yeehaa");
      expect(result.agent.about).toBe("Yeehaa is a brain agent.");
      expect(result.agent.notes).toBe("Connected via A2A.");
    });

    it("should include prev/next navigation", async () => {
      const alpha = createMockAgent(
        "agent-1",
        "Alpha",
        "approved",
        "2026-01-03T10:00:00.000Z",
      );
      const beta = createMockAgent(
        "agent-2",
        "Beta",
        "approved",
        "2026-01-02T10:00:00.000Z",
      );
      const gamma = createMockAgent(
        "agent-3",
        "Gamma",
        "approved",
        "2026-01-01T10:00:00.000Z",
      );
      shell.addEntities([alpha, beta, gamma]);

      const result = await datasource.fetch(
        { query: { id: slugOf(beta) } },
        detailSchema,
        mockContext,
      );

      expect(result.agent.frontmatter.name).toBe("Beta");
      expect(result.prevAgent?.frontmatter.name).toBe("Alpha");
      expect(result.nextAgent?.frontmatter.name).toBe("Gamma");
    });
  });
});
