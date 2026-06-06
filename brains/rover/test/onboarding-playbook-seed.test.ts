import { readFile } from "node:fs/promises";
import { describe, expect, it } from "bun:test";
import { playbookAdapter } from "@brains/playbook";

describe("Rover onboarding playbook seed", () => {
  it("declares the identity gate as a Done When condition", async () => {
    const seedMarkdown = await readFile(
      new URL("../seed-content/playbook/rover-onboarding.md", import.meta.url),
      "utf8",
    );
    const { body } = playbookAdapter.parsePlaybookContent(seedMarkdown);
    const identity = body.states.find((state) => state.id === "identity");

    expect(identity?.doneWhen).toEqual([
      "The anchor profile has been created or updated.",
    ]);
  });
});
