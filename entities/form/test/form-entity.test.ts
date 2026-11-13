import { describe, expect, it } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import { createFormPlugins } from "./form-plugins";

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
  it("keeps what its target and pages are found by as metadata, and reads the whole form", async () => {
    const shell = createMockShell();
    for (const plugin of createFormPlugins()) await plugin.register(shell);
    const parsed = shell
      .getEntityRegistry()
      .getAdapter("form")
      .fromMarkdown(markdown);
    expect(parsed.metadata).toEqual({
      title: "Work with us",
      target: "contact-request",
      path: "/work-with-us",
    });
    expect(parsed.content).toBe(markdown);
  });
});
