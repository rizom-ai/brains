import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  parseAgentCard,
  type AnchorProfile,
  type BrainCharacter,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { expectDefined } from "@brains/utils/expect-defined";
import { installA2A } from "./helpers/install";

describe("served Agent Card follows current identity and skills", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness();
  });
  afterEach(async () => {
    await harness.reset();
  });

  test("refuses unresolved presentation and retries once it is available", async () => {
    const a2a = await installA2A(harness, { inbound: true });
    const response = await a2a
      .route("/.well-known/agent-card.json", "GET")
      .handler(new Request("http://brain/.well-known/agent-card.json"));
    expect(response.status).toBe(503);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    harness.getMockShell().getProfileKindRegistry().finalize();
    expect((await a2a.agentCard()).name).toBeTruthy();
  });

  test("serves identity changed after the first request", async () => {
    const a2a = await installA2A(harness, { inbound: true });
    const shell = harness.getMockShell();
    shell.getProfileKindRegistry().finalize();
    const before = expectDefined(parseAgentCard(await a2a.agentCard()));
    expect(before.description).toContain("Test Owner's");

    shell.getProfile = (): AnchorProfile => ({ name: "Taeke" });
    shell.getIdentity = (): BrainCharacter => ({
      name: "Swift Specialist",
      role: "Knowledge organization assistant",
      purpose: "Organize knowledge",
      values: ["clarity"],
    });
    const after = expectDefined(parseAgentCard(await a2a.agentCard()));
    expect(after.brainName).toBe("Swift Specialist");
    expect(after.description).toContain("Taeke's");
    expect(after.anchor?.name).toBe("Taeke");
    expect(before.description).toContain("Test Owner's");
  });

  test("follows skill creation, editing, visibility withdrawal and deletion", async () => {
    const a2a = await installA2A(harness, { inbound: true });
    const shell = harness.getMockShell();
    shell.getProfileKindRegistry().finalize();
    const names = async (): Promise<string[]> =>
      (await a2a.agentCard()).skills.map((skill) => skill.name);
    expect(await names()).not.toContain("Late Skill");
    const entities = shell.getEntityService();
    await entities.createEntity({
      entity: {
        id: "late-skill",
        entityType: "skill",
        content: "",
        visibility: "public",
        metadata: {
          name: "Late Skill",
          description: "Derived after startup",
          tags: [],
          examples: [],
        },
      },
    });
    expect(await names()).toContain("Late Skill");
    const skill = expectDefined(
      await entities.getEntity({ entityType: "skill", id: "late-skill" }),
    );
    await entities.updateEntity({
      entity: {
        ...skill,
        metadata: { ...skill.metadata, name: "Updated Skill" },
      },
    });
    expect(await names()).toContain("Updated Skill");
    expect(await names()).not.toContain("Late Skill");
    const updated = expectDefined(
      await entities.getEntity({ entityType: "skill", id: "late-skill" }),
    );
    await entities.updateEntity({
      entity: { ...updated, visibility: "restricted" },
    });
    expect(await names()).not.toContain("Updated Skill");
    await entities.updateEntity({
      entity: { ...updated, visibility: "public" },
    });
    expect(await names()).toContain("Updated Skill");
    await entities.deleteEntity({ entityType: "skill", id: "late-skill" });
    expect(await names()).not.toContain("Updated Skill");
  });
});
