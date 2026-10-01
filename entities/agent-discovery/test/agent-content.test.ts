import { describe, it, expect } from "bun:test";
import { parseMarkdown } from "@brains/sdk/entities";
import { agent } from "../src/agent-entity";
import {
  createAgentContent,
  parseAgentContent,
} from "../src/lib/agent-content";
import type { AgentEntity, AgentMetadata } from "../src/schemas/agent";

function markdown(): Extract<
  NonNullable<typeof agent.markdown>,
  { decode: unknown }
> {
  const codec = agent.markdown;
  if (!codec?.decode)
    throw new Error("The agent type declares no parsed markdown codec");
  return codec;
}

/** What the runtime derives from a stored file. */
function decode(source: string): {
  content?: string;
  metadata: Partial<AgentMetadata>;
} {
  const { frontmatter, content } = parseMarkdown(source);
  return markdown().decode({ content, frontmatter });
}

/** What the runtime writes back for an entity. */
function encode(entity: AgentEntity): string {
  return markdown().encode({
    content: entity.content,
    metadata: agent.metadata.parse(entity.metadata),
  }).content;
}

describe("agent content", () => {
  it("should have correct entity type", () => {
    expect(agent.type).toBe("agent");
  });

  it("declares approval as the publish gate for publishedOnly builds", () => {
    // Production site builds filter to published entities; for agents,
    // approval is what makes one public-directory content — discovered and
    // archived agents must stay out of static routes.
    expect(agent.config?.publish?.publishStatuses).toEqual(["approved"]);
  });

  describe("createAgentContent", () => {
    it("should build markdown with frontmatter and body sections", () => {
      const content = createAgentContent({
        name: "Yeehaa",
        kind: "person",
        organization: "Rizom",
        brainName: "Yeehaa's Brain",
        url: "https://yeehaa.io",
        did: "did:web:yeehaa.io",
        status: "discovered",
        discoveredAt: "2026-03-31T00:00:00.000Z",
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
      expect(content).toContain("status: discovered");

      // Body sections
      expect(content).toContain("## About");
      expect(content).toContain("Founder of Rizom");
      expect(content).toContain("## Skills");
      expect(content).toContain("Content Creation: Create blog posts");
      expect(content).toContain("[blog, writing]");
      expect(content).toContain("## Notes");
    });

    it("should handle empty skills", () => {
      const content = createAgentContent({
        name: "Unknown",
        kind: "person",
        brainName: "Unknown Brain",
        url: "https://unknown.io",
        status: "discovered",
        discoveredAt: "2026-03-31T00:00:00.000Z",
        about: "",
        skills: [],
        notes: "",
      });

      expect(content).toContain("## Skills");
      // No skill entries but section exists
      expect(content).not.toContain("**");
    });

    it("should persist remote card freshness fields", () => {
      const content = createAgentContent({
        name: "Peer",
        kind: "person",
        brainName: "Peer Brain",
        url: "https://peer.example.com",
        status: "discovered",
        discoveredAt: "2026-03-31T00:00:00.000Z",
        cardUri: "at://did:plc:peer/ai.rizom.brain.card/self",
        cardCid: "bafy-card",
        cardObservedAt: "2026-07-22T08:00:00.000Z",
        cardLastCheckedAt: "2026-07-22T09:00:00.000Z",
        cardLastError: "temporary failure",
        about: "Peer brain.",
        skills: [],
        notes: "Local note.",
      });

      const partial = decode(content);

      expect(content).toContain("cardObservedAt:");
      expect(content).toContain("cardLastCheckedAt:");
      expect(content).toContain("cardLastError: temporary failure");
      expect(partial.metadata.cardObservedAt).toBe("2026-07-22T08:00:00.000Z");
      expect(partial.metadata.cardLastCheckedAt).toBe(
        "2026-07-22T09:00:00.000Z",
      );
      expect(partial.metadata.cardLastError).toBe("temporary failure");
    });

    it("should handle optional fields being absent", () => {
      const content = createAgentContent({
        name: "Minimal",
        kind: "person",
        brainName: "Minimal Brain",
        url: "https://minimal.io",
        status: "discovered",
        discoveredAt: "2026-03-31T00:00:00.000Z",
        about: "",
        skills: [],
        notes: "",
      });

      expect(content).toContain("name: Minimal");
      expect(content).toContain("minimal.io");
      expect(content).not.toContain("organization");
      expect(content).toContain("brainName: Minimal Brain");
      expect(content).not.toContain("did");
    });
  });

  describe("parseAgentContent", () => {
    it("should parse all three body sections", () => {
      const content = `---
name: Yeehaa
brainName: Yeehaa's Brain
url: https://yeehaa.io
status: discovered
discoveredAt: "2026-03-31T00:00:00.000Z"
---

## About

Founder of Rizom.

## Skills

- Content Creation: Create blog posts [blog, writing]
- Knowledge Search: Search knowledge base [search]

## Notes

Great collaborator.`;

      const parsed = parseAgentContent(content);
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
brainName: Minimal Brain
url: https://minimal.io
status: discovered
discoveredAt: "2026-03-31T00:00:00.000Z"
---`;

      const parsed = parseAgentContent(content);
      expect(parsed.about).toBe("");
      expect(parsed.skills).toEqual([]);
      expect(parsed.notes).toBe("");
    });

    const frontmatter = `---
name: Partial
brainName: Partial Brain
url: https://partial.io
status: discovered
discoveredAt: "2026-03-31T00:00:00.000Z"
---`;
    const about = "## About\n\nField researcher.";
    const skills =
      "## Skills\n\n- Field Notes: Keep field notes [research, writing]";
    const notes = "## Notes\n\nMet at the summit.";

    it.each([
      ["Notes", [about, skills]],
      ["About", [skills, notes]],
      ["Skills", [about, notes]],
    ])("keeps the sections it has when %s is missing", (_missing, sections) => {
      const parsed = parseAgentContent([frontmatter, ...sections].join("\n\n"));
      const has = (section: string): boolean => sections.includes(section);

      expect(parsed.about).toBe(has(about) ? "Field researcher." : "");
      expect(parsed.skills).toEqual(
        has(skills)
          ? [
              {
                name: "Field Notes",
                description: "Keep field notes",
                tags: ["research", "writing"],
              },
            ]
          : [],
      );
      expect(parsed.notes).toBe(has(notes) ? "Met at the summit." : "");
    });

    it("should handle skills with no tags", () => {
      const content = `---
name: Test
brainName: Test Brain
url: https://test.io
status: discovered
discoveredAt: "2026-03-31T00:00:00.000Z"
---

## About

Test agent.

## Skills

- Image Generation: Generate images from prompts

## Notes
`;

      const parsed = parseAgentContent(content);
      expect(parsed.skills).toHaveLength(1);
      expect(parsed.skills[0]).toMatchObject({
        name: "Image Generation",
        description: "Generate images from prompts",
        tags: [],
      });
    });
  });

  describe("metadata derivation", () => {
    it("should return name and status", () => {
      const entity: AgentEntity = {
        id: "yeehaa.io",
        entityType: "agent",
        content: createAgentContent({
          name: "Yeehaa",
          kind: "person",
          brainName: "Yeehaa's Brain",
          url: "https://yeehaa.io",
          status: "discovered",
          discoveredAt: "2026-03-31T00:00:00.000Z",
          about: "",
          skills: [],
          notes: "",
        }),
        contentHash: "abc",
        created: "2026-03-31T00:00:00.000Z",
        updated: "2026-03-31T00:00:00.000Z",
        visibility: "public",
        metadata: {
          name: "Yeehaa",
          url: "https://yeehaa.io",
          status: "discovered" as const,
          discoveredAt: "2026-03-31T00:00:00.000Z",
          slug: "yeehaa-io",
        },
      };

      const metadata = decode(entity.content).metadata;
      expect(metadata.name).toBe("Yeehaa");
      expect(metadata.status).toBe("discovered");
      expect(metadata.slug).toBe("yeehaa-io");
    });
  });

  describe("agents saved before the kinds were renamed", () => {
    // Until 22 July 2026 an agent's kind named its brain, not its anchor.
    const saved = (kind: string): string =>
      [
        "---",
        "name: Brain",
        `kind: ${kind}`,
        "brainName: Brain",
        "url: 'https://karim.rizom.ai/a2a'",
        "status: discovered",
        "discoveredAt: '2026-07-15T15:38:08.033Z'",
        "---",
        "# Agent",
        "",
        "## About",
        "Brain is Karim's Knowledge assistant.",
        "",
      ].join("\n");

    it("reads a professional brain as a person, and keeps that in its content", () => {
      const partial = decode(saved("professional"));
      expect(partial.metadata.name).toBe("Brain");
      expect(partial.content).toContain("kind: person\n");
      expect(partial.content).not.toContain("professional");
      expect(partial.content).toContain(
        "Brain is Karim's Knowledge assistant.",
      );
    });

    it("reads a collective as an organization", () => {
      expect(decode(saved("collective")).content).toContain(
        "kind: organization\n",
      );
    });

    it.each([
      "professional # saved kind",
      "'professional' # saved kind",
      '"professional" # saved kind',
    ])(
      "migrates YAML scalar %s without losing authored fields or the body",
      (kind) => {
        const source = saved(kind).replace(
          "status: discovered",
          "custom: keep-me\nstatus: discovered",
        );
        const partial = decode(source);
        expect(partial.content).toContain("kind: person");
        expect(partial.content).toContain("custom: keep-me");
        expect(partial.content).toContain(
          "Brain is Karim's Knowledge assistant.",
        );
        expect(partial.metadata.status).toBe("discovered");
      },
    );

    it("migrates CRLF input", () => {
      expect(
        decode(saved("collective").replaceAll("\n", "\r\n")).content,
      ).toContain("kind: organization");
    });

    it("still refuses a kind it has never known", () => {
      expect(() => decode(saved("guild"))).toThrow();
    });
  });

  describe("decode", () => {
    it("should derive slug from name", () => {
      const content = createAgentContent({
        name: "Yeehaa",
        kind: "person",
        brainName: "Yeehaa's Brain",
        url: "https://yeehaa.io",
        status: "discovered",
        discoveredAt: "2026-03-31T00:00:00.000Z",
        about: "",
        skills: [],
        notes: "",
      });

      const partial = decode(content);
      expect(partial.metadata.slug).toBe("yeehaa-io");
      expect(partial.metadata.name).toBe("Yeehaa");
      expect(partial.metadata.status).toBe("discovered");
    });
  });

  describe("roundtrip", () => {
    it("should preserve data through create → parse", () => {
      const content = createAgentContent({
        name: "Ranger",
        kind: "organization",
        organization: "Rizom",
        brainName: "Ranger Brain",
        url: "https://ranger.rizom.ai",
        did: "did:web:ranger.rizom.ai",
        status: "discovered",
        discoveredAt: "2026-03-31T00:00:00.000Z",
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

      const parsed = parseAgentContent(content);
      expect(parsed.about).toContain("Discovery and registry agent");
      expect(parsed.skills).toHaveLength(1);
      expect(parsed.skills[0]).toMatchObject({ name: "Agent Discovery" });
      expect(parsed.notes).toContain("Central hub");
    });
  });

  describe("encode", () => {
    it("rebuilds frontmatter from metadata so approval stays in sync on disk", () => {
      // Simulate the state after `system_update({ fields: { status: "approved" } })`:
      // DB metadata says approved, but entity.content still carries the stale
      // `status: discovered` frontmatter.
      const staleContent = createAgentContent({
        name: "Phoney",
        kind: "person",
        brainName: "mylittlephoney.com",
        url: "https://mylittlephoney.com/a2a",
        status: "discovered",
        discoveredAt: "2026-04-20T00:00:00.000Z",
        about: "",
        skills: [],
        notes: "",
      });

      const entity: AgentEntity = {
        id: "mylittlephoney.com",
        entityType: "agent",
        content: staleContent,
        contentHash: "hash",
        created: "2026-04-20T00:00:00.000Z",
        updated: "2026-04-22T00:00:00.000Z",
        visibility: "public",
        metadata: {
          name: "Phoney",
          url: "https://mylittlephoney.com/a2a",
          status: "approved" as const,
          discoveredAt: "2026-04-20T00:00:00.000Z",
          slug: "mylittlephoney-com",
        },
      };

      const output = encode(entity);

      expect(output).toContain("status: approved");
      expect(output).not.toContain("status: discovered");
    });

    it("preserves frontmatter fields that live only on disk (not in metadata)", () => {
      const staleContent = createAgentContent({
        name: "Yeehaa",
        kind: "team",
        organization: "Rizom",
        brainName: "Yeehaa's Brain",
        url: "https://yeehaa.io",
        did: "did:web:yeehaa.io",
        status: "discovered",
        discoveredAt: "2026-04-20T00:00:00.000Z",
        about: "Founder of Rizom.",
        skills: [
          {
            name: "Design",
            description: "Design institutions",
            tags: ["design"],
          },
        ],
        notes: "Some note.",
      });

      const entity: AgentEntity = {
        id: "yeehaa-io",
        entityType: "agent",
        content: staleContent,
        contentHash: "hash",
        created: "2026-04-20T00:00:00.000Z",
        updated: "2026-04-22T00:00:00.000Z",
        visibility: "public",
        metadata: {
          name: "Yeehaa",
          url: "https://yeehaa.io",
          status: "approved" as const,
          discoveredAt: "2026-04-20T00:00:00.000Z",
          slug: "yeehaa-io",
        },
      };

      const output = encode(entity);

      // Metadata-tracked fields reflect DB truth
      expect(output).toContain("status: approved");
      // Frontmatter-only fields survive the rebuild
      expect(output).toContain("kind: team");
      expect(output).toContain("organization: Rizom");
      expect(output).toContain("brainName: Yeehaa's Brain");
      expect(output).toContain("did:web:yeehaa.io");
      expect(output).toContain("discoveredAt:");
      // Body sections survive
      expect(output).toContain("## About");
      expect(output).toContain("Founder of Rizom.");
      expect(output).toContain("## Skills");
      expect(output).toContain("Design: Design institutions");
      expect(output).toContain("Some note.");
    });
  });
});
