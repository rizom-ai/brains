import { readFile } from "node:fs/promises";
import { describe, expect, it } from "bun:test";
import { playbookAdapter } from "@brains/playbook";

describe("Rover onboarding playbook seed", () => {
  it("requires the identity state to update the anchor profile before NEXT", async () => {
    const seedMarkdown = await readFile(
      new URL("../seed-content/playbook/rover-onboarding.md", import.meta.url),
      "utf8",
    );
    const { body } = playbookAdapter.parsePlaybookContent(seedMarkdown);
    const identity = body.states.find((state) => state.id === "identity");
    const anchorProfile = identity?.expectedEntities.find(
      (entity) => entity.entityType === "anchor-profile",
    );

    expect(anchorProfile).toEqual({
      entityType: "anchor-profile",
      purpose: "operator identity and positioning",
      required: true,
    });
  });
});
