import { describe, expect, it } from "bun:test";
import type { Tool, ToolContext } from "@brains/mcp-service";
import type { BaseEntity } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { createSystemTools } from "../../src/system/tools";
import {
  MAX_SEARCH_CONTENT_CHARS,
  matchingSections,
} from "../../src/system/search-excerpt";
import { createMockSystemServices } from "./mock-services";

const resultSchema = z.object({
  entity: z.looseObject({ id: z.string(), content: z.string().optional() }),
  excerpt: z.string(),
  excerpted: z.literal(true).optional(),
});
const searchReplySchema = z.object({
  success: z.literal(true),
  data: z.object({ results: z.array(resultSchema) }),
});

const filler = (topic: string, sentences: number): string =>
  Array.from(
    { length: sentences },
    (_, index) =>
      `Paragraph ${index + 1} about ${topic} goes on at some length so the section is long enough to matter.`,
  ).join("\n\n");

const interfaceDoc = [
  "# Interface Setup",
  "",
  "Interfaces are how users and tools talk to a running brain.",
  "",
  "## Webserver",
  "",
  filler("serving the site", 12),
  "",
  "## MCP",
  "",
  "MCP connects clients to the brain.",
  "",
  "### MCP tool modes",
  "",
  "The basic mode is the default and exposes chat and confirm. Debug mode exposes raw tools for operator inspection.",
  "",
  "```yaml",
  "# not a heading: a comment in a fenced block",
  "mode: debug",
  "```",
  "",
  "## Discord adapter",
  "",
  filler("chat platforms", 12),
  "",
  "## A2A",
  "",
  filler("peer agents", 12),
].join("\n");

function doc(id: string, body: string): BaseEntity {
  return {
    id,
    entityType: "doc",
    content: `---\ntitle: ${id}\n---\n${body}`,
    contentHash: `hash-${id}`,
    visibility: "public",
    metadata: { title: id },
    created: "2026-05-01T00:00:00.000Z",
    updated: "2026-05-01T00:00:00.000Z",
  };
}

const context: ToolContext = {
  interfaceType: "test",
  actor: { kind: "user", userId: "test" },
  userPermissionLevel: "admin",
};

async function search(
  entities: BaseEntity[],
  query: string,
): Promise<z.output<typeof resultSchema>[]> {
  const services = createMockSystemServices();
  services.addEntities(entities);
  const tool: Tool | undefined = createSystemTools(services).find(
    (candidate) => candidate.name === "system_search",
  );
  if (!tool) throw new Error("system_search not found");
  const raw = await tool.handler({ query, scope: { kind: "all" } }, context);
  return searchReplySchema.parse(raw).data.results;
}

describe("system_search on long content", () => {
  it("returns a long entity's sections that match the query, not its whole text", async () => {
    expect(interfaceDoc.length).toBeGreaterThan(MAX_SEARCH_CONTENT_CHARS);

    const [result] = await search(
      [doc("interface-setup", interfaceDoc)],
      "What MCP tool modes does a brain support?",
    );

    expect(result?.entity.content).toBeUndefined();
    expect(result?.excerpted).toBe(true);
    expect(result?.excerpt).toContain("### MCP tool modes");
    expect(result?.excerpt).toContain("Debug mode exposes raw tools");
    expect(result?.excerpt).toContain("mode: debug");
    expect(result?.excerpt).not.toContain("about peer agents");
    expect(result?.excerpt.length).toBeLessThanOrEqual(
      MAX_SEARCH_CONTENT_CHARS,
    );
  });

  it("keeps a short entity's whole content", async () => {
    const body = "# Short\n\nA short doc about MCP tool modes.";
    const [result] = await search([doc("short", body)], "MCP tool modes");

    expect(result?.entity.content).toBe(`---\ntitle: short\n---\n${body}`);
    expect(result?.excerpted).toBeUndefined();
  });
});

describe("matchingSections", () => {
  it("keeps the sections in document order, marking the gaps between them", () => {
    const body = [
      "## Alpha modes",
      "",
      "Alpha text.",
      "",
      "## Beta",
      "",
      filler("nothing relevant", 40),
      "",
      "## Gamma modes",
      "",
      "Gamma text.",
    ].join("\n");

    expect(matchingSections(body, "modes", 200)).toBe(
      "## Alpha modes\n\nAlpha text.\n\n…\n\n## Gamma modes\n\nGamma text.",
    );
  });

  it("does not split at a heading-like line inside a fenced block", () => {
    const body = [
      "## Setup modes",
      "",
      "```bash",
      "# set the key in .env",
      "```",
      "",
      "## Other",
      "",
      filler("unrelated", 40),
    ].join("\n");

    expect(matchingSections(body, "setup modes", 200)).toBe(
      "## Setup modes\n\n```bash\n# set the key in .env\n```",
    );
  });

  it("starts from the beginning when no section matches", () => {
    const body = `${filler("one thing", 30)}\n\n## Next\n\n${filler("another", 30)}`;
    const excerpt = matchingSections(body, "zebra", 300);

    expect(excerpt.startsWith("Paragraph 1 about one thing")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(300);
  });

  it("cuts a matching section longer than the bound", () => {
    const body = `## Modes\n\n${filler("modes", 60)}`;
    const excerpt = matchingSections(body, "modes", 500);

    expect(excerpt.startsWith("## Modes")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(500);
    expect(excerpt.endsWith("…")).toBe(true);
  });
});
