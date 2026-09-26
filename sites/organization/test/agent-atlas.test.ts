import { describe, expect, it } from "bun:test";
import type { SemanticSpaceProjection } from "@brains/plugins";
import type { AgentEntity } from "@brains/agent-discovery";
import { loadAgentAtlas } from "../src/datasources/agent-atlas";

interface AgentInput {
  id: string;
  name: string;
  kind: "person" | "team" | "organization";
  status: "approved" | "discovered" | "archived";
  introducedBy?: string[];
}

/** An agent as directory sync imports it: markdown with frontmatter. */
function agent(input: AgentInput): AgentEntity {
  const url = `https://${input.id}.io/a2a`;
  const introduced = input.introducedBy
    ? `introducedBy:\n${input.introducedBy.map((id) => `  - ${id}`).join("\n")}\nhops: 2\n`
    : "";
  return {
    id: input.id,
    entityType: "agent",
    content: `---\nname: ${input.name}\nkind: ${input.kind}\nbrainName: ${input.name}\nurl: "${url}"\nstatus: ${input.status}\ndiscoveredAt: "2026-03-15T10:00:00.000Z"\n${introduced}---\n\n# Agent\n\n## About\n\n${input.name} works with us.\n\n## Skills\n\n- research: Research together [research]\n`,
    metadata: {
      name: input.name,
      url,
      status: input.status,
      discoveredAt: "2026-03-15T10:00:00.000Z",
      slug: `${input.id}-io`,
    },
    contentHash: input.id,
    visibility: "public",
    created: "2026-03-15T10:00:00.000Z",
    updated: "2026-03-15T10:00:00.000Z",
  };
}

const agents = [
  agent({ id: "ada", name: "Ada", kind: "person", status: "approved" }),
  agent({ id: "partner", name: "Partner", kind: "team", status: "approved" }),
  agent({
    id: "guild",
    name: "Guild",
    kind: "organization",
    status: "approved",
  }),
  agent({
    id: "pending",
    name: "Pending",
    kind: "person",
    status: "discovered",
  }),
  agent({ id: "old", name: "Old", kind: "team", status: "archived" }),
  agent({
    id: "sighted",
    name: "Sighted",
    kind: "person",
    status: "discovered",
    introducedBy: ["ada"],
  }),
];

function point(
  entityId: string,
  coordinates: [number, number],
  distanceToOrigin: number,
): SemanticSpaceProjection["points"][number] {
  return { entityId, entityType: "agent", coordinates, distanceToOrigin };
}

const projection: SemanticSpaceProjection = {
  origin: {
    kind: "entity",
    entityId: "brain-character",
    entityType: "brain-character",
  },
  points: [
    point("ada", [1, 0], 0.3),
    point("partner", [0, 1], 0.6),
    point("guild", [-1, 0], 0.45),
    point("pending", [0, -1], 0.2),
    point("old", [1, 1], 0.5),
    point("sighted", [-1, -1], 0.35),
  ],
  neighbors: [],
  distanceRange: { min: 0.2, max: 0.6 },
};

function source(
  listed: AgentEntity[] = agents,
  project = async (): Promise<SemanticSpaceProjection> => projection,
): Parameters<typeof loadAgentAtlas>[0] {
  return {
    semantic: { project },
    entityService: {
      listEntities: async ({ entityType }: { entityType: string }) =>
        entityType === "agent" ? listed : [],
    },
  };
}

const centre = { name: "Rizom", url: null };

describe("agent atlas data", () => {
  it("places only the agents the organization has approved", async () => {
    const atlas = await loadAgentAtlas(source(), centre);
    expect(atlas?.items.map((item) => item.id)).toEqual([
      "ada",
      "guild",
      "partner",
    ]);
  });

  it("links each agent by its slug and draws it by its kind", async () => {
    const atlas = await loadAgentAtlas(source(), centre);
    const ada = atlas?.items.find((item) => item.id === "ada");
    expect(ada).toMatchObject({
      entityType: "agent",
      metadata: { slug: "ada-io" },
      title: "Ada",
      glyph: "dot",
      kindLabel: "Person",
      year: null,
      zoneId: null,
    });
    expect(atlas?.items.find((item) => item.id === "partner")).toMatchObject({
      glyph: "diamond",
      kindLabel: "Team",
    });
    expect(atlas?.items.find((item) => item.id === "guild")).toMatchObject({
      glyph: "square",
      kindLabel: "Organization",
    });
  });

  it("places each agent where the console map does, around the organization at the centre", async () => {
    const atlas = await loadAgentAtlas(source(), centre);
    const at = (id: string): { x: number; y: number } | undefined =>
      atlas?.items.find((item) => item.id === id);
    // Scaled to the farthest charted agent (0.6): east, half way out.
    expect(at("ada")?.x).toBeCloseTo(0.75);
    expect(at("ada")?.y).toBeCloseTo(0.5);
    // North, on the outer ring.
    expect(at("partner")?.x).toBeCloseTo(0.5);
    expect(at("partner")?.y).toBeCloseTo(0);
    // West, three quarters out.
    expect(at("guild")?.x).toBeCloseTo(0.125);
    expect(at("guild")?.y).toBeCloseTo(0.5);
    expect(atlas?.centre).toEqual(centre);
  });

  it("leaves out an approved agent the public build cannot see", async () => {
    // Ada is projected, but the build's scoped entity service does not list the agent.
    const visible = agents.filter((entry) => entry.id !== "ada");
    const atlas = await loadAgentAtlas(source(visible), centre);
    expect(atlas?.items.map((item) => item.id)).toEqual(["guild", "partner"]);
  });

  it("omits the map when no approved agent is charted", async () => {
    const unapproved = agents.filter(
      (entry) => !["ada", "partner", "guild"].includes(entry.id),
    );
    expect(await loadAgentAtlas(source(unapproved), centre)).toBeNull();
  });

  it("omits the map when the projection is unavailable", async () => {
    const failing = source(agents, async () => {
      throw new Error("embeddings disabled");
    });
    expect(await loadAgentAtlas(failing, centre)).toBeNull();
  });
});
