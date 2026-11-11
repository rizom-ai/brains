import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, rmSync, existsSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseBrainYaml } from "../src/lib/brain-yaml";

describe("parseBrainYaml AI model field", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "brain-yaml-provider-test-"));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should parse model field from brain.yaml", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: brain\nbundleContract: capability-bundles-v1\nbundles: [core]\nmodel: gpt-4o-mini\n",
    );
    const config = parseBrainYaml(testDir);
    expect(config.model).toBe("gpt-4o-mini");
  });

  it("rejects unversioned canonical bundle selections", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: brain\nbundles: [core]\n",
    );
    expect(() => parseBrainYaml(testDir)).toThrow(
      /bundleContract "capability-bundles-v1"/,
    );
  });

  it("should have no model when not specified", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: brain\nbundleContract: capability-bundles-v1\nbundles: [core]\n",
    );
    const config = parseBrainYaml(testDir);
    expect(config.model).toBeUndefined();
  });

  it("should parse model with explicit prefix", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: brain\nbundleContract: capability-bundles-v1\nbundles: [core]\nmodel: anthropic:claude-haiku-4-5-20251001\n",
    );
    const config = parseBrainYaml(testDir);
    expect(config.model).toBe("anthropic:claude-haiku-4-5-20251001");
  });

  it("should parse quoted brain name", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      'brain: "brain"\nbundleContract: capability-bundles-v1\nbundles: [core]\n',
    );
    const config = parseBrainYaml(testDir);
    expect(config.brain).toBe("brain");
    expect(config.bundles).toEqual(["core"]);
  });

  // The CLI validates with the same schema the runtime boots with, so a
  // file the CLI accepts cannot fail at boot (and vice versa).
  it("rejects a file the runtime would reject at boot", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: rover\npreset: everything\n",
    );
    expect(() => parseBrainYaml(testDir)).toThrow(/config migrate/);
  });

  it("accepts the full runtime override surface", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      [
        "brain: brain",
        "bundleContract: capability-bundles-v1",
        "bundles:",
        "  - core",
        "domain: example.com",
        "add:",
        "  - docs",
        "remove:",
        "  - chat",
        "permissions:",
        "  rules:",
        '    - pattern: "slack:*"',
        "      level: public",
        "plugins:",
        "  directory-sync:",
        "    autoSync: true",
        "",
      ].join("\n"),
    );
    const config = parseBrainYaml(testDir);
    expect(config.domain).toBe("example.com");
    expect(config.add).toEqual(["docs"]);
    expect(config.permissions?.rules?.[0]?.level).toBe("public");
  });

  it("should handle comments in yaml", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: brain # canonical definition\nbundleContract: capability-bundles-v1\nbundles: [core]\n# model: gpt-4o-mini\n",
    );
    const config = parseBrainYaml(testDir);
    expect(config.brain).toBe("brain");
    expect(config.bundles).toEqual(["core"]);
    expect(config.model).toBeUndefined();
  });

  it("should reject removed external plugin declarations", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      `brain: brain
bundleContract: capability-bundles-v1
bundles: [core]
plugins:
  calendar:
    package: "@rizom/brain-plugin-calendar"
`,
    );
    expect(() => parseBrainYaml(testDir)).toThrow(
      "removed alpha external-plugin contract",
    );
  });

  it("should reject list-form plugins", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      `brain: brain
bundleContract: capability-bundles-v1
bundles: [core]
plugins:
  - package: "@rizom/brain-plugin-calendar"
`,
    );
    expect(() => parseBrainYaml(testDir)).toThrow("Invalid brain.yaml");
  });

  it("should require explicit bundles for an empty canonical config", () => {
    writeFileSync(join(testDir, "brain.yaml"), "");
    expect(() => parseBrainYaml(testDir)).toThrow("Invalid brain.yaml");
  });

  it("should default an omitted brain field when bundles are explicit", () => {
    writeFileSync(
      join(testDir, "brain.yaml"),
      "bundleContract: capability-bundles-v1\nbundles: [core]\nmodel: gpt-4o-mini\n",
    );
    expect(parseBrainYaml(testDir)).toMatchObject({
      brain: "brain",
      bundles: ["core"],
      model: "gpt-4o-mini",
    });
  });
});
