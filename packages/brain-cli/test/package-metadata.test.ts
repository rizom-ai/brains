import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../package.json";

const packageDir = dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);
function readPackageFile(relativePath: string): string {
  return readFileSync(join(packageDir, relativePath), "utf8");
}

describe("@rizom/brain package metadata", () => {
  it("declares media renderer runtime dependencies", () => {
    expect(packageJson.optionalDependencies).toMatchObject({
      "playwright-core": expect.any(String),
      sharp: expect.any(String),
    });
  });

  it("publishes package-owned deploy scripts with expected runtime hooks", () => {
    const provisionServer = readPackageFile(
      "templates/deploy/scripts/provision-server.ts",
    );
    const updateDns = readPackageFile("templates/deploy/scripts/update-dns.ts");
    const writeSshKey = readPackageFile(
      "templates/deploy/scripts/write-ssh-key.ts",
    );

    expect(provisionServer).toContain('requireEnv("HCLOUD_TOKEN")');
    expect(provisionServer).toContain("https://api.hetzner.cloud/v1");
    expect(updateDns).toContain('requireEnv("CF_API_TOKEN")');
    expect(updateDns).toContain("https://api.cloudflare.com/client/v4");
    expect(writeSshKey).toContain('requireEnv("KAMAL_SSH_PRIVATE_KEY")');
    expect(writeSshKey).toContain("mode: 0o600");
  });

  it("publishes a package-owned public instance tsconfig preset", () => {
    const tsconfig = JSON.parse(readPackageFile("tsconfig.instance.json"));

    expect(tsconfig).toMatchObject({
      display: "Rizom Brain Instance",
      compilerOptions: {
        strict: true,
        moduleResolution: "bundler",
        jsx: "react-jsx",
        jsxImportSource: "preact",
        noEmit: true,
      },
    });
  });

  it("declares deploy helper scripts in the package files contract", () => {
    expect(packageJson.files).toContain("templates");
    expect(packageJson.files).toContain("tsconfig.instance.json");

    for (const relativePath of [
      "templates/deploy/scripts/provision-server.ts",
      "templates/deploy/scripts/update-dns.ts",
      "templates/deploy/scripts/write-ssh-key.ts",
      "tsconfig.instance.json",
    ]) {
      expect(existsSync(join(packageDir, relativePath))).toBeTrue();
    }
  });
});
