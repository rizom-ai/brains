import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { scaffold } from "../src/commands/init";

describe("brain init", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-init-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("brain.yaml", () => {
    it("should create brain.yaml with model and domain", () => {
      scaffold(testDir, { model: "rover", domain: "mybrain.rizom.ai" });

      const yaml = readFileSync(join(testDir, "brain.yaml"), "utf-8");
      expect(yaml).toContain('brain: "@brains/rover"');
      expect(yaml).toContain("domain: mybrain.rizom.ai");
    });

    it("should default domain to {model}.rizom.ai", () => {
      scaffold(testDir, { model: "rover" });

      const yaml = readFileSync(join(testDir, "brain.yaml"), "utf-8");
      expect(yaml).toContain("domain: rover.rizom.ai");
    });

    it("should include content repo when provided", () => {
      scaffold(testDir, {
        model: "rover",
        contentRepo: "github:user/mybrain-data",
      });

      const yaml = readFileSync(join(testDir, "brain.yaml"), "utf-8");
      expect(yaml).toContain("user/mybrain-data");
    });
  });

  describe("deploy.yml (static Kamal template)", () => {
    it("should create deploy.yml with ERB for model", () => {
      scaffold(testDir, { model: "rover" });

      const deploy = readFileSync(join(testDir, "deploy.yml"), "utf-8");
      expect(deploy).toContain("BRAIN_MODEL");
      expect(deploy).toContain("BRAIN_DOMAIN");
    });

    it("should be the same regardless of model", () => {
      const dir1 = join(testDir, "a");
      const dir2 = join(testDir, "b");
      mkdirSync(dir1, { recursive: true });
      mkdirSync(dir2, { recursive: true });

      scaffold(dir1, { model: "rover" });
      scaffold(dir2, { model: "ranger", domain: "custom.example.com" });

      const deploy1 = readFileSync(join(dir1, "deploy.yml"), "utf-8");
      const deploy2 = readFileSync(join(dir2, "deploy.yml"), "utf-8");
      expect(deploy1).toBe(deploy2);
    });
  });

  describe("supporting files", () => {
    it("should create .env.example with required secrets", () => {
      scaffold(testDir, { model: "rover" });

      const env = readFileSync(join(testDir, ".env.example"), "utf-8");
      expect(env).toContain("ANTHROPIC_API_KEY");
      expect(env).toContain("SERVER_IP");
    });

    it("should create pre-deploy hook that uploads brain.yaml", () => {
      scaffold(testDir, { model: "rover" });

      const hook = readFileSync(
        join(testDir, ".kamal", "hooks", "pre-deploy"),
        "utf-8",
      );
      expect(hook).toContain("brain.yaml");
      expect(hook).toContain("scp");
    });

    it("should make pre-deploy hook executable", () => {
      scaffold(testDir, { model: "rover" });

      const hookPath = join(testDir, ".kamal", "hooks", "pre-deploy");
      expect(existsSync(hookPath)).toBe(true);
    });

    it("should create deploy workflow that runs kamal deploy", () => {
      scaffold(testDir, { model: "rover" });

      const workflow = readFileSync(
        join(testDir, ".github", "workflows", "deploy.yml"),
        "utf-8",
      );
      expect(workflow).toContain("kamal deploy");
    });

    it("should create .gitignore excluding .env", () => {
      scaffold(testDir, { model: "rover" });

      const gitignore = readFileSync(join(testDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain(".env");
    });
  });
});
