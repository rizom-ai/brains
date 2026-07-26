import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseArgs } from "../src/parse-args";

describe("parseArgs", () => {
  it("should parse 'init' with directory as first arg", () => {
    const result = parseArgs(["init", "mybrain"]);
    expect(result.command).toBe("init");
    expect(result.args[0]).toBe("mybrain");
  });

  it("should parse 'init' with --model flag", () => {
    const result = parseArgs(["init", "--model", "rover"]);
    expect(result.command).toBe("init");
    expect(result.flags["model"]).toBe("rover");
  });

  it("should parse 'init' with --domain flag", () => {
    const result = parseArgs(["init", "--domain", "mybrain.rizom.ai"]);
    expect(result.command).toBe("init");
    expect(result.flags["domain"]).toBe("mybrain.rizom.ai");
  });

  it("should parse 'init' with --content-repo flag", () => {
    const result = parseArgs([
      "init",
      "--content-repo",
      "github:user/brain-data",
    ]);
    expect(result.command).toBe("init");
    expect(result.flags["content-repo"]).toBe("github:user/brain-data");
  });

  it("should parse 'init' with --backend flag", () => {
    const result = parseArgs(["init", "--backend", "env"]);
    expect(result.command).toBe("init");
    expect(result.flags["backend"]).toBe("env");
  });

  it("should parse 'init' with --regen flag", () => {
    const result = parseArgs(["init", "mybrain", "--deploy", "--regen"]);
    expect(result.command).toBe("init");
    expect(result.flags["deploy"]).toBe(true);
    expect(result.flags["regen"]).toBe(true);
  });

  it("should parse 'cert:bootstrap' with --push-to flag", () => {
    const result = parseArgs(["cert:bootstrap", "--push-to", "gh"]);
    expect(result.command).toBe("cert:bootstrap");
    expect(result.flags["push-to"]).toBe("gh");
  });

  it("should parse 'secrets:push' with --push-to flag", () => {
    const result = parseArgs(["secrets:push", "--push-to", "gh"]);
    expect(result.command).toBe("secrets:push");
    expect(result.flags["push-to"]).toBe("gh");
  });

  it("should parse 'secrets:push' with --all and --only flags", () => {
    const result = parseArgs([
      "secrets:push",
      "--all",
      "--only",
      "AI_API_KEY,HCLOUD_TOKEN",
    ]);
    expect(result.command).toBe("secrets:push");
    expect(result.flags["all"]).toBe(true);
    expect(result.flags["only"]).toBe("AI_API_KEY,HCLOUD_TOKEN");
  });

  it("should parse 'secrets:push' with --dry-run flag", () => {
    const result = parseArgs(["secrets:push", "--dry-run"]);
    expect(result.command).toBe("secrets:push");
    expect(result.flags["dry-run"]).toBe(true);
  });

  it("should parse 'start' with --startup-check flag", () => {
    const result = parseArgs(["start", "--startup-check"]);
    expect(result.command).toBe("start");
    expect(result.flags["startup-check"]).toBe(true);
  });

  it("should parse 'ssh-key:bootstrap' with --push-to flag", () => {
    const result = parseArgs(["ssh-key:bootstrap", "--push-to", "gh"]);
    expect(result.command).toBe("ssh-key:bootstrap");
    expect(result.flags["push-to"]).toBe("gh");
  });

  it("should parse 'auth reset-passkeys' recovery flags", () => {
    const result = parseArgs([
      "auth",
      "reset-passkeys",
      "--yes",
      "--storage-dir",
      "./runtime/auth",
    ]);
    expect(result.command).toBe("auth");
    expect(result.args).toEqual(["reset-passkeys"]);
    expect(result.flags["yes"]).toBe(true);
    expect(result.flags["storage-dir"]).toBe("./runtime/auth");
  });

  it("should parse 'auth reinitialize-access' recovery flags", () => {
    const result = parseArgs([
      "auth",
      "reinitialize-access",
      "--yes",
      "--storage-dir",
      "./runtime/auth",
    ]);
    expect(result.command).toBe("auth");
    expect(result.args).toEqual(["reinitialize-access"]);
    expect(result.flags["yes"]).toBe(true);
    expect(result.flags["storage-dir"]).toBe("./runtime/auth");
  });

  it("should parse --help flag", () => {
    const result = parseArgs(["--help"]);
    expect(result.command).toBe("help");
  });

  it("should parse -h flag", () => {
    const result = parseArgs(["-h"]);
    expect(result.command).toBe("help");
  });

  it("should parse --version flag", () => {
    const result = parseArgs(["--version"]);
    expect(result.command).toBe("version");
  });

  it("should default to 'help' with no args", () => {
    const result = parseArgs([]);
    expect(result.command).toBe("help");
  });
});

