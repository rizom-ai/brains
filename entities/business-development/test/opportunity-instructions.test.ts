import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { BusinessDevelopmentPlugin } from "../src";

describe("BusinessDevelopmentPlugin instructions", () => {
  async function getInstructions(): Promise<string> {
    const harness = createPluginHarness<BusinessDevelopmentPlugin>({
      dataDir: "/tmp/test-business-development-instructions",
    });
    const capabilities = await harness.installPlugin(
      new BusinessDevelopmentPlugin(),
    );
    return capabilities.instructions ?? "";
  }

  it("tells the agent to create opportunities with structured fields, not frontmatter or a prompt stub", async () => {
    const instructions = await getInstructions();

    expect(instructions).toContain('entityType: "opportunity"');
    expect(instructions).toContain("structured fields");
    expect(instructions).toContain("content");
    expect(instructions).toContain("Do not hand-write YAML frontmatter");
    expect(instructions).toContain("do not use prompt");
  });

  it("documents the four 0-5 scoring dimensions", async () => {
    const instructions = await getInstructions();

    expect(instructions).toContain("incomePotential");
    expect(instructions).toContain("organizationalBuild");
    expect(instructions).toContain("brainsDevelopment");
    expect(instructions).toContain("integrity");
    expect(instructions).toContain("0-5");
  });

  it("documents the integrity hard gate and active/staged/warm state rule", async () => {
    const instructions = await getInstructions();

    expect(instructions).toContain("integrity 0");
    expect(instructions).toContain("MUST NEVER use state active");
    expect(instructions).toContain("active");
    expect(instructions).toContain("staged");
    expect(instructions).toContain("warm");
  });

  it("tells the agent to clarify thin opportunity requests instead of fabricating scores", async () => {
    const instructions = await getInstructions();

    expect(instructions).toContain("ask a brief clarification");
    expect(instructions).toContain("instead of fabricating scores");
  });

  it("does not tell the opportunity plugin to own heartbeat scheduling", async () => {
    const instructions = await getInstructions();

    expect(instructions).not.toContain("daemon");
    expect(instructions).not.toContain("schedule");
  });
});
