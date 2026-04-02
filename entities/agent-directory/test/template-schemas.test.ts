import { describe, it, expect } from "bun:test";
import {
  agentWithDataSchema,
  enrichedAgentSchema,
  templateAgentSchema,
} from "../src/schemas/agent";

const baseAgent = {
  id: "agent-1",
  entityType: "agent" as const,
  content: "---\nname: Yeehaa\n---\n",
  created: "2026-03-31T00:00:00.000Z",
  updated: "2026-03-31T00:00:00.000Z",
  metadata: {
    name: "Yeehaa",
    url: "https://yeehaa.io",
    status: "active" as const,
    slug: "yeehaa-io",
  },
  contentHash: "abc123",
  frontmatter: {
    name: "Yeehaa",
    kind: "professional" as const,
    organization: "Rizom",
    brainName: "Yeehaa's Brain",
    url: "https://yeehaa.io",
    did: "did:web:yeehaa.io",
    status: "active" as const,
    discoveredAt: "2026-03-31T00:00:00.000Z",
    discoveredVia: "manual" as const,
  },
  about: "Founder of Rizom.",
  skills: [
    {
      name: "Content Creation",
      description: "Create blog posts",
      tags: ["blog"],
    },
  ],
  notes: "Reliable collaborator.",
};

describe("Agent template schemas", () => {
  describe("agentWithDataSchema", () => {
    it("should validate agent with parsed body sections", () => {
      const result = agentWithDataSchema.safeParse(baseAgent);
      expect(result.success).toBe(true);
    });

    it("should reject missing about field", () => {
      const { about: _, ...noAbout } = baseAgent;
      const result = agentWithDataSchema.safeParse(noAbout);
      expect(result.success).toBe(false);
    });

    it("should validate agent with empty skills array", () => {
      const result = agentWithDataSchema.safeParse({
        ...baseAgent,
        skills: [],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("enrichedAgentSchema", () => {
    it("should validate with optional url and typeLabel", () => {
      const result = enrichedAgentSchema.safeParse(baseAgent);
      expect(result.success).toBe(true);
    });

    it("should validate with url and typeLabel present", () => {
      const result = enrichedAgentSchema.safeParse({
        ...baseAgent,
        url: "/agents/agent-1",
        typeLabel: "Agent",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("templateAgentSchema", () => {
    it("should require url and typeLabel", () => {
      const result = templateAgentSchema.safeParse(baseAgent);
      expect(result.success).toBe(false);
    });

    it("should validate with url and typeLabel present", () => {
      const result = templateAgentSchema.safeParse({
        ...baseAgent,
        url: "/agents/agent-1",
        typeLabel: "Agent",
      });
      expect(result.success).toBe(true);
    });
  });
});
