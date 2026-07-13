import { SightingAdapter } from "../../src/adapters/sighting-adapter";
import type { SightingEntity } from "../../src/schemas/sighting";

const adapter = new SightingAdapter();

export const DEFAULT_SIGHTED_AT = "2026-07-13T00:00:00.000Z";

export interface TestSightingInput {
  id?: string;
  name?: string;
  url?: string;
  kind?: "professional" | "team" | "collective";
  tags?: string[];
  introducedBy?: string[];
  hops?: number;
  sightedAt?: string;
  about?: string;
}

export function createTestSighting(
  input: TestSightingInput = {},
): SightingEntity {
  const name = input.name ?? "Vale";
  const url = input.url ?? `https://${name.toLowerCase()}.example`;
  const introducedBy = input.introducedBy ?? ["kai.brain"];
  const hops = input.hops ?? 2;
  const sightedAt = input.sightedAt ?? DEFAULT_SIGHTED_AT;

  return {
    id: input.id ?? name.toLowerCase(),
    entityType: "agent-sighting",
    content: adapter.createSightingContent(
      {
        name,
        url,
        kind: input.kind ?? "professional",
        tags: input.tags ?? ["research"],
        introducedBy,
        hops,
        sightedAt,
      },
      input.about ?? `${name} was sighted through a peer's directory.`,
    ),
    metadata: { name, url, introducedBy, hops },
    contentHash: "abc123",
    visibility: "public",
    created: sightedAt,
    updated: sightedAt,
  };
}
