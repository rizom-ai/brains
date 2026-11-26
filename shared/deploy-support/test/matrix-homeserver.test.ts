import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "@brains/utils/run-process";
import { parse as parseYaml } from "yaml";
import {
  deployScriptNames,
  isStaleDeployMounts,
  renderDeployWorkflow,
  renderExtractBrainConfigScript,
  renderKamalDeploy,
} from "../src";
import { buildHomeserverReloadScript } from "../src/deploy-scripts/reload-homeserver";
import {
  renderHomeserverBackupStep,
  renderPredeployBackupRemoteScript,
} from "../src/deploy-scripts/create-predeploy-backup";

const deploy = renderKamalDeploy({ serviceName: "rover" });

/**
 * The template as Kamal sees it once ERB has run: conditionals kept or
 * dropped, and the remaining ERB tags replaced by stand-in values.
 */
function evaluated(env: {
  LOCAL_MODELS?: string;
  MATRIX_ENABLED?: string;
}): unknown {
  const kept = deploy
    .split("\n")
    .reduce<{ lines: string[]; skipping: boolean }>(
      ({ lines, skipping }, line) => {
        const opening = line.match(/^\s*# <% if (.+) %>$/);
        if (opening) {
          const condition = opening[1] ?? "";
          const localModels = Boolean(env.LOCAL_MODELS);
          const matrix = env.MATRIX_ENABLED === "true";
          const holds = condition.includes("||")
            ? localModels || matrix
            : condition.includes("LOCAL_MODELS")
              ? localModels
              : condition.includes("MATRIX_ENABLED")
                ? matrix
                : condition.includes("WWW_DOMAIN")
                  ? false
                  : true;
          return { lines, skipping: !holds };
        }
        if (/^\s*# <% end %>$/.test(line)) return { lines, skipping: false };
        return skipping
          ? { lines, skipping }
          : { lines: [...lines, line], skipping };
      },
      { lines: [], skipping: false },
    )
    .lines.join("\n")
    .replace(/<%= ENV\['BRAIN_DOMAIN'\] %>/g, "brain.example.com")
    .replace(/<%= ENV\['[A-Z_]+'\] %>/g, "value");
  return parseYaml(kept);
}

describe("the Matrix homeserver accessory", () => {
  it("runs the pinned homeserver on the directory it shares with the brain, only with the matrix bundle", () => {
    const withMatrix = evaluated({ MATRIX_ENABLED: "true" });
    expect(withMatrix).toMatchObject({
      accessories: {
        matrix: {
          image: "ghcr.io/matrix-construct/tuwunel:v2.0.0",
          env: { clear: { TUWUNEL_CONFIG: "/data/tuwunel.toml" } },
          volumes: ["/opt/brain-matrix:/data"],
        },
      },
    });
    expect(evaluated({})).not.toHaveProperty("accessories");
  });

  it("gives the brain the homeserver's address and the shared directory, and no secret", () => {
    const config = evaluated({ MATRIX_ENABLED: "true" });
    expect(config).toMatchObject({
      env: {
        clear: {
          MATRIX_HOMESERVER_URL: "http://rover-matrix:6167",
          MATRIX_BASE_URL: "http://rover-matrix:6167",
          MATRIX_SERVER_NAME: "brain.example.com",
          MATRIX_USER_ID: "@_brain:brain.example.com",
          MATRIX_DATA_DIR: "/app/matrix",
        },
      },
      volumes: expect.arrayContaining(["/opt/brain-matrix:/app/matrix"]),
    });
    expect(deploy).not.toMatch(/MATRIX_[A-Z_]*(PASSWORD|TOKEN|SECRET)/);
  });

  it("lets the proxy hold a 30-second /sync open, only with the matrix bundle", () => {
    expect(evaluated({ MATRIX_ENABLED: "true" })).toMatchObject({
      proxy: { response_timeout: 120 },
    });
    expect(evaluated({})).not.toMatchObject({
      proxy: { response_timeout: 120 },
    });
  });

  it("keeps both accessories when local models and the homeserver run together", () => {
    expect(
      evaluated({ LOCAL_MODELS: "qwen3:4b", MATRIX_ENABLED: "true" }),
    ).toMatchObject({
      accessories: {
        models: expect.objectContaining({ image: expect.any(String) }),
        matrix: expect.objectContaining({ image: expect.any(String) }),
      },
    });
  });

  it("treats a copy generated before the homeserver as stale", () => {
    const before = deploy
      .split("\n")
      .reduce<{ lines: string[]; inside: boolean }>(
        ({ lines, inside }, line) => {
          if (/^\s*# <% if ENV\['MATRIX_ENABLED'\]/.test(line)) {
            return { lines, inside: true };
          }
          if (inside) return { lines, inside: !/^\s*# <% end %>$/.test(line) };
          return { lines: [...lines, line], inside };
        },
        { lines: [], inside: false },
      )
      .lines.filter((line) => line !== "  - /opt/brain-matrix:/app/matrix")
      .join("\n")
      .replace(
        "# <% if (ENV['LOCAL_MODELS'] && !ENV['LOCAL_MODELS'].empty?) || ENV['MATRIX_ENABLED'] == 'true' %>\naccessories:\n# <% end %>\n# <% if ENV['LOCAL_MODELS'] && !ENV['LOCAL_MODELS'].empty? %>\n",
        "# <% if ENV['LOCAL_MODELS'] && !ENV['LOCAL_MODELS'].empty? %>\naccessories:\n",
      );
    expect(before).not.toContain("MATRIX");
    expect(isStaleDeployMounts(before, "rover")).toBe(true);
    expect(isStaleDeployMounts(deploy, "rover")).toBe(false);
  });
});

describe("the standalone deploy", () => {
  it("turns the homeserver on when brain.yaml's bundles include matrix", () => {
    const script = renderExtractBrainConfigScript();
    expect(script).toContain(
      'Array(config["bundles"]).map(&:to_s).include?("matrix")',
    );
    expect(script).toContain('file.puts("MATRIX_ENABLED=#{matrix_enabled}")');
  });
});

describe("restarting the homeserver on a new configuration", () => {
  async function runReload(dir: string, fakeBin: string): Promise<string[]> {
    const calls = join(dir, "docker-calls");
    await writeFile(
      join(fakeBin, "docker"),
      `#!/usr/bin/env bash\necho "$@" >> "${calls}"\n`,
      { mode: 0o755 },
    );
    const result = await runProcess(["bash", "-s"], {
      stdin: buildHomeserverReloadScript("rover", dir, { sudo: false }),
      env: { ...process.env, PATH: `${fakeBin}:${process.env["PATH"] ?? ""}` },
    });
    expect(result.exitCode).toBe(0);
    return (await readFile(calls, "utf8").catch(() => ""))
      .split("\n")
      .filter(Boolean);
  }

  it("records the first configuration, leaves an unchanged one alone, and restarts the homeserver on a changed one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "brains-matrix-reload-"));
    const fakeBin = await mkdtemp(join(tmpdir(), "brains-fake-docker-"));
    await writeFile(join(dir, "tuwunel.toml"), "first");

    expect(await runReload(dir, fakeBin)).toEqual([]);
    expect(await runReload(dir, fakeBin)).toEqual([]);
    await writeFile(join(dir, "tuwunel.toml"), "second");
    expect(await runReload(dir, fakeBin)).toEqual(["restart rover-matrix"]);
    expect(await runReload(dir, fakeBin)).toEqual(["restart rover-matrix"]);
  });

  it("does nothing before the brain has written a configuration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "brains-matrix-reload-"));
    const fakeBin = await mkdtemp(join(tmpdir(), "brains-fake-docker-"));

    expect(await runReload(dir, fakeBin)).toEqual([]);
  });

  it("runs after Kamal has started the brain, only with the homeserver", () => {
    const workflow = renderDeployWorkflow({
      secretNames: [],
      bootstrapSecrets: [],
    });
    const reload = workflow.indexOf("deploy/scripts/reload-homeserver.ts");
    expect(reload).toBeGreaterThan(workflow.indexOf("kamal setup --skip-push"));
    expect(workflow).toContain("if: env.MATRIX_ENABLED == 'true'");
    expect(deployScriptNames).toContain("reload-homeserver.ts");
  });
});

describe("backing up the homeserver before a deploy", () => {
  async function runBackupStep(options: {
    running: boolean;
    producesBackup: boolean;
  }): Promise<{ exitCode: number; stderr: string; backups: string[] }> {
    const dir = await mkdtemp(join(tmpdir(), "brains-matrix-backup-"));
    const fakeBin = await mkdtemp(join(tmpdir(), "brains-fake-docker-"));
    await mkdir(join(dir, "backup", "meta"), { recursive: true });
    await writeFile(join(dir, "backup", "meta", "1"), "");
    await writeFile(
      join(fakeBin, "docker"),
      `#!/usr/bin/env bash
case "$1" in
  ps) ${options.running ? 'echo "rover-matrix"' : "true"} ;;
  kill) ${options.producesBackup ? `touch "${dir}/backup/meta/2" && rm "${dir}/backup/meta/1"` : "true"} ;;
esac
`,
      { mode: 0o755 },
    );
    const result = await runProcess(["bash", "-s"], {
      stdin: `set -euo pipefail\nSERVICE_NAME=rover\n${renderHomeserverBackupStep({ dir, waitSeconds: 2 })}`,
      env: { ...process.env, PATH: `${fakeBin}:${process.env["PATH"] ?? ""}` },
    });
    const backups = (await readdir(join(dir, "backup", "meta"))).sort();
    return { exitCode: result.exitCode, stderr: result.stderr, backups };
  }

  it("takes a fresh online backup of a running homeserver", async () => {
    expect(
      await runBackupStep({ running: true, producesBackup: true }),
    ).toMatchObject({
      exitCode: 0,
      backups: ["2"],
    });
  });

  it("refuses the deploy when no new backup appears", async () => {
    const result = await runBackupStep({
      running: true,
      producesBackup: false,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("the homeserver's backup did not appear");
  });

  it("does nothing when no homeserver runs", async () => {
    expect(
      await runBackupStep({ running: false, producesBackup: false }),
    ).toMatchObject({
      exitCode: 0,
      backups: ["1"],
    });
  });

  it("runs inside the predeploy backup", () => {
    expect(renderPredeployBackupRemoteScript()).toContain(
      'homeserver="${SERVICE_NAME}-matrix"',
    );
  });
});
