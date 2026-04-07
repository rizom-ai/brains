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

    it("should create package.json", () => {
      scaffold(testDir, { model: "rover" });
      expect(existsSync(join(testDir, "package.json"))).toBe(true);
    });

    it("should create README.md", () => {
      scaffold(testDir, { model: "rover" });
      expect(existsSync(join(testDir, "README.md"))).toBe(true);
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

    it("should NOT create .env when no apiKey provided", () => {
      scaffold(testDir, { model: "rover" });
      expect(existsSync(join(testDir, ".env"))).toBe(false);
    });
  });

  describe("package.json", () => {
    it("should pin @rizom/brain to a version", () => {
      scaffold(testDir, { model: "rover" });
      const pkg = JSON.parse(
        readFileSync(join(testDir, "package.json"), "utf-8"),
      );
      expect(pkg.dependencies["@rizom/brain"]).toMatch(/^[\^~]?\d+\.\d+\.\d+/);
    });

    it("should depend on preact for JSX runtime", () => {
      scaffold(testDir, { model: "rover" });
      const pkg = JSON.parse(
        readFileSync(join(testDir, "package.json"), "utf-8"),
      );
      expect(pkg.dependencies.preact).toBeDefined();
    });

    it("should set private: true", () => {
      scaffold(testDir, { model: "rover" });
      const pkg = JSON.parse(
        readFileSync(join(testDir, "package.json"), "utf-8"),
      );
      expect(pkg.private).toBe(true);
    });

    it("should set type: module", () => {
      scaffold(testDir, { model: "rover" });
      const pkg = JSON.parse(
        readFileSync(join(testDir, "package.json"), "utf-8"),
      );
      expect(pkg.type).toBe("module");
    });

    it("should derive name from the directory basename", () => {
      const childDir = join(testDir, "my-cool-brain");
      mkdirSync(childDir, { recursive: true });
      scaffold(childDir, { model: "rover" });
      const pkg = JSON.parse(
        readFileSync(join(childDir, "package.json"), "utf-8"),
      );
      expect(pkg.name).toBe("my-cool-brain");
    });
  });

  describe("README.md", () => {
    it("should reference the bunx brain start command", () => {
      scaffold(testDir, { model: "rover" });
      const readme = readFileSync(join(testDir, "README.md"), "utf-8");
      expect(readme).toContain("bunx brain start");
    });

    it("should reference @rizom/brain", () => {
      scaffold(testDir, { model: "rover" });
      const readme = readFileSync(join(testDir, "README.md"), "utf-8");
      expect(readme).toContain("@rizom/brain");
    });
  });

  describe(".env file (when apiKey provided)", () => {
    it("should create .env with AI_API_KEY when apiKey is provided", () => {
      scaffold(testDir, { model: "rover", apiKey: "sk-test-12345" });

      const envPath = join(testDir, ".env");
      expect(existsSync(envPath)).toBe(true);
      const env = readFileSync(envPath, "utf-8");
      expect(env).toContain("AI_API_KEY=sk-test-12345");
    });

    it("should include GIT_SYNC_TOKEN placeholder when contentRepo is set", () => {
      scaffold(testDir, {
        model: "rover",
        apiKey: "sk-test-12345",
        contentRepo: "user/brain-data",
      });

      const env = readFileSync(join(testDir, ".env"), "utf-8");
      expect(env).toContain("AI_API_KEY=sk-test-12345");
      expect(env).toContain("GIT_SYNC_TOKEN=");
    });

    it("should NOT include GIT_SYNC_TOKEN when contentRepo is absent", () => {
      scaffold(testDir, { model: "rover", apiKey: "sk-test-12345" });

      const env = readFileSync(join(testDir, ".env"), "utf-8");
      expect(env).not.toContain("GIT_SYNC_TOKEN");
    });

    it("should still create .env.example as a template", () => {
      scaffold(testDir, { model: "rover", apiKey: "sk-test-12345" });
      expect(existsSync(join(testDir, ".env.example"))).toBe(true);
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

    it("should preserve .env.example as a tracked template", () => {
      scaffold(testDir, { model: "rover" });
      const gitignore = readFileSync(join(testDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain("!.env.example");
    });

    it("should exclude runtime artifacts (brain.log, brain-data, cache, data, dist)", () => {
      scaffold(testDir, { model: "rover" });
      const gitignore = readFileSync(join(testDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain("brain.log");
      expect(gitignore).toContain("brain-data/");
      expect(gitignore).toContain("cache/");
      expect(gitignore).toContain("data/");
      expect(gitignore).toContain("dist/");
    });
  });
});
