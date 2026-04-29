import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import packageJson from "../package.json";
import { initPilotRepo } from "../src/init";

const opsPackageDir = join(dirname(import.meta.dir));

const legacyDeployYml = `service: rover
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

const staleDeployYml = `service: rover
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

async function linkOpsPackage(repoDir: string): Promise<void> {
  const target = join(repoDir, "node_modules", "@rizom", "ops");
  await mkdir(dirname(target), { recursive: true });
  await symlink(opsPackageDir, target, "dir");
}

describe("initPilotRepo", () => {
  it("creates the private rover-pilot repo skeleton", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");

    await initPilotRepo(repo);

    expect(existsSync(join(repo, "pilot.yaml"))).toBe(true);
    expect(existsSync(join(repo, "cohorts"))).toBe(true);
    expect(existsSync(join(repo, "users"))).toBe(true);
    expect(existsSync(join(repo, "views", "users.md"))).toBe(true);
    expect(existsSync(join(repo, "docs", "onboarding-checklist.md"))).toBe(
      true,
    );
    expect(existsSync(join(repo, "docs", "operator-playbook.md"))).toBe(true);
    expect(existsSync(join(repo, "docs", "user-onboarding.md"))).toBe(true);
    expect(existsSync(join(repo, "package.json"))).toBe(true);
    expect(existsSync(join(repo, ".github", "workflows", "build.yml"))).toBe(
      true,
    );
    expect(existsSync(join(repo, ".github", "workflows", "deploy.yml"))).toBe(
      true,
    );
    expect(
      existsSync(join(repo, ".github", "workflows", "reconcile.yml")),
    ).toBe(true);
    expect(existsSync(join(repo, "deploy", "kamal", "deploy.yml"))).toBe(true);
    expect(existsSync(join(repo, "deploy", "Dockerfile"))).toBe(true);
    expect(existsSync(join(repo, ".kamal", "hooks", "pre-deploy"))).toBe(true);
    expect(existsSync(join(repo, ".env.schema"))).toBe(true);
    expect(existsSync(join(repo, ".gitignore"))).toBe(true);
    expect(existsSync(join(repo, "README.md"))).toBe(true);

    expect(existsSync(join(repo, "deploy", "scripts", "helpers.ts"))).toBe(
      true,
    );
    expect(
      existsSync(join(repo, "deploy", "scripts", "provision-server.ts")),
    ).toBe(true);
    expect(existsSync(join(repo, "deploy", "scripts", "update-dns.ts"))).toBe(
      true,
    );
    expect(
      existsSync(join(repo, "deploy", "scripts", "write-ssh-key.ts")),
    ).toBe(true);
    expect(
      existsSync(join(repo, "deploy", "scripts", "write-kamal-secrets.ts")),
    ).toBe(true);
    expect(
      existsSync(join(repo, "deploy", "scripts", "validate-secrets.ts")),
    ).toBe(true);
    expect(
      existsSync(join(repo, "deploy", "scripts", "resolve-user-config.ts")),
    ).toBe(true);
    expect(
      existsSync(join(repo, "deploy", "scripts", "resolve-deploy-handles.ts")),
    ).toBe(true);
    expect(
      existsSync(join(repo, "deploy", "scripts", "sync-content-repo.ts")),
    ).toBe(true);
    expect(
      existsSync(join(repo, "deploy", "scripts", "decrypt-user-secrets.ts")),
    ).toBe(true);

    const pilotYaml = await readFile(join(repo, "pilot.yaml"), "utf8");
    expect(pilotYaml).toContain("schemaVersion: 1");
    expect(pilotYaml).toContain("model: rover");
    expect(pilotYaml).toContain("githubOrg: <github-org>");
    expect(pilotYaml).toContain("contentRepoPrefix: rover-");
    expect(pilotYaml).toContain("aiApiKey: AI_API_KEY");
    expect(pilotYaml).toContain("gitSyncToken: GIT_SYNC_TOKEN");
    expect(pilotYaml).toContain(
      "contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN",
    );
    expect(pilotYaml).toContain("mcpAuthToken: MCP_AUTH_TOKEN");
    expect(pilotYaml).toContain(
      "agePublicKey: age1replace-with-your-public-key",
    );

    const envSchema = await readFile(join(repo, ".env.schema"), "utf8");
    expect(envSchema).toContain("# Rover pilot instance env schema");
    expect(envSchema).toContain("single source of truth");
    expect(envSchema).toContain("AI_API_KEY=");
    expect(envSchema).toContain("HCLOUD_TOKEN=");
    expect(envSchema).toContain("PRIVATE_KEY_PEM=");

    const gitignore = await readFile(join(repo, ".gitignore"), "utf8");
    expect(gitignore).toContain("node_modules/");
    expect(gitignore).toContain(".brains-ops/");
    expect(gitignore).toContain("users/*.secrets.yaml");

    const usersTable = await readFile(join(repo, "views", "users.md"), "utf8");
    expect(usersTable).toContain(
      "<!-- generated by brains-ops; do not edit -->",
    );
    expect(usersTable).toContain("| alice | cohort-1 | rover | core |");
    expect(usersTable).toContain("| handle | cohort | model | preset |");

    const repoPackageJson = await readFile(join(repo, "package.json"), "utf8");
    expect(repoPackageJson).toContain(`"@rizom/ops": "${packageJson.version}"`);
    expect(repoPackageJson).toContain('"private": true');

    const buildWorkflow = await readFile(
      join(repo, ".github", "workflows", "build.yml"),
      "utf8",
    );
    expect(buildWorkflow).toContain("docker/build-push-action@v6");
    expect(buildWorkflow).toContain("target: fleet");
    expect(buildWorkflow).toContain("brainVersion");
    expect(buildWorkflow).toContain(
      "ghcr.io/${{ github.repository_owner }}/${{ github.event.repository.name }}",
    );
    expect(buildWorkflow).toContain(
      "type=raw,value=brain-${{ env.BRAIN_VERSION }}",
    );
    expect(buildWorkflow).not.toContain(
      "type=raw,value=brain-${{ env.BRAIN_VERSION }}-${{ github.sha }}",
    );
    expect(buildWorkflow).not.toContain("TODO:");

    const deployWorkflow = await readFile(
      join(repo, ".github", "workflows", "deploy.yml"),
      "utf8",
    );
    expect(deployWorkflow).toContain("workflow_dispatch:");
    expect(deployWorkflow).toContain("push:");
    expect(deployWorkflow).toContain("workflow_run:");
    expect(deployWorkflow).toContain("workflows: [Reconcile]");
    expect(deployWorkflow).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
    expect(deployWorkflow).toContain("fetch-depth: 0");
    expect(deployWorkflow).toContain("users/*/brain.yaml");
    expect(deployWorkflow).toContain("users/*/.env");
    expect(deployWorkflow).toContain("users/*/content/**");
    expect(deployWorkflow).toContain("users/*.secrets.yaml.age");
    expect(deployWorkflow).toContain("handle:");
    expect(deployWorkflow).toContain("strategy:");
    expect(deployWorkflow).toContain("matrix.handle");
    expect(deployWorkflow).toContain(
      "No affected user configs; skipping deploy.",
    );
    expect(deployWorkflow).toContain("Finalize generated config");
    expect(deployWorkflow).toContain("actions/download-artifact@v4");
    expect(deployWorkflow).toContain("pattern: generated-*-config");
    expect(deployWorkflow).toContain("merge-multiple: true");
    expect(deployWorkflow).toContain("bun install");
    expect(deployWorkflow).toContain(
      "bun deploy/scripts/resolve-deploy-handles.ts",
    );
    expect(deployWorkflow).toContain("Decrypt user secrets");
    expect(deployWorkflow).toContain(
      "AGE_SECRET_KEY: ${{ secrets.AGE_SECRET_KEY }}",
    );
    expect(deployWorkflow).toContain(
      'bun deploy/scripts/decrypt-user-secrets.ts "$HANDLE"',
    );
    expect(deployWorkflow).toContain("bunx brains-ops onboard");
    expect(deployWorkflow).toContain(
      "bun deploy/scripts/resolve-user-config.ts",
    );
    expect(deployWorkflow).toContain("bun deploy/scripts/sync-content-repo.ts");
    expect(deployWorkflow).toContain(
      'export GIT_SYNC_TOKEN="${GIT_SYNC_TOKEN:-$SHARED_GIT_SYNC_TOKEN}"',
    );
    expect(deployWorkflow).toContain("bun deploy/scripts/provision-server.ts");
    expect(deployWorkflow).toContain("bun deploy/scripts/update-dns.ts");
    expect(deployWorkflow).toContain(
      "PREVIEW_DOMAIN: ${{ steps.user_config.outputs.preview_domain }}",
    );
    expect(deployWorkflow).toContain(
      'BRAIN_DOMAIN="$PREVIEW_DOMAIN" bun deploy/scripts/update-dns.ts',
    );
    expect(deployWorkflow).toContain(
      "bun deploy/scripts/write-kamal-secrets.ts",
    );
    expect(deployWorkflow).toContain(
      'export AI_API_KEY="${AI_API_KEY:-$SHARED_AI_API_KEY}"',
    );
    expect(deployWorkflow).toContain(
      'export MCP_AUTH_TOKEN="${MCP_AUTH_TOKEN:-$SHARED_MCP_AUTH_TOKEN}"',
    );
    expect(deployWorkflow).toContain("bun deploy/scripts/write-ssh-key.ts");
    expect(deployWorkflow).toContain("bun deploy/scripts/validate-secrets.ts");
    expect(deployWorkflow).toContain("Wait for shared image tag");
    expect(deployWorkflow).toContain(
      "VERSION: brain-${{ steps.user_config.outputs.brain_version }}",
    );
    expect(deployWorkflow).toContain(
      'bunx brains-ops render "$GITHUB_WORKSPACE"',
    );
    expect(deployWorkflow).toContain(
      'git fetch origin "${{ github.ref_name }}"',
    );
    expect(deployWorkflow).toContain(
      'git reset --hard "origin/${{ github.ref_name }}"',
    );
    expect(deployWorkflow).toContain('git apply --3way --index "$patch_file"');
    expect(deployWorkflow).toContain(
      "git push origin HEAD:${{ github.ref_name }}",
    );
    expect(deployWorkflow).toContain(
      "IMAGE_REPOSITORY: ${{ steps.user_config.outputs.image_repository }}",
    );
    expect(deployWorkflow).toContain(
      "REGISTRY_USERNAME: ${{ steps.user_config.outputs.registry_username }}",
    );
    expect(deployWorkflow).toContain(
      "BRAIN_DOMAIN: ${{ steps.user_config.outputs.brain_domain }}",
    );
    expect(deployWorkflow).toContain(
      "BRAIN_YAML_PATH: ${{ steps.user_config.outputs.brain_yaml_path }}",
    );
    expect(deployWorkflow).toContain(
      "kamal setup --skip-push -c deploy/kamal/deploy.yml",
    );
    expect(deployWorkflow).not.toContain("repository: rizom-ai/brains");
    expect(deployWorkflow).not.toContain(".brains/packages/brains-ops");
    expect(deployWorkflow).not.toContain(
      'git commit -m "chore(ops): reconcile $HANDLE"',
    );
    expect(deployWorkflow).not.toContain("\n          git push\n");
    expect(deployWorkflow).not.toContain("node <<");
    expect(deployWorkflow).not.toContain("TODO:");

    const resolveScript = await readFile(
      join(repo, "deploy", "scripts", "resolve-user-config.ts"),
      "utf8",
    );
    expect(resolveScript).toContain("brain_yaml_path");
    expect(resolveScript).toContain("preview_domain");
    expect(resolveScript).toContain(
      "const previewDomain = `${handle}-preview.${zone}`",
    );
    expect(resolveScript).toContain('from "./helpers"');

    const helpersScript = await readFile(
      join(repo, "deploy", "scripts", "helpers.ts"),
      "utf8",
    );
    expect(helpersScript).toContain("readJsonResponse");
    expect(helpersScript).toContain("parseEnvFile");
    expect(helpersScript).toContain("requireEnv");

    const resolveHandlesScript = await readFile(
      join(repo, "deploy", "scripts", "resolve-deploy-handles.ts"),
      "utf8",
    );
    expect(resolveHandlesScript).toContain(
      'if (eventName !== "push" && eventName !== "workflow_run")',
    );
    expect(resolveHandlesScript).toContain('eventName === "workflow_run"');

    const reconcileWorkflow = await readFile(
      join(repo, ".github", "workflows", "reconcile.yml"),
      "utf8",
    );
    expect(reconcileWorkflow).toContain("pilot.yaml");
    expect(reconcileWorkflow).toContain("cohorts/**");
    expect(reconcileWorkflow).toContain("users/*.yaml");
    expect(reconcileWorkflow).toContain("bun install");
    expect(reconcileWorkflow).toContain("bunx brains-ops reconcile-all");
    expect(reconcileWorkflow).not.toContain("repository: rizom-ai/brains");
    expect(reconcileWorkflow).toContain(
      'git fetch origin "${{ github.ref_name }}"',
    );
    expect(reconcileWorkflow).toContain(
      'git reset --hard "origin/${{ github.ref_name }}"',
    );
    expect(reconcileWorkflow).toContain(
      'git apply --3way --index "$patch_file"',
    );
    expect(reconcileWorkflow).toContain(
      "git push origin HEAD:${{ github.ref_name }}",
    );
    expect(reconcileWorkflow).not.toContain("\n          git push\n");
    expect(reconcileWorkflow).not.toContain("TODO:");

    const dockerfile = await readFile(
      join(repo, "deploy", "Dockerfile"),
      "utf8",
    );
    expect(dockerfile).toContain("AS runtime");
    expect(dockerfile).toContain("AS standalone");
    expect(dockerfile).toContain("AS fleet");
    expect(dockerfile).toContain("ARG BRAIN_VERSION");
    expect(dockerfile).toContain("bun add @rizom/brain@$BRAIN_VERSION");
    expect(dockerfile).toContain("EXPOSE 8080");
    expect(dockerfile).toContain('CMD ["./node_modules/.bin/brain", "start"]');

    const deployConfig = await readFile(
      join(repo, "deploy", "kamal", "deploy.yml"),
      "utf8",
    );
    expect(deployConfig).toContain("service: rover");
    expect(deployConfig).toContain("servers:");
    expect(deployConfig).toContain("web:");
    expect(deployConfig).not.toContain("primary_role:");
    expect(deployConfig).not.toContain("mcp:");
    expect(deployConfig).toContain("app_port: 8080");
    expect(deployConfig).toContain("path: /health");
    expect(deployConfig).toContain("- <%= ENV['PREVIEW_DOMAIN'] %>");
    expect(deployConfig).toContain("/opt/brain-state:/data");
    expect(deployConfig).toContain("/opt/brain-config:/config");
    expect(deployConfig).toContain("/opt/brain-dist:/app/dist");
    expect(deployConfig).toContain("/opt/brain.yaml:/app/brain.yaml");

    const preDeployHookPath = join(repo, ".kamal", "hooks", "pre-deploy");
    const preDeployHook = await readFile(preDeployHookPath, "utf8");
    expect(preDeployHook).toContain("BRAIN_YAML_PATH");
    expect(preDeployHook).toContain("/opt/brain.yaml");
    const preDeployHookStat = await stat(preDeployHookPath);
    expect(preDeployHookStat.mode & 0o111).toBeGreaterThan(0);

    const operatorPlaybook = await readFile(
      join(repo, "docs", "operator-playbook.md"),
      "utf8",
    );
    expect(operatorPlaybook).toContain(".env.schema");
    expect(operatorPlaybook).toContain("single source of truth");
    expect(operatorPlaybook).toContain("pilot.yaml.brainVersion");
    expect(operatorPlaybook).toContain("users/<handle>/.env");
    expect(operatorPlaybook).toContain("final aggregation step");
    expect(operatorPlaybook).toContain("deploy/scripts/");
    expect(operatorPlaybook).toContain("`@rizom/ops` in `package.json`");

    const userOnboarding = await readFile(
      join(repo, "docs", "user-onboarding.md"),
      "utf8",
    );
    expect(userOnboarding).toContain("Rover Pilot User Onboarding");
    expect(userOnboarding).toContain("https://<handle>.rizom.ai/");
    expect(userOnboarding).toContain("https://<handle>.rizom.ai/cms");
    expect(userOnboarding).toContain("https://<handle>.rizom.ai/mcp");
    expect(userOnboarding).toContain("GitHub token");
    expect(userOnboarding).toContain("Working in the CMS");
    expect(userOnboarding).toContain("Bearer token");
    expect(userOnboarding).toContain("Claude Desktop");
    expect(userOnboarding).toContain("Obsidian");
    expect(userOnboarding).toContain(
      "Wishlist: when Rover cannot do something yet",
    );

    const readme = await readFile(join(repo, "README.md"), "utf8");
    expect(readme).toContain("brains-ops init");
    expect(readme).toContain("brains-ops render");
    expect(readme).toContain("brains-ops ssh-key:bootstrap");
    expect(readme).toContain("brains-ops cert:bootstrap <repo>");
    expect(readme).toContain("bun install");
    expect(readme).toContain("@rizom/ops");
    expect(readme).toContain(".env.schema");
    expect(readme).toContain("single source of truth");
    expect(readme).toContain("brain-${brainVersion}");
    expect(readme).toContain("pilot.yaml.brainVersion");
    expect(readme).toContain("single operator-owned repo");
  });

  it("reconciles known stale generated deploy artifacts on rerun", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");

    await initPilotRepo(repo);
    await writeFile(
      join(repo, "deploy", "kamal", "deploy.yml"),
      legacyDeployYml,
    );

    await initPilotRepo(repo);

    const deployConfig = await readFile(
      join(repo, "deploy", "kamal", "deploy.yml"),
      "utf8",
    );
    expect(deployConfig).toContain("app_port: 8080");
    expect(deployConfig).toContain("/opt/brain-state:/data");
    expect(deployConfig).toContain("/opt/brain-config:/config");
    expect(deployConfig).toContain("/opt/brain-dist:/app/dist");
    expect(deployConfig).not.toContain("\n  app_port: 80\n");
  });

  it("reconciles stale deploy volume mounts on rerun", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");

    await initPilotRepo(repo);
    await writeFile(
      join(repo, "deploy", "kamal", "deploy.yml"),
      staleDeployYml,
    );

    await initPilotRepo(repo);

    const deployConfig = await readFile(
      join(repo, "deploy", "kamal", "deploy.yml"),
      "utf8",
    );
    expect(deployConfig).toContain("/opt/brain-state:/data");
    expect(deployConfig).toContain("/opt/brain-config:/config");
    expect(deployConfig).toContain("/opt/brain-dist:/app/dist");
    expect(deployConfig).toContain("/opt/brain-data:/app/brain-data");
    expect(deployConfig).toContain("/opt/brain.yaml:/app/brain.yaml");
  });

  it("preserves custom deploy artifacts on rerun", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");

    await initPilotRepo(repo);
    await writeFile(
      join(repo, "deploy", "kamal", "deploy.yml"),
      "service: custom\nimage: custom/image\n",
    );
    await writeFile(join(repo, "deploy", "Dockerfile"), "FROM scratch\n");

    await initPilotRepo(repo);

    expect(
      await readFile(join(repo, "deploy", "kamal", "deploy.yml"), "utf8"),
    ).toBe("service: custom\nimage: custom/image\n");
    expect(await readFile(join(repo, "deploy", "Dockerfile"), "utf8")).toBe(
      "FROM scratch\n",
    );
  });

  it("preserves existing human-edited files on rerun", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");

    await mkdir(repo, { recursive: true });
    await writeFile(
      join(repo, "pilot.yaml"),
      "schemaVersion: 1\nbrainVersion: 0.1.1-alpha.99\nmodel: rover\ngithubOrg: custom-org\ncontentRepoPrefix: rover-\ndomainSuffix: .rizom.ai\npreset: core\naiApiKey: CUSTOM_AI_API_KEY\ngitSyncToken: CUSTOM_GIT_SYNC_TOKEN\ncontentRepoAdminToken: CUSTOM_CONTENT_REPO_ADMIN_TOKEN\nmcpAuthToken: CUSTOM_MCP_AUTH_TOKEN\nagePublicKey: age1custompublickey\n",
    );

    await initPilotRepo(repo);

    const pilotYaml = await readFile(join(repo, "pilot.yaml"), "utf8");
    expect(pilotYaml).toContain("githubOrg: custom-org");
    expect(pilotYaml).toContain("aiApiKey: CUSTOM_AI_API_KEY");
    expect(pilotYaml).not.toContain("<github-org>");
    expect(existsSync(join(repo, "views", "users.md"))).toBe(true);
  });

  it("resolve-deploy-handles returns the dispatched handle", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");
    const outputPath = join(root, "github-output.txt");

    await initPilotRepo(repo);
    await linkOpsPackage(repo);
    await writeFile(outputPath, "");

    execFileSync(
      process.execPath,
      ["deploy/scripts/resolve-deploy-handles.ts"],
      {
        cwd: repo,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "workflow_dispatch",
          HANDLE_INPUT: "alice",
          GITHUB_OUTPUT: outputPath,
        },
        encoding: "utf8",
      },
    );

    const output = await readFile(outputPath, "utf8");
    expect(output).toContain('handles_json=["alice"]');
  });

  it("resolve-deploy-handles returns changed user handles for push events", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");
    const outputPath = join(root, "github-output.txt");

    await initPilotRepo(repo);
    await linkOpsPackage(repo);
    initializeGitRepo(repo);
    const beforeSha = commitAll(repo, "initial");

    await mkdir(join(repo, "users", "alice"), { recursive: true });
    await writeFile(
      join(repo, "users", "alice", ".env"),
      "BRAIN_VERSION=0.1.1-alpha.14\n",
    );
    const currentSha = commitAll(repo, "add alice env");
    await writeFile(outputPath, "");

    execFileSync(
      process.execPath,
      ["deploy/scripts/resolve-deploy-handles.ts"],
      {
        cwd: repo,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "push",
          BEFORE_SHA: beforeSha,
          GITHUB_SHA: currentSha,
          GITHUB_OUTPUT: outputPath,
        },
        encoding: "utf8",
      },
    );

    const output = await readFile(outputPath, "utf8");
    expect(output).toContain('handles_json=["alice"]');
  });

  it("resolve-deploy-handles returns changed user handles for workflow_run events", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");
    const outputPath = join(root, "github-output.txt");

    await initPilotRepo(repo);
    await linkOpsPackage(repo);
    initializeGitRepo(repo);
    const beforeSha = commitAll(repo, "initial");

    await mkdir(join(repo, "users", "alice"), { recursive: true });
    await writeFile(
      join(repo, "users", "alice", ".env"),
      "BRAIN_VERSION=0.1.1-alpha.14\n",
    );
    commitAll(repo, "add alice env");
    await writeFile(outputPath, "");

    execFileSync(
      process.execPath,
      ["deploy/scripts/resolve-deploy-handles.ts"],
      {
        cwd: repo,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "workflow_run",
          BEFORE_SHA: beforeSha,
          GITHUB_OUTPUT: outputPath,
        },
        encoding: "utf8",
      },
    );

    const output = await readFile(outputPath, "utf8");
    expect(output).toContain('handles_json=["alice"]');
  });

  it("resolve-deploy-handles returns changed user handles for generated content seed updates", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");
    const outputPath = join(root, "github-output.txt");

    await initPilotRepo(repo);
    await linkOpsPackage(repo);
    initializeGitRepo(repo);
    const beforeSha = commitAll(repo, "initial");

    await mkdir(join(repo, "users", "alice", "content", "anchor-profile"), {
      recursive: true,
    });
    await writeFile(
      join(
        repo,
        "users",
        "alice",
        "content",
        "anchor-profile",
        "anchor-profile.md",
      ),
      "---\nname: Alice Example\nkind: professional\n---\n",
    );
    const currentSha = commitAll(repo, "seed alice anchor profile");
    await writeFile(outputPath, "");

    execFileSync(
      process.execPath,
      ["deploy/scripts/resolve-deploy-handles.ts"],
      {
        cwd: repo,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "push",
          BEFORE_SHA: beforeSha,
          GITHUB_SHA: currentSha,
          GITHUB_OUTPUT: outputPath,
        },
        encoding: "utf8",
      },
    );

    const output = await readFile(outputPath, "utf8");
    expect(output).toContain('handles_json=["alice"]');
  });

  it("resolve-deploy-handles returns no handles for contract-only push events", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");
    const outputPath = join(root, "github-output.txt");

    await initPilotRepo(repo);
    await linkOpsPackage(repo);
    initializeGitRepo(repo);
    const beforeSha = commitAll(repo, "initial");

    await writeFile(
      join(repo, "deploy", "kamal", "deploy.yml"),
      "service: rover\nimage: contract-only-change\n",
    );
    const currentSha = commitAll(repo, "contract-only change");
    await writeFile(outputPath, "");

    execFileSync(
      process.execPath,
      ["deploy/scripts/resolve-deploy-handles.ts"],
      {
        cwd: repo,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "push",
          BEFORE_SHA: beforeSha,
          GITHUB_SHA: currentSha,
          GITHUB_OUTPUT: outputPath,
        },
        encoding: "utf8",
      },
    );

    const output = await readFile(outputPath, "utf8");
    expect(output).toContain("handles_json=[]");
  });

  it("resolve-deploy-handles handles first-push zero before sha", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");
    const outputPath = join(root, "github-output.txt");

    await initPilotRepo(repo);
    await linkOpsPackage(repo);
    initializeGitRepo(repo);
    commitAll(repo, "initial");

    await writeFile(outputPath, "");

    execFileSync(
      process.execPath,
      ["deploy/scripts/resolve-deploy-handles.ts"],
      {
        cwd: repo,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "push",
          BEFORE_SHA: "0000000000000000000000000000000000000000",
          GITHUB_SHA: execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: repo,
            encoding: "utf8",
          }).trim(),
          GITHUB_OUTPUT: outputPath,
        },
        encoding: "utf8",
      },
    );

    const output = await readFile(outputPath, "utf8");
    expect(output).toContain("handles_json=[]");
  });
});

function initializeGitRepo(repo: string): void {
  execFileSync("git", ["init", "-b", "main"], {
    cwd: repo,
    encoding: "utf8",
  });
  execFileSync("git", ["config", "user.name", "Test User"], {
    cwd: repo,
    encoding: "utf8",
  });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: repo,
    encoding: "utf8",
  });
}

function commitAll(repo: string, message: string): string {
  execFileSync("git", ["add", "."], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", message], {
    cwd: repo,
    encoding: "utf8",
  });
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).trim();
}
