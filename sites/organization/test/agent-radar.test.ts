import { describe, expect, it } from "bun:test";
import type { SemanticSpaceProjection } from "@brains/plugins";
import type { AgentEntity } from "@brains/agent-discovery";
import { loadAgentRadar } from "../src/datasources/agent-radar";

interface AgentInput {
  id: string;
  kind?: "person" | "team" | "organization";
  status?: "approved" | "discovered" | "archived";
  introducedBy?: string[];
  tags?: string[];
}

/** An agent as directory sync imports it: markdown with frontmatter. */
function agent(input: AgentInput): AgentEntity {
  const url = `https://${input.id}.io/a2a`;
  const status = input.status ?? "approved";
  const tags = input.tags ?? [];
  const skills = tags.length
    ? `- shared_work: Work together [${tags.join(", ")}]\n`
    : "";
  const introduced = input.introducedBy
    ? `introducedBy:\n${input.introducedBy.map((id) => `  - ${id}`).join("\n")}\nhops: 2\n`
    : "";
  return {
    id: input.id,
    entityType: "agent",
    content: `---\nname: ${input.id}\nkind: ${input.kind ?? "person"}\nbrainName: ${input.id}\nurl: "${url}"\nstatus: ${status}\ndiscoveredAt: "2026-03-15T10:00:00.000Z"\n${introduced}---\n\n# Agent\n\n## About\n\n${input.id} works with us.\n\n## Skills\n\n${skills}\n## Notes\n\nWorks with the team.\n`,
    metadata: {
      name: input.id,
      url,
      status,
      discoveredAt: "2026-03-15T10:00:00.000Z",
      slug: `${input.id}-io`,
    },
    contentHash: input.id,
    visibility: "public",
    created: "2026-03-15T10:00:00.000Z",
    updated: "2026-03-15T10:00:00.000Z",
  };
}

type Point = SemanticSpaceProjection["points"][number];
type Neighbor = SemanticSpaceProjection["neighbors"][number];
const point = (
  entityId: string,
  coordinates: [number, number],
  distanceToOrigin: number,
): Point => ({ entityId, entityType: "agent", coordinates, distanceToOrigin });
const link = (source: string, target: string, distance: number): Neighbor => ({
  source: { entityId: source, entityType: "agent" },
  target: { entityId: target, entityType: "agent" },
  distance,
});

function source(
  listed: AgentEntity[],
  points: Point[],
  neighbors: Neighbor[] = [],
  requests: unknown[] = [],
): Parameters<typeof loadAgentRadar>[0] {
  return {
    semantic: {
      project: async (request?: unknown): Promise<SemanticSpaceProjection> => {
        requests.push(request);
        return {
          origin: {
            kind: "entity",
            entityId: "brain-character",
            entityType: "brain-character",
          },
          points,
          neighbors,
          distanceRange: { min: 0.2, max: 0.6 },
        };
      },
    },
    entityService: {
      listEntities: async ({ entityType }: { entityType: string }) =>
        entityType === "agent" ? listed : [],
    },
  };
}

const network = [
  agent({ id: "ada" }),
  agent({ id: "partner", kind: "team" }),
  agent({ id: "guild", kind: "organization" }),
  agent({ id: "pending", status: "discovered" }),
  agent({ id: "old", kind: "team", status: "archived" }),
  agent({ id: "sighted", status: "discovered", introducedBy: ["ada"] }),
];
const networkPoints = [
  point("ada", [1, 0], 0.3),
  point("partner", [0, 1], 0.6),
  point("guild", [-1, 0], 0.45),
  point("pending", [0, -1], 0.2),
  point("old", [1, 1], 0.5),
  point("sighted", [-1, -1], 0.35),
];

describe("agent radar data", () => {
  it("shows the agents the team works with and those awaiting review", async () => {
    const radar = await loadAgentRadar(source(network, networkPoints));
    expect(radar?.agents.map((entry) => [entry.id, entry.status])).toEqual([
      ["ada", "approved"],
      ["guild", "approved"],
      ["partner", "approved"],
      ["pending", "discovered"],
    ]);
  });

  it("places each agent where the console map does, around the team at the centre", async () => {
    const radar = await loadAgentRadar(source(network, networkPoints));
    const at = (id: string): { x: number; y: number } | undefined =>
      radar?.agents.find((entry) => entry.id === id);
    // Scaled to the farthest charted agent (0.6), on a disc of radius 44 around (50, 50).
    expect(at("ada")?.x).toBeCloseTo(72);
    expect(at("ada")?.y).toBeCloseTo(50);
    expect(at("partner")?.x).toBeCloseTo(50);
    expect(at("partner")?.y).toBeCloseTo(6);
    expect(at("guild")?.x).toBeCloseTo(17);
  });

  it("links each agent to its page by slug and names its kind", async () => {
    const radar = await loadAgentRadar(source(network, networkPoints));
    expect(radar?.agents.find((entry) => entry.id === "partner")).toMatchObject(
      {
        entityType: "agent",
        content: "",
        metadata: { slug: "partner-io" },
        name: "partner",
        kind: "team",
        constellation: null,
        url: null,
      },
    );
  });

  it("leaves out an agent the public build cannot see", async () => {
    const visible = network.filter((entry) => entry.id !== "ada");
    const radar = await loadAgentRadar(source(visible, networkPoints));
    expect(radar?.agents.map((entry) => entry.id)).not.toContain("ada");
  });

  it("omits the map when no agent is shown", async () => {
    const quiet = [agent({ id: "old", status: "archived" })];
    expect(
      await loadAgentRadar(source(quiet, [point("old", [1, 0], 0.4)])),
    ).toBeNull();
  });

  it("omits the map when the projection is unavailable", async () => {
    const failing: Parameters<typeof loadAgentRadar>[0] = {
      ...source(network, networkPoints),
      semantic: {
        project: async () => {
          throw new Error("embeddings disabled");
        },
      },
    };
    expect(await loadAgentRadar(failing)).toBeNull();
  });
});

