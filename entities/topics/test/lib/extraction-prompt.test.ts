import { describe, it, expect } from "bun:test";
import {
  buildTopicExtractionPrompt,
  listExistingTopicTitles,
} from "../../src/lib/extraction-prompt";
import { createMockEntityService } from "@brains/test-utils";
import { createMockTopicEntity } from "../fixtures/topic-entities";

describe("extraction-prompt", () => {
  it("lists existing topic titles from topic entities", async () => {
    const entityService = createMockEntityService({
      returns: {
        listEntities: [
          createMockTopicEntity({
            id: "human-ai-collaboration",
            content: `---
title: Human-AI Collaboration
keywords:
  - ai
---
Canonical collaboration topic.`,
            metadata: {},
          }),
          createMockTopicEntity({
            id: "fragmentation",
            content: `---
title: Fragmentation
keywords:
  - pluralism
---
Canonical fragmentation topic.`,
            metadata: {},
          }),
        ],
      },
    });

    const titles = await listExistingTopicTitles(entityService);

    expect(titles).toEqual(["Human-AI Collaboration", "Fragmentation"]);
  });

  it("includes canonicalization guidance and existing titles in the prompt", () => {
    const prompt = buildTopicExtractionPrompt({
      entityTitle: "Human-Agent Collaboration",
      entityType: "post",
      content: "Agents and humans coordinate work together.",
      existingTopicTitles: ["Human-AI Collaboration", "Fragmentation"],
    });

    expect(prompt).toContain("CANONICALIZATION RULES");
    expect(prompt).toContain("Human-AI Collaboration");
    expect(prompt).toContain("Fragmentation");
    expect(prompt).toContain("Agents and humans coordinate work together.");
  });
});
