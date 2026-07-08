import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backendBootstrapEnvSchema,
  deployProvisionEnvSchema,
  deployScriptNames,
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
    expect(renderKamalDeploy({ serviceName: "brain" })).toContain(
      "service: brain",
    );
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
});
