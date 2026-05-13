import { describe, expect, it } from "bun:test";
import {
  backendBootstrapEnvSchema,
  deployProvisionEnvSchema,
  deployScriptNames,
  renderDockerfile,
  renderExtractBrainConfigScript,
  renderKamalDeploy,
  resolveDeployScriptPath,
  tlsCertEnvSchema,
} from "../src/index";

describe("deploy templates", () => {
  it("renders shared Docker and Kamal templates", () => {
    expect(renderDockerfile()).toContain("EXPOSE 8080");
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

  it("resolves deploy script source paths", () => {
    expect(deployScriptNames).toContain("provision-server.ts");
    expect(resolveDeployScriptPath("provision-server.ts")).toContain(
      "deploy-scripts/provision-server.ts",
    );
  });
});
