import { describe, expect, it } from "bun:test";
import { getAgentDiscoveryInstructions } from "../src/lib/agent-instructions";

describe("getAgentDiscoveryInstructions", () => {
  it("describes agent directory domain semantics as typed tool contracts", () => {
    const instructions = getAgentDiscoveryInstructions();

    expect(instructions).toContain("saved peer-brain contacts");
    expect(instructions).toContain("local agent directory");
    expect(instructions).toContain("discovered and approved");
    expect(instructions).not.toContain("discovered, approved, and archived");
    expect(instructions.toLowerCase()).not.toContain("archived");
    expect(instructions).toContain("agent_connect");
    expect(instructions).toContain("url source");
    expect(instructions).toContain(
      "cannot verify or contact an unsaved domain",
    );
    expect(instructions).toContain("please add");
    expect(instructions).toContain("system_update field changes");
    expect(instructions).toContain("call system_update on entityType agent");
    expect(instructions).toContain(
      "List saved agent contacts with system_list on entityType agent",
    );
    expect(instructions).toContain(
      "expertise-match or recommendation questions over the user's agent network",
    );
    expect(instructions).toContain("who to consult/ask about a topic");
    expect(instructions).toContain("immediately call one system_search");
    expect(instructions).toContain("do not run parallel synonym searches");
    expect(instructions).toContain("scope.entityType agent");
    expect(instructions).toContain(
      "Do not answer with generic role categories",
    );
    expect(instructions).toContain(
      "Prefer approved contacts over discovered contacts",
    );
    expect(instructions).toContain("exact callable id/domain");
    expect(instructions).toContain("agent id brand-studio.example");
    expect(instructions).toContain(
      "pass agent_call.agent as the saved agent entity id/domain",
    );
    expect(instructions).toContain(
      "not the display name, anchorName, or brainName",
    );
    expect(instructions).toContain("Ask my contact Yeehaa");
    expect(instructions).toContain(
      "first resolve that name against saved agent entities",
    );
    expect(instructions).toContain(
      "Only approved saved agents are active call targets",
    );
    expect(instructions).toContain("short affirmative follow-ups");
    expect(instructions).toContain("do not use agent_connect for approval");
    expect(instructions).toContain(
      "Calling remote agents and saving local contact records are separate capabilities.",
    );
    expect(instructions).toContain(
      "When the user asks to contact/call/ask a saved contact",
    );
  });
});
