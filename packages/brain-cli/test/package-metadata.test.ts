import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDeployScriptPath } from "@brains/deploy-support";
import { z } from "@brains/utils/zod";

import packageJson from "../package.json";

const studioAssetManifestSchema = z.object({
  version: z.literal(1),
  assets: z.record(z.string(), z.string()),
});

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

  it("contains owned development and one-shot runner process trees", () => {
    for (const scriptName of [
      "start:minimal",
      "start:unified-inbox",
      "start:personal",
      "start:publishing",
      "start:team",
    ] as const) {
      expect(packageJson.scripts[scriptName]).toContain(
        "exec bun --no-orphans run",
      );
    }

    const operateSource = readPackageFile("src/commands/operate.ts");
    expect(operateSource).toContain(
      'const runnerArgs = [\n    "--no-orphans",\n    "run",',
    );
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
      "cpSync(studioUiDirectory, bundledWebChatUiDir, { recursive: true })",
    );
    expect(buildScript).toContain("studio-asset-manifest.json");
    expect(buildScript).not.toContain("Building bundled Admin console UI");
    expect(buildScript).not.toContain("adminUiAssetPath");
    expect(buildScript).not.toContain("accountUiAssetPath");
  });

  it("copies every generated Studio entry and lazy chunk into packaged dist", () => {
    const manifest = studioAssetManifestSchema.parse(
      JSON.parse(readPackageFile("dist/ui/studio-asset-manifest.json")),
    );
    expect(manifest.assets["app.js"]).toBe("studio-app.js");
    expect(
      Object.keys(manifest.assets).some((asset) =>
        /^studio-chunks\/account-view-[A-Za-z0-9]+\.js$/.test(asset),
      ),
    ).toBe(true);
    for (const file of Object.values(manifest.assets)) {
      expect(existsSync(join(packageDir, "dist", "ui", file)), file).toBe(true);
    }
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
