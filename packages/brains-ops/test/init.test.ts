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
    - DISCORD_BOT_TOKEN

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml
`;

function ensureOpsPackageBuilt(): void {
  if (existsSync(join(opsPackageDir, "dist", "deploy.js"))) {
    return;
  }

  execFileSync("bun", ["run", "build"], {
    cwd: opsPackageDir,
    encoding: "utf8",
  });
}

async function linkOpsPackage(repoDir: string): Promise<void> {
  ensureOpsPackageBuilt();

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
    expect(pilotYaml).toContain(
      "agePublicKey: age1replace-with-your-public-key",
    );

    const envSchema = await readFile(join(repo, ".env.schema"), "utf8");
    expect(envSchema).toContain("# Rover pilot instance env schema");
    expect(envSchema).toContain("single source of truth");
    expect(envSchema).toContain("AI_API_KEY=");
    expect(envSchema).toContain("ATPROTO_APP_PASSWORD=");
    expect(envSchema).not.toContain("ATPROTO_IDENTIFIER=");
    expect(envSchema).toContain("SETUP_EMAIL_API_KEY=");
    expect(envSchema).toContain("SETUP_EMAIL_FROM=");
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
    expect(buildWorkflow).toContain("docker/build-push-action@v7");
    expect(buildWorkflow).toContain("target: fleet");
    // The image set is a pure function of the declared fleet state: a config
    // push resolves the registry and matrix-builds only the missing images.
    expect(buildWorkflow).toContain("brain_version:");
    expect(buildWorkflow).toContain("users/*.yaml");
    expect(buildWorkflow).toContain("cohorts/**");
    expect(buildWorkflow).toContain("pilot.yaml");
    expect(buildWorkflow).toContain("${{ inputs.brain_version || '' }}");
    expect(buildWorkflow).toContain(
      "bun deploy/scripts/resolve-missing-images.ts",
    );
    expect(buildWorkflow).toContain(
      "image: ${{ fromJson(needs.resolve.outputs.images_json) }}",
    );
    expect(buildWorkflow).toContain(
      "BRAIN_VERSION=${{ matrix.image.brain_version }}",
    );
    expect(buildWorkflow).toContain(
      "SITE_PACKAGES=${{ matrix.image.site_packages }}",
    );
    expect(buildWorkflow).toContain("ghcr.io/${{ github.repository }}");
    expect(buildWorkflow).toContain("type=raw,value=${{ matrix.image.tag }}");
    expect(buildWorkflow).not.toContain("resolve-build-config");
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
    expect(deployWorkflow).toContain(`release_stale_lock:
        description: Release an operator-confirmed stale Kamal deploy lock before retrying
        required: false
        type: boolean
        default: false`);
    expect(deployWorkflow).toContain("if: ${{ inputs.release_stale_lock }}");
    expect(deployWorkflow).toContain(
      "kamal lock release -c deploy/kamal/deploy.yml",
    );
    expect(deployWorkflow).toContain("strategy:");
    expect(deployWorkflow).toContain("matrix.handle");
    expect(deployWorkflow).toContain(
      "No affected user configs; skipping deploy.",
    );
    expect(deployWorkflow).toContain("Finalize generated config");
    expect(deployWorkflow).toContain("actions/download-artifact@v4");
    expect(deployWorkflow).toContain("pattern: generated-*-config");
    // A new user's generated config is untracked; without intent-to-add
    // every `git diff` below is blind to it and the finalize step silently
    // drops the directory, so later deploys skip the user forever.
    expect(deployWorkflow).toContain("git add --intent-to-add -- users views");
    expect(deployWorkflow).toContain("merge-multiple: true");
    expect(deployWorkflow).toContain("bun install");
    expect(deployWorkflow).toContain(
      "bun deploy/scripts/resolve-deploy-handles.ts",
    );
    expect(deployWorkflow).toContain("Decrypt user secrets");
    // Shared operator env (age key, shared API keys) loads through varlock —
    // per-step secret plumbing is gone with it.
    expect(deployWorkflow).toContain(
      "BWS_ACCESS_TOKEN: ${{ secrets.BWS_ACCESS_TOKEN }}",
    );
    expect(deployWorkflow).toContain("varlock");
    expect(deployWorkflow).toContain(
      'bun deploy/scripts/decrypt-user-secrets.ts "$HANDLE"',
    );
    expect(deployWorkflow).toContain("bunx brains-ops onboard");
    expect(deployWorkflow).toContain(
      "bun deploy/scripts/resolve-user-config.ts",
    );
    expect(deployWorkflow).toContain("bun deploy/scripts/sync-content-repo.ts");
    expect(deployWorkflow).toContain("bun deploy/scripts/provision-server.ts");
    expect(deployWorkflow).toContain("bun deploy/scripts/update-dns.ts");
    expect(deployWorkflow).toContain(
      "PREVIEW_DOMAIN: ${{ steps.user_config.outputs.preview_domain }}",
    );
    expect(deployWorkflow).toContain(
      "WWW_DOMAIN: ${{ steps.user_config.outputs.www_domain }}",
    );
    expect(deployWorkflow).toContain(
      "CF_ZONE_ID: ${{ steps.user_config.outputs.cloudflare_zone_id }}",
    );
    expect(deployWorkflow).toContain('if [ -n "$WWW_DOMAIN" ]; then');
    expect(deployWorkflow).toContain(
      'BRAIN_DOMAIN="$WWW_DOMAIN" bun deploy/scripts/update-dns.ts',
    );
    expect(deployWorkflow).toContain(
      'BRAIN_DOMAIN="$PREVIEW_DOMAIN" bun deploy/scripts/update-dns.ts',
    );
    expect(deployWorkflow).toContain("https://$PREVIEW_DOMAIN/");
    expect(deployWorkflow).toContain(
      "bun deploy/scripts/write-kamal-secrets.ts",
    );
    expect(deployWorkflow).not.toContain("MCP_AUTH_TOKEN");
    expect(deployWorkflow).toContain("bun deploy/scripts/write-ssh-key.ts");
    expect(deployWorkflow).toContain("bun deploy/scripts/validate-secrets.ts");
    // The Build workflow fires off the same config push, so the deploy waits
    // long enough to cover a full image build.
    expect(deployWorkflow).toContain("Wait for image tag");
    expect(deployWorkflow).toContain("seq 1 60");
    expect(deployWorkflow).toContain(
      "${{ steps.user_config.outputs.image_repository }}:${{ steps.user_config.outputs.image_tag }}",
    );
    expect(deployWorkflow).toContain(
      "VERSION: ${{ steps.user_config.outputs.image_tag }}",
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
    expect(deployWorkflow).not.toContain("TODO:");

    const decryptUserSecretsScript = await readFile(
      join(repo, "deploy", "scripts", "decrypt-user-secrets.ts"),
      "utf8",
    );
    // Secrets are emitted through writeSecretGitHubEnv, which masks the value
    // and skips empties. CMS_CONTENT_REPO_PAT falls back to the git-sync token.
    // Optional per-user ATProto and custom-domain TLS values override shared
    // deploy env only when they are present in the encrypted user payload.
    expect(decryptUserSecretsScript).toContain(
      'writeSecretGitHubEnv("AI_API_KEY"',
    );
    expect(decryptUserSecretsScript).toContain('"CMS_CONTENT_REPO_PAT"');
    expect(decryptUserSecretsScript).toContain("maskGitHubSecret");
    expect(decryptUserSecretsScript).toContain(
      'writeSecretGitHubEnv("ATPROTO_APP_PASSWORD"',
    );
    expect(decryptUserSecretsScript).toContain('"CERTIFICATE_PEM"');
    expect(decryptUserSecretsScript).toContain('"PRIVATE_KEY_PEM"');
    expect(decryptUserSecretsScript).toContain("decodeEscapedSecret");
    expect(decryptUserSecretsScript).toContain("Bun.YAML.parse");
    expect(decryptUserSecretsScript).not.toContain(
      'writeGitHubEnv("ATPROTO_IDENTIFIER"',
    );

    // The build's resolve step is a thin caller — the logic (derive the
    // declared image set, probe the registry) lives in @rizom/ops.
    const resolveImagesScript = await readFile(
      join(repo, "deploy", "scripts", "resolve-missing-images.ts"),
      "utf8",
    );
    expect(resolveImagesScript).toContain("runResolveMissingImages");
    expect(resolveImagesScript).toContain('requireEnv("GITHUB_REPOSITORY")');
    expect(resolveImagesScript).toContain("writeGitHubOutput");
    expect(resolveImagesScript).toContain('from "./helpers"');

    const resolveScript = await readFile(
      join(repo, "deploy", "scripts", "resolve-user-config.ts"),
      "utf8",
    );
    expect(resolveScript).toContain("brain_yaml_path");
    expect(resolveScript).toContain("preview_domain");
    expect(resolveScript).toContain("www_domain");
    expect(resolveScript).toContain("cloudflare_zone_id");
    expect(resolveScript).toContain("image_tag");
    // Tag derivation goes through the shared @rizom/ops helpers so the build
    // and the deploy can never disagree about a tag.
    expect(resolveScript).toContain("siteImageTag");
    expect(resolveScript).toContain("sitePackagesFor");
    expect(resolveScript).toContain("derivePreviewDomain");
    expect(resolveScript).toContain(
      "sharedDomain: registry.pilot.domainSuffix",
    );
    expect(resolveScript).not.toContain("function resolvePreviewDomain");
    expect(resolveScript).toContain('from "./helpers"');

    const helpersScript = await readFile(
      join(repo, "deploy", "scripts", "helpers.ts"),
      "utf8",
    );
    expect(helpersScript).toContain("readJsonResponse");
    expect(helpersScript).toContain("parseEnvFile");
    expect(helpersScript).toContain("requireEnv");
    expect(helpersScript).toContain("siteImageTag");
    expect(helpersScript).toContain("runResolveMissingImages");

    const resolveHandlesScript = await readFile(
      join(repo, "deploy", "scripts", "resolve-deploy-handles.ts"),
      "utf8",
    );
    expect(resolveHandlesScript).toContain(
      'if (eventName !== "push" && eventName !== "workflow_run")',
    );
    expect(resolveHandlesScript).toContain('eventName === "workflow_run"');
    // Deploy handles come from reconcile outputs (brain.yaml/.env/content) and
    // the encrypted secrets file — NOT the raw users/<handle>.yaml registry
    // file, which flows through Build + Reconcile first.
    expect(resolveHandlesScript).toContain(
      "path.match(/^users\\/([^/]+)\\/(?:\\.env|brain\\.yaml|content\\/.*)$/)",
    );
    expect(resolveHandlesScript).toContain(
      "path.match(/^users\\/([^/]+)\\.secrets\\.yaml\\.age$/)",
    );

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
    // Same untracked-blindness guard as the deploy finalize step: a brand
    // new users/<handle>/ directory must be visible to the diff dance.
    expect(reconcileWorkflow).toContain(
      "git add --intent-to-add -- views users",
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
    expect(dockerfile).toContain("ARG SITE_PACKAGES");
    expect(dockerfile).toContain("bun add @rizom/brain@$BRAIN_VERSION");
    expect(dockerfile).toContain("$SITE_PACKAGES");
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
    expect(deployConfig).toContain("- <%= ENV['WWW_DOMAIN'] %>");
    expect(deployConfig).toContain("/opt/brain-state:/data");
    expect(deployConfig).toContain("/opt/brain-config:/config");
    expect(deployConfig).toContain("/opt/brain-dist:/app/dist");
    expect(deployConfig).toContain("/opt/brain.yaml:/app/brain.yaml");
    expect(deployConfig).toContain("- ATPROTO_APP_PASSWORD");
    expect(deployConfig).not.toContain("- ATPROTO_IDENTIFIER");
    expect(deployConfig).toContain("- SETUP_EMAIL_API_KEY");
    expect(deployConfig).toContain("- SETUP_EMAIL_FROM");
    expect(deployConfig).not.toContain("MCP_AUTH_TOKEN");

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
    expect(operatorPlaybook).toContain(
      "## Hosted site and theme package contract",
    );
    expect(operatorPlaybook).toContain("default-export a valid `SitePackage`");
    expect(operatorPlaybook).toContain("site-mockup-migration.md");
    expect(operatorPlaybook).toContain("siteOverride.version");
    expect(operatorPlaybook).toContain("per-instance image");
    expect(operatorPlaybook).toContain(
      "### Custom-package canary and rollback",
    );

    const userOnboarding = await readFile(
      join(repo, "docs", "user-onboarding.md"),
      "utf8",
    );
    expect(userOnboarding).toContain("Welcome to Rover");
    expect(userOnboarding).toContain("https://<handle>.rizom.ai/chat");
    expect(userOnboarding).toContain("https://<handle>.rizom.ai/");
    expect(userOnboarding).toContain("https://<handle>.rizom.ai/cms");
    expect(userOnboarding).toContain("asked to set a passkey");
    expect(userOnboarding).toContain("## What Rover is");
    expect(userOnboarding).toContain("## Your first five minutes");
    expect(userOnboarding).toContain("## The Chat and the CMS");
    expect(userOnboarding).toContain("## Other ways to chat with Rover");
    expect(userOnboarding).toContain("## Connecting Rover to other tools");
    expect(userOnboarding).toContain("## Your access details");

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
    expect(readme).toContain("brain-${brainVersion}-sites-${packageHash}");
    expect(readme).toContain("siteOverride.version");
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

  it("reconciles generated ATProto deploy env artifacts on rerun", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");

    await initPilotRepo(repo);

    const envSchemaPath = join(repo, ".env.schema");
    const deployConfigPath = join(repo, "deploy", "kamal", "deploy.yml");
    const decryptScriptPath = join(
      repo,
      "deploy",
      "scripts",
      "decrypt-user-secrets.ts",
    );

    await writeFile(
      envSchemaPath,
      (await readFile(envSchemaPath, "utf8")).replace(
        "\n# AT Protocol publishing/discovery (optional, per-user)\n# Comes from the decrypted users/<handle>.secrets.yaml.age file when configured.\n# @sensitive\nATPROTO_APP_PASSWORD=\n",
        "\n",
      ),
    );
    await writeFile(
      deployConfigPath,
      (await readFile(deployConfigPath, "utf8")).replace(
        "    - ATPROTO_APP_PASSWORD\n",
        "",
      ),
    );
    await writeFile(
      decryptScriptPath,
      (await readFile(decryptScriptPath, "utf8")).replace(
        'writeSecretGitHubEnv("ATPROTO_APP_PASSWORD", secrets["atprotoAppPassword"]);\n',
        "",
      ),
    );

    await initPilotRepo(repo);

    expect(await readFile(envSchemaPath, "utf8")).toContain(
      "ATPROTO_APP_PASSWORD=",
    );
    expect(await readFile(deployConfigPath, "utf8")).toContain(
      "- ATPROTO_APP_PASSWORD",
    );
    expect(await readFile(decryptScriptPath, "utf8")).toContain(
      'writeSecretGitHubEnv("ATPROTO_APP_PASSWORD"',
    );
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
      "schemaVersion: 1\nbrainVersion: 0.1.1-alpha.99\nmodel: rover\ngithubOrg: custom-org\ncontentRepoPrefix: rover-\ndomainSuffix: .rizom.ai\npreset: core\naiApiKey: CUSTOM_AI_API_KEY\ngitSyncToken: CUSTOM_GIT_SYNC_TOKEN\ncontentRepoAdminToken: CUSTOM_CONTENT_REPO_ADMIN_TOKEN\nagePublicKey: age1custompublickey\n",
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

  it("resolve-deploy-handles deploys the reconciled brain.yaml, not the raw registry file", async () => {
    const root = await mkdtemp(join(tmpdir(), "brains-ops-init-"));
    const repo = join(root, "rover-pilot");
    const outputPath = join(root, "github-output.txt");

    await initPilotRepo(repo);
    await linkOpsPackage(repo);
    initializeGitRepo(repo);
    const beforeSha = commitAll(repo, "initial");

    // A raw users/<handle>.yaml registry edit does NOT trigger a deploy handle
    // on its own: it flows through Build (image) + Reconcile, and it is the
    // regenerated users/<handle>/brain.yaml that deploys. This ordering keeps a
    // deploy from running against stale config before reconcile catches up.
    await writeFile(
      join(repo, "users", "alice.yaml"),
      `handle: alice\ndiscord:\n  enabled: false\nsiteOverride:\n  package: "@rizom/site-docs"\n  version: 0.2.0-alpha.136\n`,
    );
    const registrySha = commitAll(repo, "update alice site package");
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
          GITHUB_SHA: registrySha,
          GITHUB_OUTPUT: outputPath,
        },
        encoding: "utf8",
      },
    );
    expect(await readFile(outputPath, "utf8")).toContain("handles_json=[]");

    // Reconcile's output — users/<handle>/brain.yaml — is what resolves the
    // handle and triggers the deploy.
    await mkdir(join(repo, "users", "alice"), { recursive: true });
    await writeFile(
      join(repo, "users", "alice", "brain.yaml"),
      "version: 0.2.0-alpha.136\n",
    );
    const reconciledSha = commitAll(repo, "reconcile alice brain.yaml");
    await writeFile(outputPath, "");
    execFileSync(
      process.execPath,
      ["deploy/scripts/resolve-deploy-handles.ts"],
      {
        cwd: repo,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "push",
          BEFORE_SHA: registrySha,
          GITHUB_SHA: reconciledSha,
          GITHUB_OUTPUT: outputPath,
        },
        encoding: "utf8",
      },
    );
    expect(await readFile(outputPath, "utf8")).toContain(
      'handles_json=["alice"]',
    );
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
