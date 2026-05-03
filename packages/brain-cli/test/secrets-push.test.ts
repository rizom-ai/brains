import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
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
        "# @required @sensitive",
        "HCLOUD_TOKEN=",
        "# @required @sensitive",
        "KAMAL_REGISTRY_PASSWORD=",
        "# @required @sensitive",
        "CF_API_TOKEN=",
        "# @required",
        "CF_ZONE_ID=",
        "",
        "# ---- TLS cert vars (written by brain cert:bootstrap, consumed by kamal-proxy) ----",
        "CERTIFICATE_PEM=",
        "PRIVATE_KEY_PEM=",
        "",
      ].join("\n"),
    );
  }

  function writeDryRunSchema(): void {
    writeFileSync(
      join(testDir, ".env.schema"),
      [
        "# @required @sensitive",
        "AI_API_KEY=",
        "",
        "# Optional image key",
        "AI_IMAGE_KEY=",
        "",
        "# @required @sensitive",
        "HCLOUD_TOKEN=",
        "",
        "# Optional LinkedIn access token",
        "LINKEDIN_ACCESS_TOKEN=",
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
        "EXTRA_LOCAL_SECRET=extra-local",
        "CERTIFICATE_PEM=should-not-push",
        "",
      ].join("\n"),
    );

    const logs: string[] = [];
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
        EXTRA_LOCAL_SECRET: "extra-local",
        CERTIFICATE_PEM: "should-not-push",
      },
      pushTo: "gh",
      logger: (message) => logs.push(message),
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
    expect(logs).toContain("Required before first deploy (1):");
    expect(logs).toContain("  - KAMAL_REGISTRY_PASSWORD");
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

  it("supports dry-run without contacting a backend", async () => {
    writeDryRunSchema();
    writeFileSync(join(testDir, ".env"), "AI_API_KEY=sk-local\n");

    const logs: string[] = [];
    const calls: Array<{ command: string; args: string[] }> = [];

    const result = await pushSecrets(testDir, {
      env: {
        AI_API_KEY: "sk-local",
      },
      dryRun: true,
      pushTo: "gh",
      logger: (message) => logs.push(message),
      runCommand: async (command, args) => {
        calls.push({ command, args });
      },
    });

    expect(result.dryRun).toBe(true);
    expect(result.target).toBe("gh");
    expect(result.pushedKeys).toEqual(["AI_API_KEY"]);
    expect(result.skippedKeys).toEqual([
      "AI_IMAGE_KEY",
      "HCLOUD_TOKEN",
      "LINKEDIN_ACCESS_TOKEN",
    ]);
    expect(calls).toHaveLength(0);
    expect(logs[0]).toContain("Dry run: would push 1 secrets");
    expect(logs[1]).toContain("Secrets: AI_API_KEY");
    expect(logs).toContain("Required before first deploy (1):");
    expect(logs).toContain("  - HCLOUD_TOKEN");
    expect(logs).toContain("Safe to ignore for now (2):");
    expect(logs).toContain("  - AI_IMAGE_KEY");
    expect(logs).toContain("  - LINKEDIN_ACCESS_TOKEN");
  });

  it("dry-runs Bitwarden push without contacting a backend", async () => {
    writeFileSync(
      join(testDir, ".env.schema"),
      [
        "# @required @sensitive",
        "AI_API_KEY=",
        "",
        "# @required @sensitive",
        "CERTIFICATE_PEM=",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(testDir, ".env"),
      ["AI_API_KEY=sk-local", "CERTIFICATE_PEM=cert-pem", ""].join("\n"),
    );

    const logs: string[] = [];
    const result = await pushSecrets(testDir, {
      env: {
        AI_API_KEY: "sk-local",
        CERTIFICATE_PEM: "cert-pem",
      },
      dryRun: true,
      pushTo: "bitwarden",
      logger: (message) => logs.push(message),
      bitwardenClient: {
        pushSecrets: async () => {
          throw new Error("should not contact Bitwarden during dry-run");
        },
      },
    });

    expect(result.dryRun).toBe(true);
    expect(result.target).toBe("bitwarden");
    expect(result.pushedKeys).toEqual(["AI_API_KEY", "CERTIFICATE_PEM"]);
    expect(logs[0]).toContain("Bitwarden project");
    expect(logs[1]).toContain("would update .env.schema");
  });

  it("pushes to Bitwarden and updates .env.schema with UUID references", async () => {
    writeFileSync(
      join(testDir, ".env.schema"),
      [
        "# This env file uses @env-spec",
        "#",
        "# @defaultRequired=false @defaultSensitive=false",
        "# ----------",
        "",
        "# @required @sensitive",
        "AI_API_KEY=",
        "",
        "# @required @sensitive",
        "GIT_SYNC_TOKEN=",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(testDir, ".env"),
      ["AI_API_KEY=sk-local", "GIT_SYNC_TOKEN=git-local", ""].join("\n"),
    );

    const logs: string[] = [];
    const result = await pushSecrets(testDir, {
      env: {
        AI_API_KEY: "sk-local",
        GIT_SYNC_TOKEN: "git-local",
      },
      pushTo: "bw",
      logger: (message) => logs.push(message),
      bitwardenClient: {
        pushSecrets: async (projectName, secrets) => {
          expect(projectName).toBe(testDir.split("/").pop() ?? "");
          expect(secrets).toEqual([
            ["AI_API_KEY", "sk-local"],
            ["GIT_SYNC_TOKEN", "git-local"],
          ]);
          return {
            projectName,
            projectId: "project-uuid",
            createdProject: true,
            createdKeys: ["AI_API_KEY", "GIT_SYNC_TOKEN"],
            updatedKeys: [],
            mappings: [
              { key: "AI_API_KEY", id: "11111111-1111-1111-1111-111111111111" },
              {
                key: "GIT_SYNC_TOKEN",
                id: "22222222-2222-2222-2222-222222222222",
              },
            ],
          };
        },
      },
    });

    expect(result.target).toBe("bitwarden");
    expect(result.pushedKeys).toEqual(["AI_API_KEY", "GIT_SYNC_TOKEN"]);
    expect(result.bitwarden?.projectId).toBe("project-uuid");
    expect(logs).toContain(
      "Updated .env.schema with Bitwarden UUID references.",
    );

    const schema = readFileSync(join(testDir, ".env.schema"), "utf-8");
    expect(schema).toContain("# @plugin(@varlock/bitwarden-plugin)");
    expect(schema).toContain("# @initBitwarden(accessToken=$BWS_ACCESS_TOKEN)");
    expect(schema).toContain(
      "# @required @sensitive @type=bitwardenAccessToken",
    );
    expect(schema).toContain("BWS_ACCESS_TOKEN=");
    expect(schema).toContain(
      'AI_API_KEY=bitwarden("11111111-1111-1111-1111-111111111111")',
    );
    expect(schema).toContain(
      'GIT_SYNC_TOKEN=bitwarden("22222222-2222-2222-2222-222222222222")',
    );
  });

  it("pushes multiline secrets from .env.local file-backed values", async () => {
    writeFileSync(
      join(testDir, ".env.schema"),
      ["# @required @sensitive", "KAMAL_SSH_PRIVATE_KEY=", ""].join("\n"),
    );
    const keyPath = join(testDir, "deploy-key.pem");
    const keyPem = [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "line-one",
      "line-two",
      "-----END OPENSSH PRIVATE KEY-----",
      "",
    ].join("\n");
    writeFileSync(keyPath, keyPem);
    writeFileSync(
      join(testDir, ".env.local"),
      `KAMAL_SSH_PRIVATE_KEY_FILE=${keyPath}\n`,
    );

    const calls: Array<{ command: string; args: string[]; stdin?: string }> =
      [];
    const result = await pushSecrets(testDir, {
      env: {},
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

    expect(result.pushedKeys).toEqual(["KAMAL_SSH_PRIVATE_KEY"]);
    expect(result.skippedKeys).toEqual([]);
    expect(calls).toEqual([
      {
        command: "gh",
        args: ["secret", "set", "KAMAL_SSH_PRIVATE_KEY"],
        stdin: keyPem,
      },
    ]);
  });

  it("expands ~/ paths for file-backed secrets", async () => {
    writeFileSync(
      join(testDir, ".env.schema"),
      ["# @required @sensitive", "KAMAL_SSH_PRIVATE_KEY=", ""].join("\n"),
    );
    const fakeHome = join(testDir, "home");
    const sshDir = join(fakeHome, ".ssh");
    mkdirSync(sshDir, { recursive: true });
    const keyPath = join(sshDir, "mylittlephoney_deploy_ed25519");
    const keyPem = [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "line-one",
      "line-two",
      "-----END OPENSSH PRIVATE KEY-----",
      "",
    ].join("\n");
    writeFileSync(keyPath, keyPem);
    writeFileSync(
      join(testDir, ".env.local"),
      "KAMAL_SSH_PRIVATE_KEY_FILE=~/.ssh/mylittlephoney_deploy_ed25519\n",
    );

    const originalHome = process.env["HOME"];
    process.env["HOME"] = fakeHome;

    try {
      const calls: Array<{ command: string; args: string[]; stdin?: string }> =
        [];
      const result = await pushSecrets(testDir, {
        env: {},
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

      expect(result.pushedKeys).toEqual(["KAMAL_SSH_PRIVATE_KEY"]);
      expect(calls).toEqual([
        {
          command: "gh",
          args: ["secret", "set", "KAMAL_SSH_PRIVATE_KEY"],
          stdin: keyPem,
        },
      ]);
    } finally {
      if (originalHome === undefined) {
        delete process.env["HOME"];
      } else {
        process.env["HOME"] = originalHome;
      }
    }
  });
});
