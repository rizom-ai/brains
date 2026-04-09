import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { tmpdir } from "os";
import { pushSecrets } from "../src/commands/secrets-push";

describe("secrets push", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-secrets-push-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function writeSchema(): void {
    writeFileSync(
      join(testDir, ".env.schema"),
      [
        "# ---- runtime/app vars ----",
        "AI_API_KEY=",
        "GIT_SYNC_TOKEN=",
        "",
        "# ---- deploy/provision vars ----",
        "HCLOUD_TOKEN=",
        "KAMAL_REGISTRY_PASSWORD=",
        "CF_API_TOKEN=",
        "CF_ZONE_ID=",
        "",
        "# ---- TLS cert vars (written by brain cert:bootstrap, consumed by kamal-proxy) ----",
        "CERTIFICATE_PEM=",
        "PRIVATE_KEY_PEM=",
        "",
        "# ---- secret backend bootstrap ----",
        "OP_TOKEN=",
        "",
      ].join("\n"),
    );
  }

  it("pushes env-backed secrets to GitHub and skips bootstrap/cert-only values", async () => {
    writeSchema();
    writeFileSync(
      join(testDir, ".env"),
      [
        "AI_API_KEY=sk-local",
        "GIT_SYNC_TOKEN=git-local",
        "HCLOUD_TOKEN=hc-token",
        "CF_API_TOKEN=cf-token",
        "CF_ZONE_ID=zone-id",
        "KAMAL_REGISTRY_PASSWORD=",
        "OP_TOKEN=op-token",
        "EXTRA_LOCAL_SECRET=extra-local",
        "CERTIFICATE_PEM=should-not-push",
        "",
      ].join("\n"),
    );

    const calls: Array<{ command: string; args: string[]; stdin?: string }> =
      [];
    const result = await pushSecrets(testDir, {
      env: {
        AI_API_KEY: "sk-local",
        GIT_SYNC_TOKEN: "git-local",
        HCLOUD_TOKEN: "hc-token",
        CF_API_TOKEN: "cf-token",
        CF_ZONE_ID: "zone-id",
        KAMAL_REGISTRY_PASSWORD: "",
        OP_TOKEN: "op-token",
        EXTRA_LOCAL_SECRET: "extra-local",
        CERTIFICATE_PEM: "should-not-push",
      },
      pushTo: "gh",
      runCommand: async (command, args, options) => {
        const call: { command: string; args: string[]; stdin?: string } = {
          command,
          args,
        };
        if (options?.stdin !== undefined) {
          call.stdin = options.stdin;
        }
        calls.push(call);
      },
    });

    expect(result.target).toBe("gh");
    expect(result.pushedKeys).toEqual([
      "AI_API_KEY",
      "GIT_SYNC_TOKEN",
      "HCLOUD_TOKEN",
      "CF_API_TOKEN",
      "CF_ZONE_ID",
    ]);
    expect(result.skippedKeys).toEqual(["KAMAL_REGISTRY_PASSWORD"]);
    expect(calls).toHaveLength(5);
    expect(calls[0]).toEqual({
      command: "gh",
      args: ["secret", "set", "AI_API_KEY"],
      stdin: "sk-local",
    });
    expect(calls[4]).toEqual({
      command: "gh",
      args: ["secret", "set", "CF_ZONE_ID"],
      stdin: "zone-id",
    });
  });

  it("includes extra local env values when --all is used", async () => {
    writeSchema();
    writeFileSync(
      join(testDir, ".env"),
      [
        "AI_API_KEY=sk-local",
        "GIT_SYNC_TOKEN=git-local",
        "HCLOUD_TOKEN=hc-token",
        "CF_API_TOKEN=cf-token",
        "CF_ZONE_ID=zone-id",
        "KAMAL_REGISTRY_PASSWORD=kamal-pass",
        "OP_TOKEN=op-token",
        "EXTRA_LOCAL_SECRET=extra-local",
        "CERTIFICATE_PEM=should-not-push",
        "",
      ].join("\n"),
    );

    const calls: Array<{ command: string; args: string[]; stdin?: string }> =
      [];
    const result = await pushSecrets(testDir, {
      env: {
        AI_API_KEY: "sk-local",
        GIT_SYNC_TOKEN: "git-local",
        HCLOUD_TOKEN: "hc-token",
        CF_API_TOKEN: "cf-token",
        CF_ZONE_ID: "zone-id",
        KAMAL_REGISTRY_PASSWORD: "kamal-pass",
        OP_TOKEN: "op-token",
        EXTRA_LOCAL_SECRET: "extra-local",
        CERTIFICATE_PEM: "should-not-push",
      },
      all: true,
      pushTo: "gh",
      runCommand: async (command, args, options) => {
        const call: { command: string; args: string[]; stdin?: string } = {
          command,
          args,
        };
        if (options?.stdin !== undefined) {
          call.stdin = options.stdin;
        }
        calls.push(call);
      },
    });

    expect(result.target).toBe("gh");
    expect(result.pushedKeys).toEqual([
      "AI_API_KEY",
      "GIT_SYNC_TOKEN",
      "HCLOUD_TOKEN",
      "KAMAL_REGISTRY_PASSWORD",
      "CF_API_TOKEN",
      "CF_ZONE_ID",
      "EXTRA_LOCAL_SECRET",
    ]);
    expect(result.skippedKeys).toEqual([]);
    expect(calls).toHaveLength(7);
    expect(calls[6]).toEqual({
      command: "gh",
      args: ["secret", "set", "EXTRA_LOCAL_SECRET"],
      stdin: "extra-local",
    });
  });

  it("pushes only the requested secrets when --only is used", async () => {
    writeSchema();
    writeFileSync(
      join(testDir, ".env"),
      [
        "AI_API_KEY=sk-local",
        "GIT_SYNC_TOKEN=git-local",
        "HCLOUD_TOKEN=hc-token",
        "CF_API_TOKEN=cf-token",
        "CF_ZONE_ID=zone-id",
        "KAMAL_REGISTRY_PASSWORD=kamal-pass",
        "OP_TOKEN=op-token",
        "EXTRA_LOCAL_SECRET=extra-local",
        "",
      ].join("\n"),
    );

    const calls: Array<{ command: string; args: string[]; stdin?: string }> =
      [];
    const result = await pushSecrets(testDir, {
      env: {
        AI_API_KEY: "sk-local",
        GIT_SYNC_TOKEN: "git-local",
        HCLOUD_TOKEN: "hc-token",
        CF_API_TOKEN: "cf-token",
        CF_ZONE_ID: "zone-id",
        KAMAL_REGISTRY_PASSWORD: "kamal-pass",
        OP_TOKEN: "op-token",
        EXTRA_LOCAL_SECRET: "extra-local",
      },
      only: "CF_ZONE_ID,EXTRA_LOCAL_SECRET",
      pushTo: "gh",
      runCommand: async (command, args, options) => {
        const call: { command: string; args: string[]; stdin?: string } = {
          command,
          args,
        };
        if (options?.stdin !== undefined) {
          call.stdin = options.stdin;
        }
        calls.push(call);
      },
    });

    expect(result.target).toBe("gh");
    expect(result.pushedKeys).toEqual(["CF_ZONE_ID", "EXTRA_LOCAL_SECRET"]);
    expect(result.skippedKeys).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      command: "gh",
      args: ["secret", "set", "CF_ZONE_ID"],
      stdin: "zone-id",
    });
    expect(calls[1]).toEqual({
      command: "gh",
      args: ["secret", "set", "EXTRA_LOCAL_SECRET"],
      stdin: "extra-local",
    });
  });

  it("pushes env-backed secrets to 1Password using the instance vault", async () => {
    writeSchema();
    writeFileSync(
      join(testDir, ".env"),
      [
        "AI_API_KEY=sk-local",
        "GIT_SYNC_TOKEN=git-local",
        "HCLOUD_TOKEN=hc-token",
        "CF_API_TOKEN=cf-token",
        "CF_ZONE_ID=zone-id",
        "KAMAL_REGISTRY_PASSWORD=kamal-pass",
        "",
      ].join("\n"),
    );

    const valuesByKey: Record<string, string> = {
      AI_API_KEY: "sk-local",
      GIT_SYNC_TOKEN: "git-local",
      HCLOUD_TOKEN: "hc-token",
      CF_API_TOKEN: "cf-token",
      CF_ZONE_ID: "zone-id",
      KAMAL_REGISTRY_PASSWORD: "kamal-pass",
    };

    const calls: Array<{
      command: string;
      args: string[];
      env?: NodeJS.ProcessEnv;
    }> = [];
    const vaultName = `brain-${basename(testDir)}-prod`;

    const result = await pushSecrets(testDir, {
      env: {
        AI_API_KEY: "sk-local",
        GIT_SYNC_TOKEN: "git-local",
        HCLOUD_TOKEN: "hc-token",
        CF_API_TOKEN: "cf-token",
        CF_ZONE_ID: "zone-id",
        KAMAL_REGISTRY_PASSWORD: "kamal-pass",
        OP_TOKEN: "op-token",
      },
      opToken: "op-token",
      pushTo: "1password",
      runCommand: async (command, args, options) => {
        const call: {
          command: string;
          args: string[];
          env?: NodeJS.ProcessEnv;
        } = {
          command,
          args,
        };
        if (options?.env !== undefined) {
          call.env = options.env;
        }
        calls.push(call);

        const filePath = args[2];
        const title = args[6];
        if (!filePath || !title) {
          throw new Error("Missing file path or title for 1Password push");
        }

        const expectedValue = valuesByKey[title];
        if (expectedValue === undefined) {
          throw new Error(`Missing expected value for ${title}`);
        }

        expect(readFileSync(filePath, "utf-8")).toBe(expectedValue);
      },
    });

    expect(result.target).toBe("1password");
    expect(result.vaultName).toBe(vaultName);
    expect(result.pushedKeys).toEqual([
      "AI_API_KEY",
      "GIT_SYNC_TOKEN",
      "HCLOUD_TOKEN",
      "KAMAL_REGISTRY_PASSWORD",
      "CF_API_TOKEN",
      "CF_ZONE_ID",
    ]);
    expect(result.skippedKeys).toEqual([]);
    expect(calls).toHaveLength(6);

    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall?.command).toBe("op");
    expect(firstCall?.args[0]).toBe("document");
    expect(firstCall?.args[1]).toBe("create");
    expect(firstCall?.args[3]).toBe("--vault");
    expect(firstCall?.args[4]).toBe(vaultName);
    expect(firstCall?.args[5]).toBe("--title");
    expect(firstCall?.args[6]).toBe("AI_API_KEY");
    expect(firstCall?.env).toEqual({ OP_SERVICE_ACCOUNT_TOKEN: "op-token" });

    const skippedSecretCall = calls[3];
    expect(skippedSecretCall?.args[6]).toBe("KAMAL_REGISTRY_PASSWORD");

    const lastCall = calls[5];
    expect(lastCall?.args[6]).toBe("CF_ZONE_ID");
  });

  it("supports dry-run without contacting a backend or requiring OP_TOKEN", async () => {
    writeSchema();
    writeFileSync(
      join(testDir, ".env"),
      [
        "AI_API_KEY=sk-local",
        "GIT_SYNC_TOKEN=git-local",
        "HCLOUD_TOKEN=hc-token",
        "CF_API_TOKEN=cf-token",
        "CF_ZONE_ID=zone-id",
        "KAMAL_REGISTRY_PASSWORD=kamal-pass",
        "EXTRA_LOCAL_SECRET=extra-local",
        "",
      ].join("\n"),
    );

    const logs: string[] = [];
    const calls: Array<{ command: string; args: string[] }> = [];

    const result = await pushSecrets(testDir, {
      env: {
        AI_API_KEY: "sk-local",
        GIT_SYNC_TOKEN: "git-local",
        HCLOUD_TOKEN: "hc-token",
        CF_API_TOKEN: "cf-token",
        CF_ZONE_ID: "zone-id",
        KAMAL_REGISTRY_PASSWORD: "kamal-pass",
        EXTRA_LOCAL_SECRET: "extra-local",
      },
      all: true,
      dryRun: true,
      pushTo: "1password",
      logger: (message) => logs.push(message),
      runCommand: async (command, args) => {
        calls.push({ command, args });
      },
    });

    expect(result.dryRun).toBe(true);
    expect(result.target).toBe("1password");
    expect(result.vaultName).toContain("brain-");
    expect(result.pushedKeys).toEqual([
      "AI_API_KEY",
      "GIT_SYNC_TOKEN",
      "HCLOUD_TOKEN",
      "KAMAL_REGISTRY_PASSWORD",
      "CF_API_TOKEN",
      "CF_ZONE_ID",
      "EXTRA_LOCAL_SECRET",
    ]);
    expect(result.skippedKeys).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(logs[0]).toContain("Dry run: would push 7 secrets");
    expect(logs[1]).toContain(
      "Secrets: AI_API_KEY, GIT_SYNC_TOKEN, HCLOUD_TOKEN, KAMAL_REGISTRY_PASSWORD, CF_API_TOKEN, CF_ZONE_ID, EXTRA_LOCAL_SECRET",
    );
  });
});
