import { describe, expect, it } from "bun:test";

import { buildAgentFromCard } from "../src/lib/build-agent-content";

describe("buildAgentFromCard", () => {
  const card = {
    brainName: "My Little Phoney",
    url: "https://mylittlephoney.com/a2a",
    description: "Friendly test agent.",
    skills: [
      {
        id: "chat",
        name: "Chat",
        description: "Talks with users",
        tags: ["conversation"],
      },
    ],
    anchor: {
      name: "My Little Phoney",
      kind: "professional" as const,
      description: "A trusted contact.",
    },
  };

  it("can mark explicitly saved agents as approved", () => {
    const result = buildAgentFromCard(card, { status: "approved" });

    expect(result.metadata.status).toBe("approved");
    expect(result.content).toContain("status: approved");
  });
});
