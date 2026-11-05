import { describe, expect, it } from "bun:test";
import { parseGuideStages } from "../src";

const body = `## Bring your drafts in

In Google Docs, choose **File → Download → Markdown** for each draft.

Upload the files in chat.

Exact steps: [Interface setup](/docs/interface-setup), [Content management](/docs/content-management).

## Publish

A queued post goes out on the schedule you set.

## A week later

The brain has read everything you brought.

- **Answers from your work:** what you wrote on a subject.
- **Drafts from your notes** when you ask.

Exact steps: [Feature overview](/docs/feature-overview).
`;

describe("parseGuideStages", () => {
  const stages = parseGuideStages(body);

  it("makes one stage per ## heading, numbered in order", () => {
    expect(stages.map((stage) => [stage.number, stage.heading])).toEqual([
      [1, "Bring your drafts in"],
      [2, "Publish"],
      [3, "A week later"],
    ]);
  });

  it("gives each stage an anchor id from its heading", () => {
    expect(stages.map((stage) => stage.id)).toEqual([
      "bring-your-drafts-in",
      "publish",
      "a-week-later",
    ]);
  });

  it("extracts the Exact steps links and drops the line from the prose", () => {
    expect(stages[0]?.steps).toEqual([
      { label: "Interface setup", href: "/docs/interface-setup" },
      { label: "Content management", href: "/docs/content-management" },
    ]);
    expect(stages[0]?.prose).toBe(
      "In Google Docs, choose **File → Download → Markdown** for each draft.\n\nUpload the files in chat.",
    );
    expect(stages.map((stage) => stage.prose).join("\n")).not.toContain(
      "Exact steps",
    );
  });

  it("leaves steps empty when a stage has no Exact steps line", () => {
    expect(stages[1]?.steps).toEqual([]);
    expect(stages[1]?.prose).toBe(
      "A queued post goes out on the schedule you set.",
    );
  });

  it("sets a stage's closing bullet list apart as its points", () => {
    expect(stages[2]?.prose).toBe("The brain has read everything you brought.");
    expect(stages[2]?.points).toEqual([
      "**Answers from your work:** what you wrote on a subject.",
      "**Drafts from your notes** when you ask.",
    ]);
    expect(stages[0]?.points).toEqual([]);
  });

  it("keeps a list that prose follows inside the prose", () => {
    const [stage] = parseGuideStages(
      "## Install\n\n- one\n- two\n\nThen run it.\n",
    );
    expect(stage?.points).toEqual([]);
    expect(stage?.prose).toBe("- one\n- two\n\nThen run it.");
  });

  it("ignores ## lines inside fenced code", () => {
    const stages = parseGuideStages(
      "## Configure\n\n```yaml\n## not a stage\nkey: value\n```\n\n## Run\n\nGo.\n",
    );
    expect(stages.map((stage) => stage.heading)).toEqual(["Configure", "Run"]);
    expect(stages[0]?.prose).toContain("## not a stage");
  });

  it("ignores text before the first stage", () => {
    expect(
      parseGuideStages("Intro.\n\n## Only\n\nText.").map((s) => s.heading),
    ).toEqual(["Only"]);
  });

  it("returns no stages for a body without ## headings", () => {
    expect(parseGuideStages("Just text.")).toEqual([]);
  });
});
