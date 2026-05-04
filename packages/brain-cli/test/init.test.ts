import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { scaffold } from "../src/commands/init";
import { buildInstanceEnvSchema } from "../src/lib/env-schema";

const legacyEnvExample = `# Required
AI_API_KEY=

# Optional: separate key for image generation (defaults to AI_API_KEY)
# AI_IMAGE_KEY=

GIT_SYNC_TOKEN=

# Optional
MCP_AUTH_TOKEN=
DISCORD_BOT_TOKEN=

# Deploy (only needed with --deploy)
KAMAL_REGISTRY_PASSWORD=
SERVER_IP=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=
`;

const legacyStandaloneDeployYml = `service: brain
image: <%= ENV['IMAGE_REPOSITORY'] %>

servers:
  web:
    hosts:
      - <%= ENV['SERVER_IP'] %>

proxy:
  ssl:
    certificate_pem: CERTIFICATE_PEM
    private_key_pem: PRIVATE_KEY_PEM
  hosts:
    - <%= ENV['BRAIN_DOMAIN'] %>
    - preview.<%= ENV['BRAIN_DOMAIN'] %>
  app_port: 80
  healthcheck:
    path: /health

registry:
  server: ghcr.io
  username: <%= ENV['REGISTRY_USERNAME'] %>
  password:
    - KAMAL_REGISTRY_PASSWORD

builder:
  arch: amd64

env:
  clear:
    NODE_ENV: production
  secret:
    - AI_API_KEY
    - GIT_SYNC_TOKEN
    - MCP_AUTH_TOKEN
    - DISCORD_BOT_TOKEN

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml
`;

