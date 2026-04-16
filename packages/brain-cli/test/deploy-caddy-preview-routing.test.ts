import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const packageDir = dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);
const caddyfilePath = join(packageDir, "templates", "deploy", "Caddyfile");

const deployConfigPath = join(
  packageDir,
  "templates",
  "deploy",
  "kamal-deploy.yml",
);

describe("deploy preview host routing", () => {
  it("uses bare TLS hostnames in Kamal config", () => {
    const deployConfig = readFileSync(deployConfigPath, "utf-8");

    expect(deployConfig).toContain("- <%= ENV['BRAIN_DOMAIN'] %>");
    expect(deployConfig).toContain("- <%= ENV['PREVIEW_DOMAIN'] %>");
    expect(deployConfig).not.toContain(":80");
    expect(deployConfig).not.toContain(":81");
  });

  it("routes both preview.<domain> and *-preview.* hosts to the preview site inside the container", () => {
    const caddyfile = readFileSync(caddyfilePath, "utf-8");

    expect(caddyfile).toContain(
      "@preview header_regexp preview_host Host ^(?:preview\\..+|.+-preview\\..+)$",
    );
    expect(caddyfile).toContain("handle @preview {");
    expect(caddyfile).toContain("reverse_proxy localhost:4321");
  });

  it("routes the container healthcheck through caddy to the shared webserver host", () => {
    const caddyfile = readFileSync(caddyfilePath, "utf-8");

    expect(caddyfile).toContain("handle /health {");
    expect(caddyfile).toContain("reverse_proxy localhost:8080");
  });

  it("falls back to the a2a server when no production webserver is running", () => {
    const caddyfile = readFileSync(caddyfilePath, "utf-8");

    expect(caddyfile).toContain(
      "reverse_proxy localhost:8080 localhost:3334 {",
    );
    expect(caddyfile).toContain("lb_policy first");
    expect(caddyfile).toContain("lb_retries 1");
  });
});
