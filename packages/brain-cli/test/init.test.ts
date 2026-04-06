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
      expect(yaml).toContain("brain: rover");
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

    it("should default to preset: core", () => {
      scaffold(testDir, { model: "rover" });

      const yaml = readFileSync(join(testDir, "brain.yaml"), "utf-8");
      expect(yaml).toContain("preset: core");
    });

    it("should comment out git block when no contentRepo is provided", () => {
      scaffold(testDir, { model: "rover" });

      const yaml = readFileSync(join(testDir, "brain.yaml"), "utf-8");
      // The git block should be present as a comment so users can
      // uncomment to enable, but should not be active config.
      expect(yaml).toContain("# Uncomment to enable git");
      expect(yaml).toMatch(/^\s*#\s*directory-sync:/m);
      // No active (uncommented) git block
      expect(yaml).not.toMatch(/^\s*directory-sync:\s*$/m);
    });

    it("should activate git block when contentRepo is provided", () => {
      scaffold(testDir, {
        model: "rover",
        contentRepo: "github:user/brain-data",
      });

      const yaml = readFileSync(join(testDir, "brain.yaml"), "utf-8");
      expect(yaml).toMatch(/^\s*directory-sync:\s*$/m);
      expect(yaml).toContain("repo: user/brain-data");
    });
  });

  describe("minimal scaffold (default)", () => {
    it("should create brain.yaml", () => {
      scaffold(testDir, { model: "rover" });
      expect(existsSync(join(testDir, "brain.yaml"))).toBe(true);
    });

    it("should NOT create package.json", () => {
      scaffold(testDir, { model: "rover" });
      expect(existsSync(join(testDir, "package.json"))).toBe(false);
    });

    it("should create .env.example", () => {
      scaffold(testDir, { model: "rover" });
      expect(existsSync(join(testDir, ".env.example"))).toBe(true);
    });

    it("should create .gitignore", () => {
      scaffold(testDir, { model: "rover" });
      expect(existsSync(join(testDir, ".gitignore"))).toBe(true);
    });

    it("should create tsconfig.json with Preact JSX config", () => {
      scaffold(testDir, { model: "rover" });
      const path = join(testDir, "tsconfig.json");
      expect(existsSync(path)).toBe(true);
      const content = JSON.parse(readFileSync(path, "utf-8"));
      expect(content.compilerOptions.jsx).toBe("react-jsx");
      expect(content.compilerOptions.jsxImportSource).toBe("preact");
    });

    it("should NOT create deploy files by default", () => {
      scaffold(testDir, { model: "rover" });
      expect(existsSync(join(testDir, "deploy.yml"))).toBe(false);
      expect(existsSync(join(testDir, ".kamal"))).toBe(false);
      expect(existsSync(join(testDir, ".github"))).toBe(false);
    });
  });

  describe("deploy scaffold (--deploy flag)", () => {
    it("should create deploy.yml when deploy is true", () => {
      scaffold(testDir, { model: "rover", deploy: true });

      const deploy = readFileSync(join(testDir, "deploy.yml"), "utf-8");
      expect(deploy).toContain("BRAIN_MODEL");
      expect(deploy).toContain("BRAIN_DOMAIN");
    });

    it("should create pre-deploy hook when deploy is true", () => {
      scaffold(testDir, { model: "rover", deploy: true });

      const hook = readFileSync(
        join(testDir, ".kamal", "hooks", "pre-deploy"),
        "utf-8",
      );
      expect(hook).toContain("brain.yaml");
      expect(hook).toContain("scp");
    });

    it("should create deploy workflow when deploy is true", () => {
      scaffold(testDir, { model: "rover", deploy: true });

      const workflow = readFileSync(
        join(testDir, ".github", "workflows", "deploy.yml"),
        "utf-8",
      );
      expect(workflow).toContain("kamal deploy");
    });

    it("should produce same deploy.yml regardless of model", () => {
      const dir1 = join(testDir, "a");
      const dir2 = join(testDir, "b");
      mkdirSync(dir1, { recursive: true });
      mkdirSync(dir2, { recursive: true });

      scaffold(dir1, { model: "rover", deploy: true });
      scaffold(dir2, {
        model: "ranger",
        domain: "custom.example.com",
        deploy: true,
      });

      const deploy1 = readFileSync(join(dir1, "deploy.yml"), "utf-8");
      const deploy2 = readFileSync(join(dir2, "deploy.yml"), "utf-8");
      expect(deploy1).toBe(deploy2);
    });
  });

  describe(".gitignore", () => {
    it("should exclude .env and node_modules", () => {
      scaffold(testDir, { model: "rover" });

      const gitignore = readFileSync(join(testDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain(".env");
      expect(gitignore).toContain("node_modules");
    });
  });
});