describe("brain auth recovery", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-cli-auth-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("requires --yes before resetting passkeys", async () => {
    const { runCommand } = await import("../src/run-command");
    const authDir = join(testDir, "data", "auth");
    mkdirSync(authDir, { recursive: true });
    writeFileSync(
      join(authDir, "oauth-passkeys.json"),
      JSON.stringify({ credentials: [{ id: "credential" }] }),
    );

    const result = await runCommand(
      {
        command: "auth",
        args: ["reset-passkeys"],
        flags: { "storage-dir": authDir },
      },
      testDir,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("--yes");
    expect(
      readFileSync(join(authDir, "oauth-passkeys.json"), "utf8"),
    ).toContain("credential");
  });

  it("requires --yes before reinitializing access", async () => {
    const { runCommand } = await import("../src/run-command");
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: rover\npermissions:\n  admins:\n    - discord:admin\n",
    );

    const result = await runCommand(
      {
        command: "auth",
        args: ["reinitialize-access"],
        flags: {},
      },
      testDir,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("--yes");
    expect(existsSync(join(testDir, "data", "auth", "auth.db"))).toBe(false);
  });

  it("reinitializes DB-backed exact access from brain.yaml", async () => {
    const { runCommand } = await import("../src/run-command");
    const { AuthService } = await import("@brains/auth-service");
    writeFileSync(
      join(testDir, "brain.yaml"),
      [
        "brain: rover",
        "permissions:",
        "  admins:",
        "    - discord:admin-1",
        "  trusted:",
        "    - discord:trusted-1",
        "  anchors:",
        "    - discord:owner-1",
        "",
      ].join("\n"),
    );

    const result = await runCommand(
      {
        command: "auth",
        args: ["reinitialize-access"],
        flags: { yes: true },
      },
      testDir,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("Access reinitialized");
    const service = new AuthService({
      storageDir: join(testDir, "data", "auth"),
    });
    expect(
      await service.resolveInterfacePrincipal("discord", "admin-1"),
    ).toEqual({ permissionLevel: "admin", isAnchor: false });
    expect(
      await service.resolveInterfacePrincipal("discord", "trusted-1"),
    ).toEqual({ permissionLevel: "trusted", isAnchor: false });
    expect(
      await service.resolveInterfacePrincipal("discord", "owner-1"),
    ).toEqual({ permissionLevel: "public", isAnchor: true });
    await service.close();
  });

  it("treats empty access lists as absent during reinitialization", async () => {
    const { runCommand } = await import("../src/run-command");
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: rover\nadmins:\n  - discord:admin-1\nanchors:\n",
    );

    const result = await runCommand(
      {
        command: "auth",
        args: ["reinitialize-access"],
        flags: { yes: true },
      },
      testDir,
    );

    expect(result.success).toBe(true);
  });

  it("atomically clears auth.db passkeys and active OAuth state", async () => {
    const { runCommand } = await import("../src/run-command");
    const {
      AuthCredentialStore,
      AuthIdentityStore,
      AuthRuntimeDatabase,
      AuthService,
      RuntimeAuthorizationCodeStore,
      RuntimeAuthSessionStore,
      RuntimeRefreshTokenStore,
    } = await import("@brains/auth-service");
    const authDir = join(testDir, "data", "auth");
    mkdirSync(authDir, { recursive: true });
    const legacyPasskeys = JSON.stringify({
      credentials: [{ id: "legacy-credential" }],
    });
    writeFileSync(join(authDir, "oauth-passkeys.json"), legacyPasskeys);

    const service = new AuthService({
      storageDir: authDir,
      issuer: "http://localhost:8080",
    });
    const user = await service.createUser({
      displayName: "Recovery Admin",
      role: "admin",
    });
    const client = await service.registerClient({
      redirect_uris: ["http://localhost:6274/oauth/callback"],
      client_name: "Recovery client",
    });
    await service.getJwks();
    const previousSetupUrl = service.getSetupUrl();
    if (!previousSetupUrl) throw new Error("Expected initial setup URL");
    await service.close();

    const database = new AuthRuntimeDatabase({ storageDir: authDir });
    await database.start();
    const credentials = new AuthCredentialStore(database.db);
    await credentials.addPasskey({
      id: "credential-1",
      userId: user.userId,
      publicKey: "public-key",
      counter: 0,
      credentialBackedUp: false,
    });
    await credentials.saveChallenge({
      challenge: "registration-challenge",
      kind: "registration",
      userId: user.userId,
      expiresAt: Date.now() + 60_000,
    });
    await new AuthIdentityStore(database.db).attachIdentity({
      userId: user.userId,
      type: "passkey",
      subject: "credential-1",
      verifiedAt: Date.now(),
      source: { kind: "provider", id: "webauthn" },
    });
    await new RuntimeAuthSessionStore(database).createSession(user.userId);
    await new RuntimeAuthorizationCodeStore(database).createCode({
      clientId: client.client_id,
      redirectUri: client.redirect_uris[0] ?? "",
      codeChallenge: "challenge",
      subject: user.userId,
    });
    await new RuntimeRefreshTokenStore(database).issueToken({
      clientId: client.client_id,
      subject: user.userId,
    });
    await database.stop();

    const result = await runCommand(
      {
        command: "auth",
        args: ["reset-passkeys"],
        flags: { "storage-dir": authDir, yes: true },
      },
      testDir,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("auth.db");
    expect(result.message).toContain("Restart the brain");
    const resetDatabase = new AuthRuntimeDatabase({ storageDir: authDir });
    await resetDatabase.start();
    try {
      for (const table of [
        "passkey_credentials",
        "webauthn_challenges",
        "auth_sessions",
        "oauth_auth_codes",
        "oauth_refresh_tokens",
      ]) {
        const count = await resetDatabase.client.execute(
          `SELECT COUNT(*) AS count FROM ${table}`,
        );
        expect(Number(count.rows[0]?.["count"])).toBe(0);
      }
      const passkeyClaims = await resetDatabase.client.execute(
        "SELECT COUNT(*) AS count FROM person_identity_claims WHERE type = 'passkey'",
      );
      expect(Number(passkeyClaims.rows[0]?.["count"])).toBe(0);
      const activeGlobalSetupTokens = await resetDatabase.client.execute(
        "SELECT COUNT(*) AS count FROM setup_tokens WHERE target_user_id IS NULL AND consumed_at IS NULL",
      );
      expect(Number(activeGlobalSetupTokens.rows[0]?.["count"])).toBe(0);
      for (const table of [
        "auth_users",
        "oauth_clients",
        "oauth_signing_keys",
      ]) {
        const count = await resetDatabase.client.execute(
          `SELECT COUNT(*) AS count FROM ${table}`,
        );
        expect(Number(count.rows[0]?.["count"])).toBeGreaterThan(0);
      }
    } finally {
      await resetDatabase.stop();
    }
    expect(readFileSync(join(authDir, "oauth-passkeys.json"), "utf8")).toBe(
      legacyPasskeys,
    );
    const restarted = new AuthService({
      storageDir: authDir,
      issuer: "http://localhost:8080",
    });
    await restarted.initialize();
    expect(await restarted.hasPasskeyCredentials()).toBe(false);
    expect(restarted.getSetupUrl()).toStartWith(
      "http://localhost:8080/setup?token=setup_",
    );
    expect(restarted.getSetupUrl()).not.toBe(previousSetupUrl);
    await restarted.close();
  });
});

describe("brain init (end-to-end)", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-cli-e2e-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should require directory argument", async () => {
    const { runCommand } = await import("../src/run-command");
    const result = await runCommand(
      {
        command: "init",
        flags: { model: "rover" },
        args: [],
      },
      testDir,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("directory");
  });

  it("should scaffold files in specified directory", async () => {
    const { runCommand } = await import("../src/run-command");
    const outDir = join(testDir, "mybrain");
    const result = await runCommand(
      {
        command: "init",
        flags: { model: "rover" },
        args: ["mybrain"],
      },
      testDir,
    );

    expect(result.success).toBe(true);
    expect(existsSync(join(outDir, "brain.yaml"))).toBe(true);
    expect(existsSync(join(outDir, ".env.example"))).toBe(true);
    expect(existsSync(join(outDir, "package.json"))).toBe(true);
    expect(existsSync(join(outDir, "README.md"))).toBe(true);
  });

  it("should write .env when --ai-api-key is provided non-interactively", async () => {
    const { runCommand } = await import("../src/run-command");
    const outDir = join(testDir, "mybrain");
    const result = await runCommand(
      {
        command: "init",
        flags: {
          model: "rover",
          "ai-api-key": "sk-test-12345",
          "no-interactive": true,
        },
        args: ["mybrain"],
      },
      testDir,
    );

    expect(result.success).toBe(true);
    const env = readFileSync(join(outDir, ".env"), "utf-8");
    expect(env).toContain("AI_API_KEY=sk-test-12345");
  });

  it("should not write .env when --ai-api-key is missing in non-interactive mode", async () => {
    const { runCommand } = await import("../src/run-command");
    const outDir = join(testDir, "mybrain");
    const result = await runCommand(
      {
        command: "init",
        flags: { model: "rover", "no-interactive": true },
        args: ["mybrain"],
      },
      testDir,
    );

    expect(result.success).toBe(true);
    expect(existsSync(join(outDir, ".env"))).toBe(false);
  });

  it("should activate git block when --content-repo is provided non-interactively", async () => {
    const { runCommand } = await import("../src/run-command");
    const outDir = join(testDir, "mybrain");
    const result = await runCommand(
      {
        command: "init",
        flags: {
          model: "rover",
          "content-repo": "user/brain-data",
          "ai-api-key": "sk-test-12345",
          "no-interactive": true,
        },
        args: ["mybrain"],
      },
      testDir,
    );

    expect(result.success).toBe(true);
    const yaml = readFileSync(join(outDir, "brain.yaml"), "utf-8");
    expect(yaml).toMatch(/^\s*directory-sync:\s*$/m);
    expect(yaml).toContain("repo: user/brain-data");
    const env = readFileSync(join(outDir, ".env"), "utf-8");
    expect(env).toContain("GIT_SYNC_TOKEN=");
  });

  it("should pass the selected backend through to .env.schema", async () => {
    const { runCommand } = await import("../src/run-command");
    const outDir = join(testDir, "mybrain");
    const result = await runCommand(
      {
        command: "init",
        flags: {
          model: "rover",
          backend: "env",
          "ai-api-key": "sk-test-12345",
          "no-interactive": true,
        },
        args: ["mybrain"],
      },
      testDir,
    );

    expect(result.success).toBe(true);
    const envSchema = readFileSync(join(outDir, ".env.schema"), "utf-8");
    expect(envSchema).toContain("@plugin(@varlock/env-plugin)");
    expect(envSchema).not.toContain("OP_TOKEN=");
  });
});

describe("secrets push (end-to-end)", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-cli-secrets-push-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should dry-run secrets push without contacting a backend", async () => {
    writeFileSync(
      join(testDir, ".env.schema"),
      [
        "AI_API_KEY=",
        "",
        "# ---- secret backend bootstrap ----",
        "OP_TOKEN=",
        "",
      ].join("\n"),
    );
    writeFileSync(join(testDir, ".env"), "AI_API_KEY=sk-test-12345\n");

    const { runCommand } = await import("../src/run-command");
    const result = await runCommand(
      {
        command: "secrets:push",
        flags: { "push-to": "gh", "dry-run": true },
        args: [],
      },
      testDir,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("Dry run");
  });
});
