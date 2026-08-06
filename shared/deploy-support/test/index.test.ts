import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backendBootstrapEnvSchema,
  deployProvisionEnvSchema,
  deployScriptNames,
  isStaleDeployDockerfile,
  isStaleDeployMounts,
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
    expect(renderDockerfile()).toContain("EXPOSE 8080");
    expect(renderDockerfile()).toContain(
      "bunx playwright-core install --with-deps chromium-headless-shell",
    );
    expect(renderDockerfile()).toContain('ENTRYPOINT ["/usr/bin/tini", "--"]');
    expect(renderDockerfile()).toContain(
      'CMD ["bun", "./node_modules/@rizom/brain/dist/brain.js", "start"]',
    );
    expect(renderDockerfile()).toContain(
      "HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3",
    );
    expect(renderDockerfile()).toContain("http://127.0.0.1:8080/health/live");
    const deploy = renderKamalDeploy({ serviceName: "brain" });
    expect(deploy).toContain("service: brain");
    expect(deploy).toContain("path: /health/ready");
    expect(deploy).toContain("- DISCORD_PUBLIC_KEY");
    expect(deploy).toContain("- DISCORD_APPLICATION_ID");
  });

  it("recognizes only the previous generated Docker runtime", () => {
    const priorHealthlessRuntime = renderDockerfile().replace(
      /\nHEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \\\n {2}CMD curl --fail --silent --show-error http:\/\/127\.0\.0\.1:8080\/health\/live \|\| exit 1\n/,
      "\n",
    );
    const legacy = priorHealthlessRuntime
      .replace("curl ca-certificates git tini", "curl ca-certificates git")
      .replace('ENTRYPOINT ["/usr/bin/tini", "--"]\n', "")
      .replace(
        'CMD ["bun", "./node_modules/@rizom/brain/dist/brain.js", "start"]',
        'CMD ["./node_modules/.bin/brain", "start"]',
      );

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
    expect(installer).toContain("--filter label=service");
    expect(installer).toContain("brains-health-watchdog.timer");
    expect(installer).toContain("MAX_RESTARTS=3");
    expect(installer).toContain("WINDOW_SECONDS=3600");
    expect(installer).toContain("restart-budget-exhausted");
    expect(installer).toContain(
      "systemctl enable --now brains-health-watchdog.timer",
    );
    expect(logIndex).toBeGreaterThan(-1);
    expect(restartIndex).toBeGreaterThan(logIndex);
    expect(
      renderDeployWorkflow({ secretNames: [], bootstrapSecrets: [] }),
    ).toContain("bun deploy/scripts/install-health-watchdog.ts");
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
    const envPath = join(
      mkdtempSync(join(tmpdir(), "deploy-support-env-")),
      "env",
    );
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
