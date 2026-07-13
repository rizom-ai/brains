import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { CanonicalIdentityService } from "../src/canonical-identity-service";

const logger = createSilentLogger("canonical-identity-service-test");

describe("CanonicalIdentityService", () => {
  it("starts without git-backed identity links", async () => {
    const service = CanonicalIdentityService.createFresh(logger);

    await service.refreshCache();

    expect(service.getLinks()).toEqual([]);
    expect(service.resolveActor("discord:123")).toBeNull();
  });

  it("leaves unlinked user actors unchanged", async () => {
    const service = CanonicalIdentityService.createFresh(logger);
    const actor = {
      actorId: "discord:123",
      interfaceType: "discord",
      role: "user" as const,
      displayName: "Mira",
    };

    expect(await service.enrichActor(actor)).toEqual(actor);
  });

  it("enriches actors through an injected private identity resolver", async () => {
    const service = CanonicalIdentityService.createFresh(
      logger,
      async (actorId) =>
        actorId === "discord:123"
          ? {
              userId: "usr_mira",
              canonicalId: "user:mira",
              displayName: "Mira",
            }
          : null,
    );
    const actor = {
      actorId: "discord:123",
      interfaceType: "discord",
      role: "user" as const,
      displayName: "Mira on Discord",
    };

    expect(await service.enrichActor(actor)).toEqual({
      ...actor,
      userId: "usr_mira",
      canonicalId: "user:mira",
      displayName: "Mira",
    });
  });
});
