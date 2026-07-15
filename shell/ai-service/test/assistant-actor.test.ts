import { describe, expect, it } from "bun:test";
import {
  buildAssistantActor,
  createBrainAgentId,
} from "../src/assistant-actor";

describe("assistant actor identity", () => {
  it("builds stable brain agent ids from brain names", () => {
    expect(createBrainAgentId("Relay Pilot")).toBe("brain:relay-pilot");
    expect(createBrainAgentId("  Rover_AI!!  ")).toBe("brain:rover-ai");
    expect(createBrainAgentId("---")).toBeUndefined();
  });

  it("builds assistant actor metadata from brain character", () => {
    expect(
      buildAssistantActor({
        agentId: "brain:relay",
        character: {
          name: "Relay",
          role: "Team memory assistant",
          purpose: "Help the team remember decisions",
          values: ["accuracy"],
        },
      }),
    ).toEqual({
      identity: { kind: "agent", agentId: "brain:relay" },
      interfaceType: "agent",
      role: "assistant",
      displayName: "Relay",
      isBot: true,
    });
  });
});