describe("constellations", () => {
  const around = (ids: string[]): Point[] =>
    ids.map((id, index) =>
      point(id, [Math.cos(index), Math.sin(index)], 0.3 + (index % 3) * 0.05),
    );
  const load = (
    agents: AgentEntity[],
    neighbors: Neighbor[],
    requests: unknown[] = [],
  ): ReturnType<typeof loadAgentRadar> =>
    loadAgentRadar(
      source(
        agents,
        around(agents.map((entry) => entry.id)),
        neighbors,
        requests,
      ),
    );
  const groupOf = (
    radar: Awaited<ReturnType<typeof loadAgentRadar>>,
    id: string,
  ): string | null | undefined =>
    radar?.agents.find((entry) => entry.id === id)?.constellation;

  it("gathers agents nearest each other into a constellation named by the tag they share", async () => {
    const radar = await load(
      [
        agent({ id: "ada", tags: ["research", "synthesis"] }),
        agent({ id: "partner", kind: "team", tags: ["research"] }),
        agent({ id: "guild", kind: "organization", tags: ["operations"] }),
      ],
      [link("ada", "partner", 0.2), link("partner", "guild", 0.25)],
    );
    expect(radar?.constellations).toHaveLength(1);
    const [constellation] = radar?.constellations ?? [];
    expect(constellation?.name).toBe("research");
    expect(constellation?.memberIds).toEqual(["ada", "guild", "partner"]);
    expect(constellation?.links).toEqual([
      { from: "ada", to: "partner" },
      { from: "guild", to: "partner" },
    ]);
    for (const id of ["ada", "guild", "partner"]) {
      expect(groupOf(radar, id)).toBe("research");
    }
    const members = radar?.agents ?? [];
    const mean = (values: number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(constellation?.x).toBeCloseTo(mean(members.map((m) => m.x)));
    expect(constellation?.y).toBeCloseTo(mean(members.map((m) => m.y)));
  });

  it("joins each agent only to its nearest, so a chain of near pairs stays apart", async () => {
    const radar = await load(
      [
        agent({ id: "a", tags: ["research"] }),
        agent({ id: "b", tags: ["research"] }),
        agent({ id: "c", tags: ["operations"] }),
        agent({ id: "d", tags: ["operations"] }),
      ],
      [link("a", "b", 0.2), link("b", "c", 0.3), link("c", "d", 0.21)],
    );
    expect(radar?.constellations.map((c) => c.name).sort()).toEqual([
      "operations",
      "research",
    ]);
    expect(groupOf(radar, "a")).toBe("research");
    expect(groupOf(radar, "d")).toBe("operations");
  });

  it("asks for neighbours out to 0.35 and joins nothing beyond it", async () => {
    const requests: unknown[] = [];
    const radar = await load(
      [
        agent({ id: "ada", tags: ["research"] }),
        agent({ id: "far", tags: ["research"] }),
      ],
      [link("ada", "far", 0.36)],
      requests,
    );
    expect(requests).toEqual([
      expect.objectContaining({ maxNeighborDistance: 0.35 }),
    ]);
    expect(radar?.constellations).toEqual([]);
  });

  it("does not let an agent the page does not show hold a constellation together", async () => {
    const radar = await load(
      [
        agent({ id: "kees", tags: ["operations"] }),
        agent({ id: "gone", status: "archived", tags: ["operations"] }),
      ],
      [link("kees", "gone", 0.1)],
    );
    expect(radar?.constellations).toEqual([]);
    expect(groupOf(radar, "kees")).toBeNull();
  });

  it("names no constellation where the agents share no tag", async () => {
    const radar = await load(
      [
        agent({ id: "nova", tags: ["design"] }),
        agent({ id: "orbit", tags: ["logistics"] }),
      ],
      [link("nova", "orbit", 0.2)],
    );
    expect(radar?.constellations).toEqual([]);
  });
});
