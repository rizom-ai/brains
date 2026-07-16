import { describe, expect, it } from "bun:test";
import { actorRefKey, createExternalActorId } from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import { CanonicalIdentityService } from "../src/canonical-identity-service";

const logger = createSilentLogger("canonical-identity-service-test");

describe("CanonicalIdentityService", () => {
  it("starts without git-backed identity links", async () => {
    const service = CanonicalIdentityService.createFresh(logger);

    await service.refreshCache();

    expect(service.getLinks()).toEqual([]);
    expect(
      service.resolveActor({
        kind: "external",
        externalActorId: createExternalActorId("discord", "123"),
      }),
    ).toBeNull();
  });

  it("leaves unlinked user actors unchanged", async () => {
    const service = CanonicalIdentityService.createFresh(logger);
    const actor = {
      identity: {
        kind: "external" as const,
        externalActorId: createExternalActorId("discord", "123"),
      },
      interfaceType: "discord",
      role: "user" as const,
      displayName: "Mira",
    };

    expect(await service.enrichActor(actor)).toEqual(actor);
  });

  it("caches positive and negative private identity resolutions", async () => {
    let calls = 0;
    const service = CanonicalIdentityService.createFresh(
      logger,
      async (identity) => {
        calls += 1;
        return actorRefKey(identity) === "external:linked"
          ? { userId: "usr_mira", canonicalId: "user:mira" }
          : null;
      },
    );
    const linked = {
      identity: { kind: "external" as const, externalActorId: "linked" },
      interfaceType: "mcp",
      role: "user" as const,
    };
    const unlinked = {
      identity: { kind: "external" as const, externalActorId: "unlinked" },
      interfaceType: "mcp",
      role: "user" as const,
    };

    await service.enrichActor(linked);
    await service.enrichActor(linked);
    await service.enrichActor(unlinked);
    await service.enrichActor(unlinked);

    expect(calls).toBe(2);
    expect(service.resolveActor(linked.identity)).toMatchObject({
      userId: "usr_mira",
      canonicalId: "user:mira",
    });
  });

  it("enriches actors through an injected private identity resolver", async () => {
    const service = CanonicalIdentityService.createFresh(
      logger,
      async (identity) =>
        actorRefKey(identity) ===
        `external:${createExternalActorId("discord", "123")}`
          ? {
              userId: "usr_mira",
              canonicalId: "user:mira",
              displayName: "Mira",
            }
          : null,
    );
    const actor = {
      identity: {
        kind: "external" as const,
        externalActorId: createExternalActorId("discord", "123"),
      },
      interfaceType: "discord",
      role: "user" as const,
      displayName: "Mira on Discord",
    };

    expect(await service.enrichActor(actor)).toEqual({
      ...actor,
      identity: {
        kind: "user",
        userId: "usr_mira",
        canonicalId: "user:mira",
      },
      displayName: "Mira",
    });
  });
});
