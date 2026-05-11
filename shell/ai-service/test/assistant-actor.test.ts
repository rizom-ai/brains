import { describe, expect, it } from "bun:test";
import {
  buildAssistantActor,
  createBrainActorId,
} from "../src/assistant-actor";

describe("assistant actor identity", () => {
  it("builds stable brain actor ids from brain names", () => {
    expect(createBrainActorId("Relay Pilot")).toBe("brain:relay-pilot");
    expect(createBrainActorId("  Rover_AI!!  ")).toBe("brain:rover-ai");
    expect(createBrainActorId("---")).toBeUndefined();
  });

  it("builds assistant actor metadata from brain character", () => {
    expect(
      buildAssistantActor({
        actorId: "brain:relay",
        character: {
          name: "Relay",
          role: "Team memory assistant",
          purpose: "Help the team remember decisions",
          values: ["accuracy"],
        },
      }),
    ).toEqual({
      actorId: "brain:relay",
      interfaceType: "agent",
      role: "assistant",
      displayName: "Relay",
      isBot: true,
    });
  });
});
