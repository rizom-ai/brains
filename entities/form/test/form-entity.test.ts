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

  it("finds a form whose file states no path, or an empty one, by its title and target alone, and writes no path", async () => {
    const shell = createMockShell();
    for (const plugin of createFormPlugins()) await plugin.register(shell);
    const adapter = shell.getEntityRegistry().getAdapter("form");
    for (const file of [
      markdown.replace("path: /work-with-us\n", ""),
      markdown.replace("path: /work-with-us", "path: ''"),
    ]) {
      const parsed = adapter.fromMarkdown(file);
      expect(parsed.metadata).toEqual({
        title: "Work with us",
        target: "contact-request",
      });
      expect(
        adapter.generateFrontMatter({
          id: "work-with-us",
          entityType: "form",
          content: file,
          contentHash: "",
          created: "",
          updated: "",
          visibility: "public",
          metadata: parsed.metadata ?? {},
        }),
      ).not.toContain("path");
    }
  });
});
