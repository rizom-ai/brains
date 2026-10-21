import { describe, expect, it } from "bun:test";
import type { BaseEntity } from "@brains/entity-service";
import { entityDisplayTitle } from "../../src";

const entity = (metadata: Record<string, unknown>): BaseEntity => ({
  id: "brain-character",
  entityType: "brain-character",
  content: "---\nname: Profound Specialist\n---\n",
  contentHash: "hash",
  created: "2026-10-21T00:00:00.000Z",
  updated: "2026-10-21T00:00:00.000Z",
  visibility: "public",
  metadata,
});

describe("entityDisplayTitle", () => {
  it("names an entry from what its adapter reads now, before stored metadata", () => {
    const adapters = {
      getAdapter: (): {
        extractMetadata: () => Record<string, unknown>;
      } => ({
        extractMetadata: (): Record<string, unknown> => ({
          name: "Profound Specialist",
        }),
      }),
    };
    expect(entityDisplayTitle(adapters, entity({ role: "Writer" }))).toBe(
      "Profound Specialist",
    );
  });

  it("falls back to stored metadata, then to nothing", () => {
    const none = { getAdapter: (): undefined => undefined };
    expect(entityDisplayTitle(none, entity({ title: "Stored" }))).toBe(
      "Stored",
    );
    expect(entityDisplayTitle(none, entity({}))).toBeUndefined();
  });
});

it("prefers an adapter's own title, such as a body heading", () => {
  const adapters = {
    getAdapter: (): {
      extractMetadata: () => Record<string, unknown>;
      displayTitle: () => string;
    } => ({
      extractMetadata: (): Record<string, unknown> => ({ name: "Metadata" }),
      displayTitle: (): string => "Heading",
    }),
  };
  expect(entityDisplayTitle(adapters, entity({}))).toBe("Heading");
});
