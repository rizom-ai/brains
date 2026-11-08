import { describe, expect, it } from "bun:test";
import { turnContextSchema, type TurnContext } from "../src/schemas/test-case";

describe("turn context actors", () => {
  it("accepts an actor with an ActorRef identity", () => {
    const actor: NonNullable<TurnContext["actor"]> = {
      identity: { kind: "external", externalActorId: "eval-alice" },
      interfaceType: "evaluation",
      role: "user",
      displayName: "Alice",
    };
    expect(turnContextSchema.parse({ actor }).actor).toEqual(actor);
  });

  it("refuses an actor given as a bare actor id", () => {
    expect(
      turnContextSchema.safeParse({
        actor: {
          actorId: "eval-alice",
          canonicalId: "eval-alice",
          interfaceType: "evaluation",
          role: "user",
        },
      }).success,
    ).toBe(false);
  });
});
