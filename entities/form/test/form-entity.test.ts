import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { FormEntityPlugin, formAdapter } from "../src";

const markdown = `---
target: contact-request
path: /work-with-us
title: Work with us
steps:
  - fields:
      - kind: text
        id: name
        label: Name
        required: true
      - kind: email
        id: email
        label: Email
        required: true
---
Tell us what you have in mind.
`;

describe("forms in the brain's content", () => {
  it("keeps what its target and pages are found by as metadata", () => {
    expect(formAdapter.fromMarkdown(markdown)).toMatchObject({
      entityType: "form",
      content: markdown,
      metadata: {
        title: "Work with us",
        target: "contact-request",
        path: "/work-with-us",
      },
    });
  });

  it("registers a type the model never reads, and refuses a form the engine would not run", async () => {
    const harness = createPluginHarness();
    const registry = harness.getEntityRegistry();
    type Validator = Parameters<typeof registry.registerPersistValidator>[1];
    let validator: Validator | undefined;
    registry.registerPersistValidator = (type, candidate): void => {
      if (type === "form") validator = candidate;
    };
    const capabilities = await harness.installPlugin(new FormEntityPlugin());
    expect(registry.getEntityTypeConfig("form")).toMatchObject({
      embeddable: false,
      fullTextSearchable: false,
      projectionSource: false,
    });
    expect(capabilities.tools).toEqual([]);
    if (!validator) throw new Error("Missing persist validator");
    const entity = {
      id: "work-with-us",
      entityType: "form",
      visibility: "public" as const,
      content: markdown,
      contentHash: "x",
      created: "2026-11-07T10:00:00.000Z",
      updated: "2026-11-07T10:00:00.000Z",
      metadata: {},
    };
    expect(await validator(entity, { operation: "create" })).toBeUndefined();
    expect(
      validator(
        {
          ...entity,
          content: markdown.replace("kind: text", "kind: date"),
        },
        { operation: "create" },
      ),
    ).rejects.toThrow("Invalid form");
    expect(
      validator({ ...entity, id: "Work With Us" }, { operation: "create" }),
    ).rejects.toThrow("Invalid form");
  });
});
