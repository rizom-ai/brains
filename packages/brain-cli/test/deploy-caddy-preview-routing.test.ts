import { describe, expect, it } from "bun:test";
import deployConfig from "@brains/utils/deploy-templates/kamal-deploy.yml" with { type: "text" };
import dockerfile from "@brains/utils/deploy-templates/Dockerfile" with { type: "text" };

describe("deploy preview host routing", () => {
  it("uses bare TLS hostnames in Kamal config", () => {
    expect(deployConfig).toContain("- <%= ENV['BRAIN_DOMAIN'] %>");
    expect(deployConfig).toContain("- <%= ENV['PREVIEW_DOMAIN'] %>");
    expect(deployConfig).not.toContain(":80");
    expect(deployConfig).not.toContain(":81");
  });

  it("points Kamal directly at the shared webserver port", () => {
    expect(deployConfig).toContain("app_port: 8080");
    expect(deployConfig).toContain("path: /health");
  });

  it("starts the app directly without caddy", () => {
    expect(dockerfile).toContain("EXPOSE 8080");
    expect(dockerfile).toContain('CMD ["./node_modules/.bin/brain", "start"]');
    expect(dockerfile).not.toContain("caddy start");
    expect(dockerfile).not.toContain("deploy/Caddyfile");
  });
});
