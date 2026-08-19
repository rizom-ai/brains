import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { healthWatchdogScript } from "@brains/deploy-support/health-watchdog";

import {
  assertHealthWatchdogSmokeTarget,
  renderHealthWatchdogSmokeRemoteScript,
  runHealthWatchdogSmoke,
} from "../src/health-watchdog-smoke";
import type { StressCommandRunner } from "../src/stress-command";

async function createSmokePilotRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "brains-ops-watchdog-smoke-test-"));
  const files = {
    "pilot.yaml": `brainVersion: 0.2.0-alpha.260
bundleContract: capability-bundles-v1
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1testpublickey
`,
    "users/smoke.yaml": `handle: smoke
discord:
  enabled: false
`,
    "cohorts/smoke.yaml": `members:
  - smoke
`,
  } satisfies Record<string, string>;
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return root;
}

describe("health watchdog fleet smoke", () => {
  it("renders valid remote Bash with the canonical packaged watchdog", () => {
    const script = renderHealthWatchdogSmokeRemoteScript();
    const syntax = spawnSync("bash", ["-n"], {
      input: script,
      encoding: "utf8",
    });

    expect(syntax.status).toBe(0);
    expect(syntax.stderr).toBe("");
    expect(script).not.toContain("__WATCHDOG_PAYLOAD_BASE64__");
    expect(script).not.toContain("__WATCHDOG_LABEL_FILTER__");
    expect(script).toContain(
      'watchdog_label_filter="ai.rizom.brain.watchdog=true"',
    );
    expect(script).toContain(
      'cmp -s "$expected_watchdog" "$installed_watchdog"',
    );
    expect(script).toContain('    "$installed_watchdog" \\');
    const encodedPayload = script.match(
      /watchdog_payload_base64="([A-Za-z0-9+/=]+)"/,
    )?.[1];
    expect(encodedPayload).toBeDefined();
    expect(Buffer.from(encodedPayload ?? "", "base64").toString("utf8")).toBe(
      healthWatchdogScript,
    );
  });

  it("accepts only an explicitly confirmed smoke fleet target", () => {
    expect(() =>
      assertHealthWatchdogSmokeTarget({
        handle: "smoke",
        domain: "smoke.rizom.ai",
        confirmation: "watchdog-smoke:smoke",
        runId: "gha-123-1",
      }),
    ).not.toThrow();
    expect(() =>
      assertHealthWatchdogSmokeTarget({
        handle: "alice",
        domain: "alice.rizom.ai",
        confirmation: "watchdog-smoke:alice",
        runId: "gha-123-1",
      }),
    ).toThrow("smoke-only");
    expect(() =>
      assertHealthWatchdogSmokeTarget({
        handle: "smoke",
        domain: "smoke.rizom.ai",
        confirmation: "yes",
        runId: "gha-123-1",
      }),
    ).toThrow("--confirm watchdog-smoke:smoke");
    expect(() =>
      assertHealthWatchdogSmokeTarget({
        handle: "smoke",
        domain: "smoke.rizom.ai",
        confirmation: "watchdog-smoke:smoke",
        runId: "../unsafe",
      }),
    ).toThrow("run ID is invalid");
  });

  it("resolves the smoke fleet host and preserves workflow evidence", async () => {
    const rootDir = await createSmokePilotRepo();
    const artifactsDir = join(rootDir, "artifacts");
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const runner: StressCommandRunner = async (command, args, options) => {
      calls.push({ command, args });
      if (command === "ssh-keyscan") {
        return {
          exitCode: 0,
          stdout: "203.0.113.10 ssh-ed25519 AAAATEST\n",
          stderr: "",
        };
      }
      if (command === "scp") {
        await writeFile(join(artifactsDir, "summary.txt"), "success=true\n");
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      if (command === "ssh") {
        expect(options?.stdin).toContain("watchdog_label_filter=");
        return { exitCode: 0, stdout: "PASS\n", stderr: "" };
      }
      throw new Error(`Unexpected command: ${command}`);
    };
    const requestedUrls: string[] = [];

    const result = await runHealthWatchdogSmoke({
      rootDir,
      handle: "smoke",
      confirmation: "watchdog-smoke:smoke",
      runId: "gha-123-1",
      artifactsDir,
      env: {
        HCLOUD_TOKEN: "hetzner-token",
        KAMAL_SSH_PRIVATE_KEY: "PRIVATE KEY",
      },
      fetchImpl(input) {
        requestedUrls.push(input.toString());
        return Promise.resolve(
          Response.json({
            servers: [
              {
                status: "running",
                public_net: { ipv4: { ip: "203.0.113.10" } },
              },
            ],
          }),
        );
      },
      commandRunner: runner,
      logger: () => undefined,
    });

    expect(result).toMatchObject({
      success: true,
      runId: "gha-123-1",
      artifactsDir,
      target: {
        handle: "smoke",
        domain: "smoke.rizom.ai",
        serverIp: "203.0.113.10",
      },
    });
    expect(requestedUrls[0]).toContain("label_selector=brain%3Drover-smoke");
    expect(calls.map((call) => call.command)).toEqual([
      "ssh-keyscan",
      "ssh",
      "scp",
      "ssh",
    ]);
    expect(calls[1]?.args).toContain("run");
    expect(calls[3]?.args).toContain("cleanup");
  });

  it("fails closed when scp succeeds without the required remote summary", async () => {
    const rootDir = await createSmokePilotRepo();
    const calls: string[] = [];
    const runner: StressCommandRunner = async (command) => {
      calls.push(command);
      if (command === "ssh-keyscan") {
        return {
          exitCode: 0,
          stdout: "203.0.113.10 ssh-ed25519 AAAATEST\n",
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    expect(
      runHealthWatchdogSmoke({
        rootDir,
        handle: "smoke",
        confirmation: "watchdog-smoke:smoke",
        runId: "gha-124-1",
        env: {
          HCLOUD_TOKEN: "hetzner-token",
          KAMAL_SSH_PRIVATE_KEY: "PRIVATE KEY",
        },
        fetchImpl() {
          return Promise.resolve(
            Response.json({
              servers: [
                {
                  status: "running",
                  public_net: { ipv4: { ip: "203.0.113.10" } },
                },
              ],
            }),
          );
        },
        commandRunner: runner,
        logger: () => undefined,
      }),
    ).rejects.toThrow("evidence is missing summary.txt");
    expect(calls).toEqual(["ssh-keyscan", "ssh", "scp", "ssh"]);
  });
});
