import { describe, expect, it } from "bun:test";
import { createTestEntity } from "@brains/test-utils";
import { CanonicalIdentityLinkAdapter } from "../src/canonical-identity-link-adapter";
import type { CanonicalIdentityLinkEntity } from "../src/canonical-identity-link-schema";

describe("CanonicalIdentityLinkAdapter", () => {
  it("validates canonical identity link entities", () => {
    const adapter = new CanonicalIdentityLinkAdapter();
    const entity = createTestEntity<CanonicalIdentityLinkEntity>(
      "canonical-identity-link",
      {
        id: "person-daniel",
        content: adapter.createLinkContent({
          canonicalId: "person:daniel",
          displayName: "Daniel",
          actors: [
            {
              actorId: "discord:123",
              interfaceType: "discord",
              displayName: "Daniel",
            },
          ],
        }),
      },
    );

    expect(() => adapter.schema.parse(entity)).not.toThrow();
  });

  it("rejects invalid canonical id formats", () => {
    const adapter = new CanonicalIdentityLinkAdapter();

    expect(() =>
      adapter.createLinkContent({
        canonicalId: "daniel",
        actors: [{ actorId: "discord:123", interfaceType: "discord" }],
      }),
    ).toThrow();
  });

  it("rejects duplicate actor ids inside one link", () => {
    const adapter = new CanonicalIdentityLinkAdapter();

    expect(() =>
      adapter.createLinkContent({
        canonicalId: "person:daniel",
        actors: [
          { actorId: "discord:123", interfaceType: "discord" },
          { actorId: "discord:123", interfaceType: "discord" },
        ],
      }),
    ).toThrow();
  });

  it("round-trips markdown through frontmatter", () => {
    const adapter = new CanonicalIdentityLinkAdapter();
    const content = adapter.createLinkContent({
      canonicalId: "person:daniel",
      displayName: "Daniel",
      actors: [
        {
          actorId: "discord:123",
          interfaceType: "discord",
          displayName: "Daniel D.",
        },
        {
          actorId: "mcp:daniel",
          interfaceType: "mcp",
          displayName: "Daniel",
        },
      ],
    });

    const parsed = adapter.parseLinkBody(content);

    expect(parsed).toEqual({
      canonicalId: "person:daniel",
      displayName: "Daniel",
      actors: [
        {
          actorId: "discord:123",
          interfaceType: "discord",
          displayName: "Daniel D.",
        },
        {
          actorId: "mcp:daniel",
          interfaceType: "mcp",
          displayName: "Daniel",
        },
      ],
    });
  });
});
