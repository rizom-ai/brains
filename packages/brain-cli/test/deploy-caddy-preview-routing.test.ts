import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const caddyfilePath = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "shared",
  "utils",
  "src",
  "deploy-templates",
  "Caddyfile",
);

const deployConfigPath = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "apps",
  "rizom-ai",
  "config",
  "deploy.yml",
);

describe("deploy preview host routing", () => {
  it("uses bare TLS hostnames in Kamal config", () => {
    const deployConfig = readFileSync(deployConfigPath, "utf-8");

    expect(deployConfig).toContain("- <%= ENV['BRAIN_DOMAIN'] %>");
    expect(deployConfig).toContain("- preview.<%= ENV['BRAIN_DOMAIN'] %>");
    expect(deployConfig).not.toContain(":80");
    expect(deployConfig).not.toContain(":81");
  });

  it("routes preview.* hosts to the preview site inside the container", () => {
    const caddyfile = readFileSync(caddyfilePath, "utf-8");

    expect(caddyfile).toContain("@preview host preview.*");
    expect(caddyfile).toContain("handle @preview {");
    expect(caddyfile).toContain("reverse_proxy localhost:4321");
  });

  it("routes the container healthcheck through caddy to the mcp server", () => {
    const caddyfile = readFileSync(caddyfilePath, "utf-8");

    expect(caddyfile).toContain("handle /health {");
    expect(caddyfile).toContain("reverse_proxy localhost:3333");
  });

  it("redirects bare / to the agent card before the production fallback", () => {
    const caddyfile = readFileSync(caddyfilePath, "utf-8");

    expect(caddyfile).toContain("@root path /");
    expect(caddyfile).toContain("handle @root {");
    expect(caddyfile).toContain("redir /.well-known/agent-card.json 302");
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
