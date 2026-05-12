import { describe, expect, it } from "bun:test";
import {
  createMockEntityService,
  createSilentLogger,
  createTestEntity,
} from "@brains/test-utils";
import { CanonicalIdentityLinkAdapter } from "../src/canonical-identity-link-adapter";
import { CanonicalIdentityService } from "../src/canonical-identity-service";
import type { CanonicalIdentityLinkEntity } from "../src/canonical-identity-link-schema";

const adapter = new CanonicalIdentityLinkAdapter();

function linkEntity(params: {
  canonicalId: string;
  displayName?: string;
  actors: Array<{
    actorId: string;
    interfaceType: string;
    displayName?: string;
  }>;
}): CanonicalIdentityLinkEntity {
  return createTestEntity<CanonicalIdentityLinkEntity>(
    "canonical-identity-link",
    {
      id: params.canonicalId.replace(":", "-"),
      content: adapter.createLinkContent(params),
    },
  );
}

describe("CanonicalIdentityService", () => {
  it("resolves an actor id to an explicit canonical identity", async () => {
    const entityService = createMockEntityService({
      returns: {
        listEntities: [
          linkEntity({
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
          }),
        ],
      },
    });
    const service = CanonicalIdentityService.createFresh(
      entityService,
      createSilentLogger(),
    );

    await service.refreshCache();

    expect(service.resolveActor("discord:123")).toEqual({
      canonicalId: "person:daniel",
      displayName: "Daniel",
      matchedActor: {
        actorId: "discord:123",
        interfaceType: "discord",
        displayName: "Daniel D.",
      },
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

  it("returns null for unknown actors", async () => {
    const entityService = createMockEntityService({
      returns: { listEntities: [] },
    });
    const service = CanonicalIdentityService.createFresh(
      entityService,
      createSilentLogger(),
    );

    await service.refreshCache();

    expect(service.resolveActor("discord:unknown")).toBeNull();
  });

  it("rejects writes whose actor id is already claimed by another link", async () => {
    const existing = linkEntity({
      canonicalId: "person:daniel",
      actors: [{ actorId: "discord:123", interfaceType: "discord" }],
    });
    const entityService = createMockEntityService({
      returns: { listEntities: [existing] },
    });
    const service = CanonicalIdentityService.createFresh(
      entityService,
      createSilentLogger(),
    );

    const incoming = linkEntity({
      canonicalId: "person:other-daniel",
      actors: [{ actorId: "discord:123", interfaceType: "discord" }],
    });

    expect(
      service.validateLink(incoming, { operation: "create" }),
    ).rejects.toThrow(
      /actorId discord:123 is already claimed by person:daniel/,
    );
  });

  it("permits updates that keep the same actor ids on the same link", async () => {
    const existing = linkEntity({
      canonicalId: "person:daniel",
      actors: [{ actorId: "discord:123", interfaceType: "discord" }],
    });
    const entityService = createMockEntityService({
      returns: { listEntities: [existing] },
    });
    const service = CanonicalIdentityService.createFresh(
      entityService,
      createSilentLogger(),
    );

    expect(
      service.validateLink(existing, { operation: "update" }),
    ).resolves.toBeUndefined();
  });
});
