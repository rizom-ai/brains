import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDeployScriptPath } from "@brains/deploy-support";

import packageJson from "../package.json";

const packageDir = dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);
function readPackageFile(relativePath: string): string {
  return readFileSync(join(packageDir, relativePath), "utf8");
}

describe("@rizom/brain package metadata", () => {
  it("uses Bun-native media rendering without browser wrapper dependencies", () => {
    expect(packageJson.optionalDependencies).not.toHaveProperty(
      "playwright-core",
    );
    expect(packageJson.optionalDependencies).not.toHaveProperty("sharp");
    expect(readPackageFile("scripts/build.ts")).not.toContain("playwright");
  });

  it("publishes package-owned deploy scripts with expected runtime hooks", () => {
    const installHealthWatchdog = readPackageFile(
      "templates/deploy/scripts/install-health-watchdog.ts",
    );
    const provisionServer = readPackageFile(
      "templates/deploy/scripts/provision-server.ts",
    );
    const updateDns = readPackageFile("templates/deploy/scripts/update-dns.ts");
    const writeSshKey = readPackageFile(
      "templates/deploy/scripts/write-ssh-key.ts",
    );

    expect(installHealthWatchdog).toContain(
      "/usr/local/sbin/brains-health-watchdog",
    );
    expect(installHealthWatchdog).toContain(
      'BRAIN_WATCHDOG_LABEL = "ai.rizom.brain.watchdog"',
    );
    expect(installHealthWatchdog).toContain(
      "--filter label=${BRAIN_WATCHDOG_LABEL_FILTER}",
    );
    expect(installHealthWatchdog).not.toContain("--filter label=service ");
    expect(provisionServer).toContain('requireEnv("HCLOUD_TOKEN")');
    expect(provisionServer).toContain("https://api.hetzner.cloud/v1");
    expect(updateDns).toContain('requireEnv("CF_API_TOKEN")');
    expect(updateDns).toContain("https://api.cloudflare.com/client/v4");
    expect(writeSshKey).toContain('requireEnv("KAMAL_SSH_PRIVATE_KEY")');
    expect(writeSshKey).toContain("mode: 0o600");
  });

  it("keeps committed deploy script templates identical to @brains/deploy-support", () => {
    // templates/deploy/scripts is regenerated from @brains/deploy-support by
    // scripts/build.ts (copyDeployScripts); this guards against hand-edits.
    const scripts = [
      "install-health-watchdog.ts",
      "provision-server.ts",
      "update-dns.ts",
      "write-ssh-key.ts",
    ] as const;

    for (const script of scripts) {
      const committed = readPackageFile(
        join("templates", "deploy", "scripts", script),
      );
      const canonical = readFileSync(resolveDeployScriptPath(script), "utf8");
      expect(committed).toBe(canonical);
    }
  });

  it("publishes a package-owned public instance tsconfig preset", () => {
    const tsconfig = JSON.parse(readPackageFile("tsconfig.instance.json"));

    expect(tsconfig).toMatchObject({
      display: "Rizom Brain Instance",
      compilerOptions: {
        strict: true,
        moduleResolution: "bundler",
        jsx: "react-jsx",
        jsxImportSource: "react",
        noEmit: true,
      },
    });
  });

  it("builds console UIs into the published dist contract", () => {
    const buildScript = readPackageFile("scripts/build.ts");

    expect(packageJson.files).toContain("dist");
    expect(buildScript).toContain(
      'join(monorepoRoot, "interfaces", "web-chat")',
    );
    expect(buildScript).toContain('Bun.spawnSync(["bun", "run", "build"]');
    expect(buildScript).toContain('join(outdir, "ui")');
    expect(buildScript).toContain(
      'cpSync(webChatUiAssetPath, join(bundledWebChatUiDir, "app.js"))',
    );
    expect(buildScript).toContain(
      'const adminPackageDir = join(monorepoRoot, "plugins", "admin")',
    );
    expect(buildScript).toContain(
      'cpSync(adminUiAssetPath, join(bundledWebChatUiDir, "admin-app.js"))',
    );
    expect(buildScript).toContain(
      "const accountUiAssetPath = join(\n  adminPackageDir,",
    );
    expect(buildScript).toContain(
      'cpSync(accountUiAssetPath, join(bundledWebChatUiDir, "account-app.js"))',
    );
  });

  it("bundles package-owned onboarding markdown in dist", () => {
    const sourceDir = join(
      packageDir,
      "..",
      "..",
      "plugins",
      "onboarding",
      "content",
      "playbook",
    );

    for (const fileName of ["onboarding.md", "first-knowledge-loop.md"]) {
      expect(readPackageFile(join("dist", "onboarding", fileName))).toBe(
        readFileSync(join(sourceDir, fileName), "utf8"),
      );
    }
  });

  it("declares deploy helper scripts in the package files contract", () => {
    expect(packageJson.files).toContain("templates");
    expect(packageJson.files).toContain("tsconfig.instance.json");

    for (const relativePath of [
      "templates/deploy/scripts/install-health-watchdog.ts",
      "templates/deploy/scripts/provision-server.ts",
      "templates/deploy/scripts/update-dns.ts",
      "templates/deploy/scripts/write-ssh-key.ts",
      "tsconfig.instance.json",
    ]) {
      expect(existsSync(join(packageDir, relativePath))).toBeTrue();
    }
  });
});
