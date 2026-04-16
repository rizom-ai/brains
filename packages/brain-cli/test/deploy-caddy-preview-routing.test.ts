import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const packageDir = dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);
const deployConfigPath = join(
  packageDir,
  "templates",
  "deploy",
  "kamal-deploy.yml",
);
const dockerfilePath = join(packageDir, "templates", "deploy", "Dockerfile");

describe("deploy preview host routing", () => {
  it("uses bare TLS hostnames in Kamal config", () => {
    const deployConfig = readFileSync(deployConfigPath, "utf-8");

    expect(deployConfig).toContain("- <%= ENV['BRAIN_DOMAIN'] %>");
    expect(deployConfig).toContain("- <%= ENV['PREVIEW_DOMAIN'] %>");
    expect(deployConfig).not.toContain(":80");
    expect(deployConfig).not.toContain(":81");
  });

  it("points Kamal directly at the shared webserver port", () => {
    const deployConfig = readFileSync(deployConfigPath, "utf-8");

    expect(deployConfig).toContain("app_port: 8080");
    expect(deployConfig).toContain("path: /health");
  });

  it("starts the app directly without caddy", () => {
    const dockerfile = readFileSync(dockerfilePath, "utf-8");

    expect(dockerfile).toContain("EXPOSE 8080");
    expect(dockerfile).toContain('CMD ["./node_modules/.bin/brain", "start"]');
    expect(dockerfile).not.toContain("caddy start");
    expect(dockerfile).not.toContain("deploy/Caddyfile");
  });
});
