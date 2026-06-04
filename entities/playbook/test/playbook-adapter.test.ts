import { describe, expect, it } from "bun:test";
import { playbookAdapter } from "../src";

describe("playbookAdapter", () => {
  it("parses playbook markdown into metadata", () => {
    const entity = playbookAdapter.fromMarkdown(`---
title: Rover Onboarding
status: active
audience: anchor
trigger: first-anchor-web-chat
completionMode: agent-confirmed
---

# Rover Onboarding

Teach by doing.
`);

    expect(entity.entityType).toBe("playbook");
    expect(entity.metadata).toEqual({
      title: "Rover Onboarding",
      status: "active",
      audience: "anchor",
      trigger: "first-anchor-web-chat",
      completionMode: "agent-confirmed",
    });
  });
});
