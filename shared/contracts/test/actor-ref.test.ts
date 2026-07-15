import { describe, expect, it } from "bun:test";
import {
  actorRefFromLegacy,
  actorRefKey,
  actorRefSchema,
  createExternalActorId,
} from "../src/actor-ref";
import { authPrincipalResolveRequestSchema } from "../src/auth-principal";

describe("ActorRef", () => {
  it("accepts explicit user, external, agent, and service identities", () => {
    expect(
      actorRefSchema.parse({
        kind: "user",
        userId: "usr_mira",
        canonicalId: "user:mira",
      }),
    ).toEqual({
      kind: "user",
      userId: "usr_mira",
      canonicalId: "user:mira",
    });
    expect(
      actorRefSchema.parse({ kind: "external", externalActorId: "ext_abc" }),
    ).toEqual({ kind: "external", externalActorId: "ext_abc" });
    expect(
      actorRefSchema.parse({ kind: "agent", agentId: "brain:relay" }),
    ).toEqual({ kind: "agent", agentId: "brain:relay" });
    expect(
      actorRefSchema.parse({ kind: "service", serviceId: "job-queue" }),
    ).toEqual({ kind: "service", serviceId: "job-queue" });
  });

  it("derives one unambiguous stable key for every actor kind", () => {
    expect(actorRefKey({ kind: "user", userId: "usr_mira" })).toBe(
      "user:usr_mira",
    );
    expect(actorRefKey({ kind: "external", externalActorId: "ext_abc" })).toBe(
      "external:ext_abc",
    );
    expect(actorRefKey({ kind: "agent", agentId: "brain:relay" })).toBe(
      "agent:brain:relay",
    );
    expect(actorRefKey({ kind: "service", serviceId: "job-queue" })).toBe(
      "service:job-queue",
    );
  });

  it("normalizes legacy identities at compatibility boundaries", () => {
    expect(
      actorRefFromLegacy({
        actorId: "discord:123",
        userId: "usr_mira",
        canonicalId: "user:mira",
        interfaceType: "discord",
        role: "user",
      }),
    ).toEqual({
      kind: "user",
      userId: "usr_mira",
      canonicalId: "user:mira",
    });
    expect(
      actorRefFromLegacy({
        actorId: "mcp:mira",
        canonicalId: "person:mira",
        interfaceType: "mcp",
        role: "user",
      }),
    ).toEqual({
      kind: "external",
      externalActorId: createExternalActorId("canonical", "person:mira"),
    });
    expect(
      actorRefFromLegacy({
        actorId: "brain:relay",
        interfaceType: "agent",
        role: "assistant",
      }),
    ).toEqual({ kind: "agent", agentId: "brain:relay" });
    expect(
      actorRefFromLegacy({
        actorId: "discord:123",
        interfaceType: "discord",
        role: "user",
      }),
    ).toEqual({
      kind: "external",
      externalActorId: createExternalActorId("discord", "discord:123"),
    });
  });

  it("uses ActorRef for auth principal resolution requests", () => {
    expect(
      authPrincipalResolveRequestSchema.parse({
        actor: { kind: "external", externalActorId: "ext_abc" },
      }),
    ).toEqual({
      actor: { kind: "external", externalActorId: "ext_abc" },
    });
    expect(
      authPrincipalResolveRequestSchema.safeParse({ actorId: "discord:123" })
        .success,
    ).toBe(false);
  });

  it("creates stable source-scoped external ids without retaining raw subjects", () => {
    const first = createExternalActorId("discord", "123456789");
    const same = createExternalActorId("discord", "123456789");
    const otherSource = createExternalActorId("matrix", "123456789");

    expect(first).toBe(same);
    expect(first).toStartWith("ext_");
    expect(first).not.toContain("123456789");
    expect(otherSource).not.toBe(first);
  });
});
