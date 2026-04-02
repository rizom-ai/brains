import { describe, it, expect } from "bun:test";
import { AgentAdapter } from "../src/adapters/agent-adapter";

const adapter = new AgentAdapter();

describe("AgentAdapter", () => {
  it("should have correct entity type", () => {
    expect(adapter.entityType).toBe("agent");
  });

  describe("createAgentContent", () => {
    it("should build markdown with frontmatter and body sections", () => {
      const content = adapter.createAgentContent({
        name: "Yeehaa",
        kind: "professional",
        organization: "Rizom",
        brainName: "Yeehaa's Brain",
        url: "https://yeehaa.io",
        did: "did:web:yeehaa.io",
        status: "active",
        discoveredAt: "2026-03-31T00:00:00.000Z",
        discoveredVia: "manual",
        about: "Founder of Rizom, working on institutional design.",
        skills: [
          {
            name: "Content Creation",
            description: "Create blog posts",
            tags: ["blog", "writing"],
          },
          {
            name: "Knowledge Search",
            description: "Search knowledge base",
            tags: ["search"],
          },
        ],
        notes: "",
      });

      // Frontmatter
      expect(content).toContain("name: Yeehaa");
      expect(content).toContain("organization: Rizom");
      expect(content).toContain("brainName: Yeehaa's Brain");
      expect(content).toContain("url:");
      expect(content).toContain("yeehaa.io");
      expect(content).toContain("did:");
      expect(content).toContain("did:web:yeehaa.io");
      expect(content).toContain("status: active");
      expect(content).toContain("discoveredVia: manual");

      // Body sections
      expect(content).toContain("## About");
      expect(content).toContain("Founder of Rizom");
      expect(content).toContain("## Skills");
      expect(content).toContain("Content Creation: Create blog posts");
      expect(content).toContain("[blog, writing]");
      expect(content).toContain("## Notes");
    });

    it("should handle empty skills", () => {
      const content = adapter.createAgentContent({
        name: "Unknown",
        kind: "professional",
        url: "https://unknown.io",
        status: "active",
        discoveredAt: "2026-03-31T00:00:00.000Z",
        discoveredVia: "manual",
        about: "",
        skills: [],
        notes: "",
      });

      expect(content).toContain("## Skills");
      // No skill entries but section exists
      expect(content).not.toContain("**");
    });

    it("should handle optional fields being absent", () => {
      const content = adapter.createAgentContent({
        name: "Minimal",
        kind: "professional",
        url: "https://minimal.io",
        status: "active",
        discoveredAt: "2026-03-31T00:00:00.000Z",
        discoveredVia: "manual",
        about: "",
        skills: [],
        notes: "",
      });

      expect(content).toContain("name: Minimal");
      expect(content).toContain("minimal.io");
      expect(content).not.toContain("organization");
      expect(content).not.toContain("brainName");
      expect(content).not.toContain("did");
    });
  });

  describe("parseAgentContent", () => {
    it("should parse all three body sections", () => {
      const content = `---
name: Yeehaa
url: https://yeehaa.io
status: active
discoveredAt: "2026-03-31T00:00:00.000Z"
discoveredVia: manual
---

## About

Founder of Rizom.

## Skills

- Content Creation: Create blog posts [blog, writing]
- Knowledge Search: Search knowledge base [search]

## Notes

Great collaborator.`;

      const parsed = adapter.parseAgentContent(content);
      expect(parsed.about).toContain("Founder of Rizom");
      expect(parsed.skills).toHaveLength(2);
      expect(parsed.skills[0]).toMatchObject({
        name: "Content Creation",
        description: "Create blog posts",
        tags: ["blog", "writing"],
      });
      expect(parsed.skills[1]).toMatchObject({
        name: "Knowledge Search",
        description: "Search knowledge base",
        tags: ["search"],
      });
      expect(parsed.notes).toContain("Great collaborator");
    });

    it("should handle missing sections gracefully", () => {
      const content = `---
name: Minimal
url: https://minimal.io
status: active
discoveredAt: "2026-03-31T00:00:00.000Z"
discoveredVia: manual
---`;

      const parsed = adapter.parseAgentContent(content);
      expect(parsed.about).toBe("");
      expect(parsed.skills).toEqual([]);
      expect(parsed.notes).toBe("");
    });

    it("should handle skills with no tags", () => {
      const content = `---
name: Test
url: https://test.io
status: active
discoveredAt: "2026-03-31T00:00:00.000Z"
discoveredVia: manual
---

## About

Test agent.

## Skills

- Image Generation: Generate images from prompts

## Notes
`;

      const parsed = adapter.parseAgentContent(content);
      expect(parsed.skills).toHaveLength(1);
      expect(parsed.skills[0]).toMatchObject({
        name: "Image Generation",
        description: "Generate images from prompts",
        tags: [],
      });
    });
  });

  describe("extractMetadata", () => {
    it("should return name and status", () => {
      const entity = {
        id: "yeehaa.io",
        entityType: "agent" as const,
        content: adapter.createAgentContent({
          name: "Yeehaa",
          kind: "professional",
          url: "https://yeehaa.io",
          status: "active",
          discoveredAt: "2026-03-31T00:00:00.000Z",
          discoveredVia: "manual",
          about: "",
          skills: [],
          notes: "",
        }),
        contentHash: "abc",
        created: "2026-03-31T00:00:00.000Z",
        updated: "2026-03-31T00:00:00.000Z",
        metadata: {
          name: "Yeehaa",
          url: "https://yeehaa.io",
          status: "active" as const,
          slug: "yeehaa-io",
        },
      };

      const metadata = adapter.extractMetadata(entity);
      expect(metadata.name).toBe("Yeehaa");
      expect(metadata.status).toBe("active");
      expect(metadata.slug).toBe("yeehaa-io");
    });
  });

  describe("fromMarkdown", () => {
    it("should derive slug from name", () => {
      const content = adapter.createAgentContent({
        name: "Yeehaa",
        kind: "professional",
        url: "https://yeehaa.io",
        status: "active",
        discoveredAt: "2026-03-31T00:00:00.000Z",
        discoveredVia: "manual",
        about: "",
        skills: [],
        notes: "",
      });

      const partial = adapter.fromMarkdown(content);
      expect(partial.metadata?.slug).toBe("yeehaa-io");
      expect(partial.metadata?.name).toBe("Yeehaa");
      expect(partial.metadata?.status).toBe("active");
    });
  });

  describe("roundtrip", () => {
    it("should preserve data through create → parse", () => {
      const content = adapter.createAgentContent({
        name: "Ranger",
        kind: "collective",
        organization: "Rizom",
        brainName: "Ranger Brain",
        url: "https://ranger.rizom.ai",
        did: "did:web:ranger.rizom.ai",
        status: "active",
        discoveredAt: "2026-03-31T00:00:00.000Z",
        discoveredVia: "manual",
        about: "Discovery and registry agent for the Rizom network.",
        skills: [
          {
            name: "Agent Discovery",
            description: "Find agents by capability",
            tags: ["discovery", "search"],
          },
        ],
        notes: "Central hub for the network.",
      });

      const parsed = adapter.parseAgentContent(content);
      expect(parsed.about).toContain("Discovery and registry agent");
      expect(parsed.skills).toHaveLength(1);
      expect(parsed.skills[0]).toMatchObject({ name: "Agent Discovery" });
      expect(parsed.notes).toContain("Central hub");
    });
  });
});
