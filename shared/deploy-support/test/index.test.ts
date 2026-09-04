import { afterEach, describe, expect, it } from "bun:test";
import { createTempDirSync } from "@brains/test-utils";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  backendBootstrapEnvSchema,
  deployProvisionEnvSchema,
  deployScriptNames,
  isStaleDeployDockerfile,
  isStaleDeployMounts,
  isStaleDeployScript,
  renderDeployWorkflow,
  renderDockerfile,
  renderExtractBrainConfigScript,
  renderKamalDeploy,
  resolveDeployScriptPath,
  tlsCertEnvSchema,
  writeGitHubEnv,
} from "../src/index";

const originalGitHubEnv = process.env["GITHUB_ENV"];

afterEach(() => {
  if (originalGitHubEnv === undefined) {
    delete process.env["GITHUB_ENV"];
    return;
  }

  process.env["GITHUB_ENV"] = originalGitHubEnv;
});

describe("deploy templates", () => {
  it("renders shared Docker and Kamal templates", () => {
    const dockerfile = renderDockerfile();
    expect(dockerfile).toContain("ARG BUN_VERSION=1.4.0");
    expect(dockerfile).toContain("EXPOSE 8080");
    const labelIndex = dockerfile.indexOf(
      'LABEL ai.rizom.brain.watchdog="true"',
    );
    expect(labelIndex).toBeGreaterThan(-1);
    expect(dockerfile.indexOf("FROM runtime AS standalone")).toBeGreaterThan(
      labelIndex,
    );
    expect(dockerfile.indexOf("FROM runtime AS fleet")).toBeGreaterThan(
      labelIndex,
    );
    expect(dockerfile).toContain("chromium-headless-shell");
    expect(dockerfile).toContain(
      "BUN_CHROME_PATH=/usr/bin/chromium-headless-shell",
    );
    expect(dockerfile).toContain("fonts-noto-color-emoji");
    expect(dockerfile).toContain("fonts-wqy-zenhei");
    expect(dockerfile).not.toContain("playwright");
    expect(dockerfile).toContain('ENTRYPOINT ["/usr/bin/tini", "--"]');
    expect(dockerfile).toContain(
      'CMD ["bun", "--no-orphans", "./node_modules/@rizom/brain/dist/brain.js", "start"]',
    );
    expect(dockerfile).toContain(
      "HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3",
    );
    expect(dockerfile).toContain("http://127.0.0.1:8080/health/live");
    const deploy = renderKamalDeploy({ serviceName: "brain" });
    expect(deploy).toContain("service: brain");
    expect(deploy).toContain("path: /health/ready");
    expect(deploy).toContain("- DISCORD_PUBLIC_KEY");
    expect(deploy).toContain("- DISCORD_APPLICATION_ID");
  });

  it("recognizes only the previous generated Docker runtime", () => {
    const priorUncontainedRuntime = renderDockerfile().replace(
      'CMD ["bun", "--no-orphans", "./node_modules/@rizom/brain/dist/brain.js", "start"]',
      'CMD ["bun", "./node_modules/@rizom/brain/dist/brain.js", "start"]',
    );
    const priorUnscopedRuntime = renderDockerfile().replace(
      '\nLABEL ai.rizom.brain.watchdog="true"\n',
      "\n",
    );
    const priorHealthlessRuntime = renderDockerfile().replace(
      /\nHEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \\\n {2}CMD curl --fail --silent --show-error http:\/\/127\.0\.0\.1:8080\/health\/live \|\| exit 1\n/,
      "\n",
    );
    const legacy = priorHealthlessRuntime
      .replace("curl ca-certificates git tini", "curl ca-certificates git")
      .replace('ENTRYPOINT ["/usr/bin/tini", "--"]\n', "")
      .replace(
        'CMD ["bun", "--no-orphans", "./node_modules/@rizom/brain/dist/brain.js", "start"]',
        'CMD ["./node_modules/.bin/brain", "start"]',
      );

    expect(isStaleDeployDockerfile(priorUncontainedRuntime)).toBe(true);
    expect(isStaleDeployDockerfile(priorUnscopedRuntime)).toBe(true);
    expect(isStaleDeployDockerfile(priorHealthlessRuntime)).toBe(true);
    expect(isStaleDeployDockerfile(legacy)).toBe(true);
    expect(isStaleDeployDockerfile(renderDockerfile())).toBe(false);
    expect(isStaleDeployDockerfile("FROM scratch\n")).toBe(false);
  });

  it("recognizes the generated pre-readiness Kamal healthcheck", () => {
    const previous = renderKamalDeploy({ serviceName: "brain" }).replace(
      "path: /health/ready",
      "path: /health",
    );

    expect(isStaleDeployMounts(previous, "brain")).toBe(true);
    expect(isStaleDeployMounts("service: custom\n", "brain")).toBe(false);
  });

  it("ships one canonical verified predeploy backup command", () => {
    expect(deployScriptNames).toContain("create-predeploy-backup.ts");
    const snapshotCommand = readFileSync(
      resolveDeployScriptPath("create-predeploy-backup.ts"),
      "utf8",
    );

    for (const marker of [
      "VACUUM INTO",
      "database.serialize()",
      "PRAGMA quick_check",
      "sha256sum --check",
      ".incomplete",
      "DEFAULT_PREDEPLOY_BACKUP_RETENTION_COUNT = 5",
    ]) {
      expect(snapshotCommand).toContain(marker);
    }
    expect(snapshotCommand).toMatch(/"bundle",\s*"verify"/);
    expect(snapshotCommand).not.toContain(".Config.Env");
    expect(snapshotCommand).not.toMatch(/cp\\s+[^\\n]*\\.db/);

    const workflow = renderDeployWorkflow({
      secretNames: [],
      bootstrapSecrets: [],
    });
    const backupIndex = workflow.indexOf(
      "bun deploy/scripts/create-predeploy-backup.ts",
    );
    const lockIndex = workflow.indexOf("kamal lock release");
    const deployIndex = workflow.indexOf("kamal setup --skip-push");
    expect(backupIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeGreaterThan(backupIndex);
    expect(deployIndex).toBeGreaterThan(lockIndex);
  });

  it("ships a dedicated host watchdog installer that records incidents before restart", () => {
    expect(deployScriptNames).toContain("install-health-watchdog.ts");
    const installer = readFileSync(
      resolveDeployScriptPath("install-health-watchdog.ts"),
      "utf8",
    );
    const logIndex = installer.indexOf(
      'docker logs --timestamps --tail 1000 "$container_id"',
    );
    const restartIndex = installer.indexOf('docker restart "$container_id"');

    expect(installer).toContain("/usr/local/sbin/brains-health-watchdog");
    expect(installer).toContain("--filter health=unhealthy");
    expect(installer).toContain(
      'BRAIN_WATCHDOG_LABEL = "ai.rizom.brain.watchdog"',
    );
    expect(installer).toContain(
      "--filter label=${BRAIN_WATCHDOG_LABEL_FILTER}",
    );
    expect(installer).not.toContain("--filter label=service ");
    expect(installer).toContain("no running Brain containers found");
    expect(installer).toContain("brains-health-watchdog.timer");
    expect(installer).toContain("MAX_RESTARTS=3");
    expect(installer).toContain("WINDOW_SECONDS=3600");
    expect(installer).toContain("restart-budget-exhausted");
    expect(installer).toContain(
      "systemctl enable --now brains-health-watchdog.timer",
    );
    expect(logIndex).toBeGreaterThan(-1);
    expect(restartIndex).toBeGreaterThan(logIndex);
    const workflow = renderDeployWorkflow({
      secretNames: [],
      bootstrapSecrets: [],
    });
    const deployIndex = workflow.indexOf("kamal setup --skip-push");
    const watchdogIndex = workflow.indexOf(
      "bun deploy/scripts/install-health-watchdog.ts",
    );
    expect(deployIndex).toBeGreaterThan(-1);
    expect(watchdogIndex).toBeGreaterThan(deployIndex);
  });

  it("reconciles prior generated deploy script vintages", () => {
    for (const script of deployScriptNames) {
      const canonical = readFileSync(resolveDeployScriptPath(script), "utf8");
      const priorVintage = `${canonical}\n// prior generated vintage\n`;
      const operatorOwned = '#!/usr/bin/env bun\nconsole.log("custom");\n';

      expect(isStaleDeployScript(script, canonical, canonical)).toBe(false);
      expect(isStaleDeployScript(script, priorVintage, canonical)).toBe(true);
      expect(isStaleDeployScript(script, operatorOwned, canonical)).toBe(false);
    }
  });

  it("flags the pre-label health watchdog installer as stale", () => {
    const canonical = readFileSync(
      resolveDeployScriptPath("install-health-watchdog.ts"),
      "utf8",
    );
    const preLabelInstaller = canonical
      .replace(/export const BRAIN_WATCHDOG_LABEL[^]*?\n\n/, "")
      .replace(
        "--filter label=${BRAIN_WATCHDOG_LABEL_FILTER}",
        "--filter label=service",
      );
    expect(preLabelInstaller).toContain("--filter label=service");
    expect(
      isStaleDeployScript(
        "install-health-watchdog.ts",
        preLabelInstaller,
        canonical,
      ),
    ).toBe(true);
  });

  it("exports deploy env schema fragments", () => {
    expect(deployProvisionEnvSchema).toContain("HCLOUD_TOKEN=");
    expect(tlsCertEnvSchema).toContain("CERTIFICATE_PEM=");
    expect(backendBootstrapEnvSchema("none")).toBe("");
    expect(backendBootstrapEnvSchema("1password")).toContain(
      "secret backend bootstrap",
    );
  });

  it("renders preview domains under the configured brain domain", () => {
    const script = renderExtractBrainConfigScript();

    expect(script).toContain('preview_domain = "preview.#{brain_domain}"');
    expect(script).not.toContain("preview_domain = if labels.length >= 3");
    expect(script).not.toContain("-preview");
  });

  it("writes multiline GitHub env values with heredoc syntax", () => {
    const envPath = join(createTempDirSync("deploy-support-env-"), "env");
    process.env["GITHUB_ENV"] = envPath;

    writeGitHubEnv("CERTIFICATE_PEM", "line 1\nline 2");

    const contents = readFileSync(envPath, "utf8");
    expect(contents).toContain("CERTIFICATE_PEM<<EOF_CERTIFICATE_PEM_");
    expect(contents).toContain("line 1\nline 2\nEOF_CERTIFICATE_PEM_");
  });

  it("resolves deploy script source paths", () => {
    expect(deployScriptNames).toContain("provision-server.ts");
    expect(resolveDeployScriptPath("provision-server.ts")).toContain(
      "deploy-scripts/provision-server.ts",
    );
  });

  it("excludes the backend bootstrap token from runtime secret validation", () => {
    const script = readFileSync(
      resolveDeployScriptPath("validate-secrets.ts"),
      "utf8",
    );

    expect(script).toContain('entry.key !== "BWS_ACCESS_TOKEN"');
  });
});
