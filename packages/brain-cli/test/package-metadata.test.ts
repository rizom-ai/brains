import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { SourceMap } from "node:module";
import { ok } from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deployScriptNames,
  resolveDeployScriptPath,
} from "@brains/deploy-support";
import { z } from "@brains/utils/zod";

import packageJson from "../package.json";

const studioAssetManifestSchema = z.object({
  version: z.literal(2),
  entrypoints: z.object({ script: z.string(), stylesheet: z.string() }),
  assets: z.record(z.string(), z.string()),
});

const packageDir = dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);
function readPackageFile(relativePath: string): string {
  return readFileSync(join(packageDir, relativePath), "utf8");
}

describe("@rizom/brain package metadata", () => {
  it("publishes only the canonical brain command", () => {
    expect(packageJson.bin).toEqual({
      brain: "./dist/brain.js",
    });
  });

  it("loads shared CLI/model chunks beside provisioned runtime resources", () => {
    const cli = readPackageFile("dist/brain.js");
    const model = readPackageFile("dist/model.js");
    const chunks = (source: string): string[] =>
      [
        ...source.matchAll(/["'](\.\/brain-runtime-[A-Za-z0-9_-]+\.js)["']/g),
      ].map((match) => match[1] ?? "");
    const cliChunks = chunks(cli);
    expect(cli.startsWith("#!/usr/bin/env bun\n")).toBe(true);
    expect(cliChunks.length).toBeGreaterThan(0);
    expect(chunks(model).some((chunk) => cliChunks.includes(chunk))).toBe(true);
    for (const chunk of new Set([...cliChunks, ...chunks(model)])) {
      expect(existsSync(join(packageDir, "dist", chunk))).toBe(true);
    }
    for (const name of [
      "auth-service",
      "entity-service",
      "conversation-service",
      "job-queue",
      "runtime-state",
    ]) {
      expect(
        existsSync(
          join(packageDir, "dist", "migrations", name, "meta", "_journal.json"),
        ),
      ).toBe(true);
    }
    expect(
      existsSync(join(packageDir, "dist", "turso-worker", "worker.ts")),
    ).toBe(true);
    expect(existsSync(join(packageDir, "dist", "ui", "app.js"))).toBe(true);
    expect(
      existsSync(join(packageDir, "dist", "onboarding", "onboarding.md")),
    ).toBe(true);
  });

  it("retains usable server maps outside automatic runtime lookup and keeps browser maps linked", () => {
    const maps = readdirSync(
      join(packageDir, "dist", "server-source-maps"),
    ).filter((name) => name.endsWith(".js.map"));
    expect(maps).toContain("brain.js.map");
    expect(maps).toContain("model.js.map");
    expect(maps.some((name) => name.startsWith("brain-runtime-"))).toBe(true);
    for (const name of maps) {
      const generated = name.slice(0, -4);
      expect(existsSync(join(packageDir, "dist", generated))).toBe(true);
      expect(existsSync(join(packageDir, "dist", name))).toBe(false);
      expect(readPackageFile(`dist/${generated}`)).not.toContain(
        "//# sourceMappingURL=",
      );
      const map = z
        .object({
          version: z.literal(3),
          file: z.string(),
          sourceRoot: z.string(),
          sources: z.array(z.string()),
          sourcesContent: z.array(z.string().nullable()),
          names: z.array(z.string()),
          mappings: z.string(),
        })
        .passthrough()
        .parse(JSON.parse(readPackageFile(`dist/server-source-maps/${name}`)));
      expect(map.file).toBe(`../${generated}`);
      expect(map.sourceRoot).toBe("../");
      expect(map.sourcesContent).toHaveLength(map.sources.length);
      for (const source of map.sources) {
        const oldBase = new URL(
          "./",
          new URL(`../dist/${name}`, import.meta.url),
        );
        const newBase = new URL(
          map.sourceRoot,
          new URL(`../dist/server-source-maps/${name}`, import.meta.url),
        );
        expect(new URL(source, newBase).href).toBe(
          new URL(source, oldBase).href,
        );
      }
      const line = map.mappings
        .split(";")
        .findIndex((value) => value.length > 0);
      if (line >= 0) {
        // Node's type omits v3's null source-content entries; position lookup
        // uses mappings, not source text. The retained map itself is unchanged.
        const entry = new SourceMap({
          ...map,
          sourcesContent: map.sourcesContent.map((content) => content ?? ""),
        }).findEntry(
          line,
          readPackageFile(`dist/${generated}`).split("\n")[line]?.length ?? 0,
        );
        ok("originalSource" in entry && "originalLine" in entry);
        expect(entry.originalSource).toBeString();
        expect(entry.originalLine).toBeGreaterThanOrEqual(0);
      }
    }
    expect(readPackageFile("dist/chat.js")).toContain(
      "//# sourceMappingURL=chat.js.map",
    );
    expect(existsSync(join(packageDir, "dist", "chat.js.map"))).toBe(true);
  });

  it("declares the Turso engine as a native optional dependency", () => {
    expect(packageJson.optionalDependencies).toMatchObject({
      "@tursodatabase/database": expect.any(String),
    });
  });

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
    //
    // Derived rather than listed here. This template carries a subset of
    // `deployScriptNames` — it provisions a single brain and has no use for
    // the secrets scripts — and a hand-written list would let a script added
    // to the subset go unchecked. `deploy-support`'s own inventory test keeps
    // `deployScriptNames` complete, so filtering it by what this template
    // ships covers everything either side can add.
    const scriptDir = join(packageDir, "templates", "deploy", "scripts");
    const scripts = deployScriptNames.filter((script) =>
      existsSync(join(scriptDir, script)),
    );

    expect(scripts.length).toBeGreaterThan(0);

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
    expect(buildScript).toContain('await Bun.spawn(["bun", "run", "build"]');
    expect(buildScript).toContain('join(outdir, "ui")');
    expect(buildScript).toContain(
      'cpSync(webChatUiAssetPath, join(bundledWebChatUiDir, "app.js"))',
    );
    expect(buildScript).toContain(
      'cpSync(webChatUiStylesheetPath, join(bundledWebChatUiDir, "app.css"))',
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
    expect(manifest.entrypoints.script).toMatch(
      /^studio-app-[a-zA-Z0-9]+\.js$/,
    );
    expect(manifest.entrypoints.stylesheet).toMatch(
      /^studio-app-[a-zA-Z0-9]+\.css$/,
    );
    expect(manifest.assets[manifest.entrypoints.script]).toBe(
      manifest.entrypoints.script,
    );
    expect(manifest.assets[manifest.entrypoints.stylesheet]).toBe(
      manifest.entrypoints.stylesheet,
    );
    expect(manifest.assets["app.js"]).toBeUndefined();
    expect(manifest.assets["app.css"]).toBeUndefined();
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
      "templates/deploy/scripts/create-predeploy-backup.ts",
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