const staleStandaloneDeployYml = `service: brain
image: <%= ENV['IMAGE_REPOSITORY'] %>

servers:
  web:
    hosts:
      - <%= ENV['SERVER_IP'] %>

proxy:
  ssl:
    certificate_pem: CERTIFICATE_PEM
    private_key_pem: PRIVATE_KEY_PEM
  hosts:
    - <%= ENV['BRAIN_DOMAIN'] %>
    - <%= ENV['PREVIEW_DOMAIN'] %>
  app_port: 8080
  healthcheck:
    path: /health

registry:
  server: ghcr.io
  username: <%= ENV['REGISTRY_USERNAME'] %>
  password:
    - KAMAL_REGISTRY_PASSWORD

builder:
  arch: amd64

env:
  clear:
    NODE_ENV: production
  secret:
    - AI_API_KEY
    - GIT_SYNC_TOKEN
    - MCP_AUTH_TOKEN
    - DISCORD_BOT_TOKEN

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml
`;

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

    it("should not scaffold dormant site refs for rover core", () => {
      scaffold(testDir, { model: "rover" });

      const yaml = readFileSync(join(testDir, "brain.yaml"), "utf-8");
      expect(yaml).not.toMatch(/^site:/m);
      expect(yaml).not.toContain("@brains/site-default");
      expect(yaml).not.toContain("@brains/theme-default");
    });

    it("should not scaffold dormant site refs for ranger", () => {
      scaffold(testDir, { model: "ranger" });

      const yaml = readFileSync(join(testDir, "brain.yaml"), "utf-8");
      expect(yaml).not.toMatch(/^site:/m);
      expect(yaml).not.toContain("@brains/site-");
      expect(yaml).not.toContain("@brains/theme-");
    });

    it("should not scaffold dormant site refs for relay", () => {
      scaffold(testDir, { model: "relay" });

      const yaml = readFileSync(join(testDir, "brain.yaml"), "utf-8");
      expect(yaml).not.toMatch(/^site:/m);
      expect(yaml).not.toContain("@brains/site-");
      expect(yaml).not.toContain("@brains/theme-");
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

    it("should not mention local site/theme files in rover README", () => {
      scaffold(testDir, { model: "rover" });

      const readme = readFileSync(join(testDir, "README.md"), "utf-8");
      expect(readme).not.toContain("`src/site.ts`");
      expect(readme).not.toContain("`src/theme.css`");
    });

    it("should create .env.example", () => {
      scaffold(testDir, { model: "rover" });
      expect(existsSync(join(testDir, ".env.example"))).toBe(true);
      const envExample = readFileSync(join(testDir, ".env.example"), "utf-8");
      expect(envExample).toContain("CERTIFICATE_PEM=");
      expect(envExample).toContain("PRIVATE_KEY_PEM=");
      expect(envExample).toContain("HCLOUD_SSH_KEY_NAME=");
      expect(envExample).toContain("HCLOUD_SERVER_TYPE=");
      expect(envExample).toContain("HCLOUD_LOCATION=");
      expect(envExample).toContain("KAMAL_SSH_PRIVATE_KEY=");
      expect(envExample).not.toContain("SERVER_IP=");
    });

    it("should create .env.schema with no-plugin default (env-vars only)", () => {
      // Default is --backend none: no @plugin directive, no bootstrap
      // section. varlock load resolves every value from process.env, which
      // in CI comes from GitHub Actions secrets. Operators who want a
      // varlock plugin pass --backend <name> explicitly.
      scaffold(testDir, { model: "rover" });
      expect(existsSync(join(testDir, ".env.schema"))).toBe(true);
      const envSchema = readFileSync(join(testDir, ".env.schema"), "utf-8");
      expect(envSchema).not.toContain("@plugin(");
      expect(envSchema).not.toContain("@initOp");
      expect(envSchema).not.toContain("@setValuesBulk");
      expect(envSchema).not.toContain("OP_TOKEN=");
      expect(envSchema).not.toContain("secret backend bootstrap");
      expect(envSchema).toContain("HCLOUD_TOKEN=");
      expect(envSchema).toContain("HCLOUD_SERVER_TYPE=");
      expect(envSchema).toContain("HCLOUD_LOCATION=");
      expect(envSchema).toContain("CERTIFICATE_PEM=");
      expect(envSchema).not.toContain("BRAIN_MODEL=");
      expect(envSchema).not.toContain("BRAIN_DOMAIN=");
    });

    it("should generate built-in .env.schema content without workspace model resolution", () => {
      const envSchema = buildInstanceEnvSchema("rover", "demo");

      expect(envSchema).toContain("AI_API_KEY=");
      expect(envSchema).toContain("GIT_SYNC_TOKEN=");
      expect(envSchema).toContain("HCLOUD_TOKEN=");
    });

    it("should fall through for an arbitrary --backend value", () => {
      scaffold(testDir, { model: "rover", backend: "doppler" });

      const envSchema = readFileSync(join(testDir, ".env.schema"), "utf-8");
      expect(envSchema).toContain("@plugin(@varlock/doppler-plugin)");
      expect(envSchema).not.toContain("@initOp(token=$OP_TOKEN)");
      expect(envSchema).not.toContain("OP_TOKEN=");
    });

    it("should create .gitignore", () => {
      scaffold(testDir, { model: "rover" });
      expect(existsSync(join(testDir, ".gitignore"))).toBe(true);
    });

    it("should create tsconfig.json extending the public instance preset", () => {
      scaffold(testDir, { model: "rover" });
      const path = join(testDir, "tsconfig.json");
      expect(existsSync(path)).toBe(true);
      const content = JSON.parse(readFileSync(path, "utf-8"));
      expect(content.extends).toBe("@rizom/brain/tsconfig.instance.json");
      expect(content.compilerOptions.jsx).toBe("react-jsx");
      expect(content.compilerOptions.jsxImportSource).toBe("preact");
    });

    it("should not create local site/theme scaffold for rover core", () => {
      scaffold(testDir, { model: "rover" });

      expect(existsSync(join(testDir, "src", "site.ts"))).toBe(false);
      expect(existsSync(join(testDir, "src", "theme.css"))).toBe(false);
    });

    it("should create src/site.ts and src/theme.css for ranger", () => {
      scaffold(testDir, { model: "ranger" });

      const siteSource = readFileSync(join(testDir, "src", "site.ts"), "utf-8");
      expect(siteSource).toContain('from "@rizom/brain/site"');
      expect(siteSource).toContain("professionalSitePlugin");
      expect(siteSource).toContain("ProfessionalLayout");
      expect(siteSource).toContain("professionalRoutes");
      expect(siteSource).toContain("export default site");

      const themeSource = readFileSync(
        join(testDir, "src", "theme.css"),
        "utf-8",
      );
      expect(themeSource).toContain("Palette tokens");
      expect(themeSource).toContain("Semantic tokens");
      expect(themeSource).toContain("@theme inline");
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
      expect(existsSync(join(testDir, "config", "deploy.yml"))).toBe(false);
      expect(existsSync(join(testDir, ".kamal"))).toBe(false);
      expect(existsSync(join(testDir, ".github"))).toBe(false);
    });
  });

  describe("reconcile existing instance scaffolds", () => {
    it("should create missing base artifacts when brain.yaml already exists", () => {
      writeFileSync(
        join(testDir, "brain.yaml"),
        [
          "brain: ranger",
          "domain: rizom.ai",
          "preset: default",
          "plugins:",
          "  mcp:",
          "    authToken: ${MCP_AUTH_TOKEN}",
          "",
        ].join("\n"),
      );

      scaffold(testDir, { model: "rover" });

      expect(existsSync(join(testDir, "README.md"))).toBe(true);
      expect(existsSync(join(testDir, ".env.example"))).toBe(true);
      expect(existsSync(join(testDir, ".env.schema"))).toBe(true);
      expect(existsSync(join(testDir, ".gitignore"))).toBe(true);
      expect(existsSync(join(testDir, "tsconfig.json"))).toBe(true);
      expect(existsSync(join(testDir, "package.json"))).toBe(true);

      const yaml = readFileSync(join(testDir, "brain.yaml"), "utf-8");
      expect(yaml).toContain("brain: ranger");
      expect(yaml).toContain("domain: rizom.ai");
      expect(yaml).not.toContain("brain: rover");
    });

    it("should not overwrite existing generated artifacts by default", () => {
      writeFileSync(
        join(testDir, "brain.yaml"),
        ["brain: ranger", "domain: rizom.ai", ""].join("\n"),
      );
      writeFileSync(join(testDir, "README.md"), "CUSTOM README\n");

      scaffold(testDir, { model: "rover" });

      const readme = readFileSync(join(testDir, "README.md"), "utf-8");
      expect(readme).toBe("CUSTOM README\n");
    });

    it("should create missing deploy artifacts for an existing instance when --deploy is used", () => {
      writeFileSync(
        join(testDir, "brain.yaml"),
        ["brain: ranger", "domain: rizom.ai", ""].join("\n"),
      );

      scaffold(testDir, { model: "rover", deploy: true });

      expect(existsSync(join(testDir, "config", "deploy.yml"))).toBe(true);
      expect(existsSync(join(testDir, ".kamal", "hooks", "pre-deploy"))).toBe(
        true,
      );
      expect(
        existsSync(join(testDir, ".github", "workflows", "deploy.yml")),
      ).toBe(true);
      expect(
        existsSync(join(testDir, ".github", "workflows", "publish-image.yml")),
      ).toBe(true);
      expect(existsSync(join(testDir, "deploy", "Dockerfile"))).toBe(true);
    });

    it("should derive generated artifact content from existing brain.yaml", () => {
      writeFileSync(
        join(testDir, "brain.yaml"),
        ["brain: ranger", "domain: rizom.ai", ""].join("\n"),
      );

      scaffold(testDir, { model: "rover" });

      const readme = readFileSync(join(testDir, "README.md"), "utf-8");
      expect(readme).toContain("This brain runs the **ranger** model");
      expect(readme).not.toContain("This brain runs the **rover** model");
    });

    it("should update known stale generated deploy artifacts when --deploy is used", () => {
      writeFileSync(
        join(testDir, "brain.yaml"),
        ["brain: rover", "domain: mylittlephoney.com", ""].join("\n"),
      );
      writeFileSync(join(testDir, ".env.example"), legacyEnvExample);
      mkdirSync(join(testDir, "config"), { recursive: true });
      writeFileSync(
        join(testDir, "config", "deploy.yml"),
        legacyStandaloneDeployYml,
      );

      scaffold(testDir, { model: "rover", deploy: true });

      const envExample = readFileSync(join(testDir, ".env.example"), "utf-8");
      expect(envExample).toContain("HCLOUD_SSH_KEY_NAME=");
      expect(envExample).not.toContain("SERVER_IP=");
      expect(envExample).not.toContain("CLOUDFLARE_API_TOKEN=");

      const deploy = readFileSync(
        join(testDir, "config", "deploy.yml"),
        "utf-8",
      );
      expect(deploy).toContain("IMAGE_REPOSITORY");
      expect(deploy).toContain("REGISTRY_USERNAME");
      expect(deploy).toContain("/opt/brain-state:/data");
      expect(deploy).toContain("/opt/brain-config:/config");
      expect(deploy).toContain("/opt/brain-dist:/app/dist");
      expect(deploy).not.toContain("ssl: true");
      expect(deploy).not.toContain(":80");
      expect(deploy).not.toContain(":81");

      const dockerfile = readFileSync(
        join(testDir, "deploy", "Dockerfile"),
        "utf-8",
      );
      expect(dockerfile).toContain("EXPOSE 8080");
      expect(dockerfile).toContain(
        'CMD ["./node_modules/.bin/brain", "start"]',
      );

      const workflow = readFileSync(
        join(testDir, ".github", "workflows", "deploy.yml"),
        "utf-8",
      );
      expect(workflow).toContain('workflows: ["Publish Image"]');
      expect(workflow).toContain(
        "VERSION: ${{ github.event.workflow_run.head_sha || github.sha }}",
      );
      expect(workflow).not.toContain("VERSION: latest");
      expect(workflow).not.toContain("SERVER_IP: ${{ secrets.SERVER_IP }}");
    });

    it("should reconcile stale standalone deploy mounts when --deploy is used", () => {
      writeFileSync(
        join(testDir, "brain.yaml"),
        ["brain: rover", "domain: mylittlephoney.com", ""].join("\n"),
      );
      mkdirSync(join(testDir, "config"), { recursive: true });
      writeFileSync(
        join(testDir, "config", "deploy.yml"),
        staleStandaloneDeployYml,
      );

      scaffold(testDir, { model: "rover", deploy: true });

      const deploy = readFileSync(
        join(testDir, "config", "deploy.yml"),
        "utf-8",
      );
      expect(deploy).toContain("/opt/brain-state:/data");
      expect(deploy).toContain("/opt/brain-config:/config");
      expect(deploy).toContain("/opt/brain-dist:/app/dist");
      expect(deploy).toContain("/opt/brain-data:/app/brain-data");
      expect(deploy).toContain("/opt/brain.yaml:/app/brain.yaml");
    });

    it("should preserve custom deploy artifacts when --deploy is used", () => {
      writeFileSync(
        join(testDir, "brain.yaml"),
        ["brain: rover", "domain: custom.example.com", ""].join("\n"),
      );
      const customEnvExample = "AI_API_KEY=\nCUSTOM_ONLY=1\n";
      const customDeployYml = "service: custom\nimage: custom/image\n";
      const customDockerfile = "FROM scratch\n";
      const customWorkflow = "name: Custom Deploy\n";
      const customPublishWorkflow = "name: Custom Publish\n";
      writeFileSync(join(testDir, ".env.example"), customEnvExample);
      mkdirSync(join(testDir, "config"), { recursive: true });
      writeFileSync(join(testDir, "config", "deploy.yml"), customDeployYml);
      mkdirSync(join(testDir, "deploy"), { recursive: true });
      writeFileSync(join(testDir, "deploy", "Dockerfile"), customDockerfile);
      mkdirSync(join(testDir, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(testDir, ".github", "workflows", "deploy.yml"),
        customWorkflow,
      );
      writeFileSync(
        join(testDir, ".github", "workflows", "publish-image.yml"),
        customPublishWorkflow,
      );

      scaffold(testDir, { model: "rover", deploy: true });

      expect(readFileSync(join(testDir, ".env.example"), "utf-8")).toBe(
        customEnvExample,
      );
      expect(readFileSync(join(testDir, "config", "deploy.yml"), "utf-8")).toBe(
        customDeployYml,
      );
      expect(readFileSync(join(testDir, "deploy", "Dockerfile"), "utf-8")).toBe(
        customDockerfile,
      );
      expect(
        readFileSync(
          join(testDir, ".github", "workflows", "deploy.yml"),
          "utf-8",
        ),
      ).toBe(customWorkflow);
      expect(
        readFileSync(
          join(testDir, ".github", "workflows", "publish-image.yml"),
          "utf-8",
        ),
      ).toBe(customPublishWorkflow);
    });

    it("should regenerate deploy scaffolding when --deploy --regen is used", () => {
      writeFileSync(
        join(testDir, "brain.yaml"),
        ["brain: rover", "domain: custom.example.com", ""].join("\n"),
      );
      writeFileSync(
        join(testDir, ".env.schema"),
        [
          "# @required @sensitive",
          "AI_API_KEY=",
          "# @required @sensitive",
          "EXTRA_SECRET=",
          "# @required @sensitive",
          "KAMAL_SSH_PRIVATE_KEY=",
          "# @required @sensitive",
          "KAMAL_REGISTRY_PASSWORD=",
          "# @required @sensitive",
          "CF_API_TOKEN=",
          "# @required",
          "CF_ZONE_ID=",
          "# @required @sensitive",
          "CERTIFICATE_PEM=",
          "# @required @sensitive",
          "PRIVATE_KEY_PEM=",
          "# @required @sensitive",
          "HCLOUD_TOKEN=",
          "# @required",
          "HCLOUD_SSH_KEY_NAME=",
          "# @required",
          "HCLOUD_SERVER_TYPE=",
          "# @required",
          "HCLOUD_LOCATION=",
          "",
        ].join("\n"),
      );
      mkdirSync(join(testDir, "config"), { recursive: true });
      writeFileSync(
        join(testDir, "config", "deploy.yml"),
        "service: custom\nimage: custom/image\n",
      );
      mkdirSync(join(testDir, ".github", "workflows"), { recursive: true });
      writeFileSync(
        join(testDir, ".github", "workflows", "deploy.yml"),
        "name: Custom Deploy\n",
      );
      mkdirSync(join(testDir, "deploy", "scripts"), { recursive: true });
      writeFileSync(
        join(testDir, "deploy", "scripts", "helpers.ts"),
        "export const custom = true;\n",
      );
      writeFileSync(
        join(testDir, "deploy", "scripts", "provision-server.ts"),
        "console.log('custom');\n",
      );

      scaffold(testDir, { model: "rover", deploy: true, regen: true });

      const workflow = readFileSync(
        join(testDir, ".github", "workflows", "deploy.yml"),
        "utf-8",
      );
      expect(workflow).toContain("name: Deploy");
      expect(workflow).toContain("EXTRA_SECRET: ${{ secrets.EXTRA_SECRET }}");

      const deployYml = readFileSync(
        join(testDir, "config", "deploy.yml"),
        "utf-8",
      );
      expect(deployYml).toContain("IMAGE_REPOSITORY");
      expect(deployYml).not.toContain("service: custom");

      const helperScript = readFileSync(
        join(testDir, "deploy", "scripts", "helpers.ts"),
        "utf-8",
      );
      expect(helperScript).toContain('from "@rizom/brain/deploy"');
      expect(helperScript).not.toContain("custom = true");

      const provisionServerScript = readFileSync(
        join(testDir, "deploy", "scripts", "provision-server.ts"),
        "utf-8",
      );
      expect(provisionServerScript).toContain(
        'const token = requireEnv("HCLOUD_TOKEN")',
      );
      expect(provisionServerScript).not.toContain("console.log('custom')");

      expect(readFileSync(join(testDir, ".env.schema"), "utf-8")).toContain(
        "EXTRA_SECRET=",
      );
    });
  });

  describe("deploy scaffold (--deploy flag)", () => {
    it("should create config/deploy.yml when deploy is true", () => {
      scaffold(testDir, { model: "rover", deploy: true });

      const deploy = readFileSync(
        join(testDir, "config", "deploy.yml"),
        "utf-8",
      );
      expect(deploy).toContain("IMAGE_REPOSITORY");
      expect(deploy).toContain("REGISTRY_USERNAME");
      expect(deploy).not.toContain("rizom-ai/<%= ENV['BRAIN_MODEL'] %>");
      expect(deploy).not.toContain("username: rizom-ai");
      expect(deploy).toContain("BRAIN_DOMAIN");
      expect(deploy).toContain("proxy:");
      expect(deploy).toContain("certificate_pem: CERTIFICATE_PEM");
      expect(deploy).toContain("private_key_pem: PRIVATE_KEY_PEM");
      expect(deploy).toContain("- <%= ENV['BRAIN_DOMAIN'] %>");
      expect(deploy).toContain("- <%= ENV['PREVIEW_DOMAIN'] %>");
      expect(deploy).not.toContain(":80");
      expect(deploy).not.toContain(":81");
      expect(deploy).toContain("healthcheck:");
      expect(deploy).toContain("path: /health");
      expect(deploy).not.toMatch(/^healthcheck:/m);
      expect(deploy).toContain("builder:");
      expect(deploy).toContain("arch: amd64");
    });

    it("should create pre-deploy hook when deploy is true", () => {
      scaffold(testDir, { model: "rover", deploy: true });

      const hook = readFileSync(
        join(testDir, ".kamal", "hooks", "pre-deploy"),
        "utf-8",
      );
      expect(hook).toContain("brain.yaml");
      expect(hook).toContain("scp");
      expect(hook).toContain('YAML.load_file("config/deploy.yml")');
      expect(hook).toContain('dig("ssh", "user") || "root"');
      expect(hook).toContain("StrictHostKeyChecking=no");
      expect(hook).not.toContain("deploy@");
    });

    it("should create deploy workflow when deploy is true", () => {
      scaffold(testDir, { model: "rover", deploy: true });

      const workflow = readFileSync(
        join(testDir, ".github", "workflows", "deploy.yml"),
        "utf-8",
      );
      expect(workflow).toContain('workflows: ["Publish Image"]');
      expect(workflow).toContain("workflow_dispatch:");
      expect(workflow).toContain(
        "ref: ${{ github.event.workflow_run.head_sha || github.sha }}",
      );
      expect(workflow).toContain("uses: oven-sh/setup-bun@v2");
      expect(workflow).toContain("run: ./scripts/extract-brain-config.rb");
      expect(workflow).toContain(
        "INSTANCE_NAME: ${{ github.event.repository.name }}",
      );
      expect(workflow).not.toContain("grep '^brain:' brain.yaml");
      expect(workflow).not.toContain("grep '^domain:' brain.yaml");
      expect(workflow).toContain("Validate env via varlock");
      expect(workflow).toContain("Load env via varlock");
      expect(workflow).toContain("bunx varlock@1.1.0 load --path .env.schema");
      expect(workflow).toContain(
        "bunx varlock@1.1.0 load --path .env.schema --format json --compact",
      );
      expect(workflow).not.toContain("npx -y varlock");
      expect(workflow).not.toContain("--show-all");
      expect(workflow).not.toContain("secrets.OP_TOKEN");
      expect(workflow).toContain("secrets.AI_API_KEY");
      expect(workflow).toContain("secrets.GIT_SYNC_TOKEN");
      expect(workflow).toContain("secrets.MCP_AUTH_TOKEN");
      expect(workflow).toContain("KAMAL_SSH_PRIVATE_KEY");
      expect(workflow).toContain("HCLOUD_SERVER_TYPE");
      expect(workflow).toContain("HCLOUD_LOCATION");
      expect(workflow).toContain(".kamal/secrets");
      expect(workflow).toContain("bun deploy/scripts/provision-server.ts");
      expect(workflow).toContain("bun deploy/scripts/update-dns.ts");
      expect(workflow).toContain(
        'BRAIN_DOMAIN="$PREVIEW_DOMAIN" bun deploy/scripts/update-dns.ts',
      );
      expect(workflow).not.toContain("<<EOF");
      expect(workflow).not.toContain(
        "printf '%s\\n' \"$KAMAL_SSH_PRIVATE_KEY\"",
      );
      expect(workflow).toContain("Provision server");
      expect(workflow).toContain("Update Cloudflare DNS");
      expect(workflow).toContain("steps.provision.outputs.server_ip");
      expect(workflow).toMatch(
        /- name: Provision server\n\s+id: provision\n\s+run:/,
      );
      expect(workflow).toMatch(
        /- name: Update Cloudflare DNS\n\s+env:\n\s+SERVER_IP: \$\{\{ steps\.provision\.outputs\.server_ip \}\}\n\s+run:/,
      );
      expect(workflow).toContain("gem install --user-install kamal");
      expect(workflow).toContain(
        'ruby -r rubygems -e \'puts Gem.user_dir + "/bin"\' >> "$GITHUB_PATH"',
      );
      expect(workflow).toContain("Configure SSH client");
      expect(workflow).toContain("IdentityFile ~/.ssh/id_ed25519");
      expect(workflow).toContain("IdentitiesOnly yes");
      expect(workflow).toContain("BatchMode yes");
      expect(workflow).toContain("Wait for SSH access");
      expect(workflow).toContain(
        'ssh "$SSH_USER@$SERVER_IP" true >/dev/null 2>&1',
      );
      expect(workflow).toContain("Validate SSH key");
      expect(workflow).toContain(
        "ssh-keygen -y -f ~/.ssh/id_ed25519 >/dev/null",
      );
      expect(workflow).toContain("kamal setup --skip-push");
      expect(workflow).toContain("PREVIEW_DOMAIN: ${{ env.PREVIEW_DOMAIN }}");
      expect(workflow).toContain(
        "VERSION: ${{ github.event.workflow_run.head_sha || github.sha }}",
      );
      expect(workflow).not.toContain("VERSION: latest");
      expect(workflow).toContain("Verify origin TLS");
      expect(workflow).toContain("Dump remote proxy diagnostics");
      expect(workflow).toContain("docker logs kamal-proxy --tail 200");
      expect(workflow).toContain("curl -I -k --max-time 20 --resolve");

      const script = readFileSync(
        join(testDir, "scripts", "extract-brain-config.rb"),
        "utf-8",
      );
      expect(script).toContain('require "yaml"');
      expect(script).toContain('YAML.load_file("brain.yaml")');
      expect(script).toContain('ENV["GITHUB_ENV"]');
      expect(script).toContain('ENV["GITHUB_REPOSITORY_OWNER"]');
      expect(script).toContain('ENV["GITHUB_REPOSITORY"]');
      expect(script).toContain("preview_domain = if labels.length >= 3");
      expect(script).toContain(
        'labels.dup.tap { |parts| parts[0] = "#{parts[0]}-preview" }.join(".")',
      );
      expect(script).toContain('"preview.#{brain_domain}"');
      expect(script).toContain('file.puts("PREVIEW_DOMAIN=#{preview_domain}")');
      expect(script).toContain("INSTANCE_NAME");

      expect(existsSync(join(testDir, "deploy", "scripts", "helpers.ts"))).toBe(
        true,
      );
      expect(
        existsSync(join(testDir, "deploy", "scripts", "provision-server.ts")),
      ).toBe(true);
      expect(
        existsSync(join(testDir, "deploy", "scripts", "update-dns.ts")),
      ).toBe(true);
      expect(
        existsSync(join(testDir, "deploy", "scripts", "write-ssh-key.ts")),
      ).toBe(true);
    });

    it("should map every generated env schema key into the deploy workflow", () => {
      scaffold(testDir, { model: "rover", deploy: true });

      const envSchema = readFileSync(join(testDir, ".env.schema"), "utf-8");
      const workflow = readFileSync(
        join(testDir, ".github", "workflows", "deploy.yml"),
        "utf-8",
      );
      const envNames = (envSchema.match(/^([A-Z][A-Z0-9_]*)=/gm) ?? []).map(
        (line) => line.slice(0, -1),
      );

      for (const name of envNames) {
        expect(workflow).toContain(name + ": ${{ secrets." + name + " }}");
      }
    });

    it("should map only the Bitwarden bootstrap token for Bitwarden-backed schemas", () => {
      scaffold(testDir, { model: "rover", deploy: true });
      writeFileSync(
        join(testDir, ".env.schema"),
        `# @plugin(@varlock/bitwarden-plugin@1.0.0)
# @initBitwarden(accessToken=$BWS_ACCESS_TOKEN)
# @defaultRequired=false @defaultSensitive=false
# ----------

# @required @sensitive @type=bitwardenAccessToken
BWS_ACCESS_TOKEN=

# @required @sensitive
AI_API_KEY=bitwarden("secret-id")

# @required @sensitive
GIT_SYNC_TOKEN=bitwarden("secret-id")
`,
      );

      scaffold(testDir, { model: "rover", deploy: true, regen: true });

      const workflow = readFileSync(
        join(testDir, ".github", "workflows", "deploy.yml"),
        "utf-8",
      );
      expect(workflow).toContain(
        "BWS_ACCESS_TOKEN: ${{ secrets.BWS_ACCESS_TOKEN }}",
      );
      expect(workflow).not.toContain("AI_API_KEY: ${{ secrets.AI_API_KEY }}");
      expect(workflow).not.toContain(
        "GIT_SYNC_TOKEN: ${{ secrets.GIT_SYNC_TOKEN }}",
      );
    });

    it("should create publish workflow when deploy is true", () => {
      scaffold(testDir, { model: "rover", deploy: true });

      const workflow = readFileSync(
        join(testDir, ".github", "workflows", "publish-image.yml"),
        "utf-8",
      );
      expect(workflow).toContain("name: Publish Image");
      expect(workflow).toContain(
        "ghcr.io/${{ github.repository_owner }}/${{ github.event.repository.name }}",
      );
      expect(workflow).toContain("type=raw,value=latest");
      expect(workflow).toContain("type=raw,value=${{ github.sha }}");
      expect(workflow).toContain("service=brain");
      expect(workflow).toContain("file: deploy/Dockerfile");
      expect(workflow).toContain("target: standalone");
    });

    it("should produce same config/deploy.yml regardless of model", () => {
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

      const deploy1 = readFileSync(join(dir1, "config", "deploy.yml"), "utf-8");
      const deploy2 = readFileSync(join(dir2, "config", "deploy.yml"), "utf-8");
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

    it("should preserve env templates and schemas as tracked files", () => {
      scaffold(testDir, { model: "rover" });
      const gitignore = readFileSync(join(testDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain("!.env.example");
      expect(gitignore).toContain("!.env.schema");
    });

    it("should exclude runtime artifacts (brain.log, brain-data, cache, data, dist, origin certs)", () => {
      scaffold(testDir, { model: "rover" });
      const gitignore = readFileSync(join(testDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain("brain.log");
      expect(gitignore).toContain("brain-data/");
      expect(gitignore).toContain("cache/");
      expect(gitignore).toContain("data/");
      expect(gitignore).toContain("dist/");
      expect(gitignore).toContain("origin.pem");
      expect(gitignore).toContain("origin.key");
      expect(gitignore).toContain("origin.csr");
    });
  });
});
