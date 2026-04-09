import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const caddyfilePath = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "deploy",
  "docker",
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
});
