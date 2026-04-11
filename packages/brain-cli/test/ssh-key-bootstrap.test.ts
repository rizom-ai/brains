import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import {
  bootstrapSshKey,
  runSshKeyBootstrap,
  type SshKeygen,
} from "../src/commands/ssh-key-bootstrap";

describe("ssh key bootstrap", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-ssh-key-bootstrap-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("creates a local key, registers it in Hetzner, and pushes it to GitHub", async () => {
    writeFileSync(
      join(testDir, ".env.local"),
      [
        "HCLOUD_TOKEN=hc-token",
        "HCLOUD_SSH_KEY_NAME=mylittlephoney-deploy",
        "KAMAL_SSH_PRIVATE_KEY_FILE=./keys/deploy-key",
        "",
      ].join("\n"),
    );

    const privateKeyPem = [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "private-line",
      "-----END OPENSSH PRIVATE KEY-----",
      "",
    ].join("\n");
    const publicKey =
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMylittlephoney mylittlephoney-deploy";
    const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> =
      [];
    const ghCalls: Array<{
      command: string;
      args: string[];
      stdin: string | undefined;
    }> = [];
    const sshKeygenCalls: Array<{ privateKeyPath: string; comment: string }> =
      [];

    const sshKeygen: SshKeygen = {
      createEd25519KeyPair: (privateKeyPath, comment) => {
        sshKeygenCalls.push({ privateKeyPath, comment });
        mkdirSync(dirname(privateKeyPath), { recursive: true });
        writeFileSync(privateKeyPath, privateKeyPem, { mode: 0o600 });
        writeFileSync(`${privateKeyPath}.pub`, `${publicKey}\n`);
      },
      derivePublicKey: () => publicKey,
    };

    const result = await bootstrapSshKey(testDir, {
      fetchImpl: async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        fetchCalls.push({ url, init });

        if (url.includes("/ssh_keys?") && init?.method === undefined) {
          return new Response(JSON.stringify({ ssh_keys: [] }), {
            status: 200,
          });
        }

        if (url.endsWith("/ssh_keys") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as {
            name: string;
            public_key: string;
          };
          expect(body).toEqual({
            name: "mylittlephoney-deploy",
            public_key: publicKey,
          });
          return new Response(
            JSON.stringify({
              ssh_key: {
                id: 42,
                name: body.name,
                public_key: body.public_key,
              },
            }),
            { status: 201 },
          );
        }

        throw new Error(`Unexpected request: ${url}`);
      },
      logger: () => {},
      pushTo: "gh",
      runCommand: async (command, args, options) => {
        ghCalls.push({ command, args, stdin: options?.stdin });
      },
      sshKeygen,
    });

    expect(result.privateKeyPath).toBe(join(testDir, "keys/deploy-key"));
    expect(result.publicKeyPath).toBe(join(testDir, "keys/deploy-key.pub"));
    expect(result.sshKeyName).toBe("mylittlephoney-deploy");
    expect(result.createdLocalKey).toBe(true);
    expect(result.createdHetznerKey).toBe(true);
    expect(sshKeygenCalls).toEqual([
      {
        privateKeyPath: join(testDir, "keys/deploy-key"),
        comment: "mylittlephoney-deploy",
      },
    ]);
    expect(readFileSync(result.privateKeyPath, "utf-8")).toBe(privateKeyPem);
    expect(readFileSync(result.publicKeyPath, "utf-8")).toBe(`${publicKey}\n`);
    expect(statSync(result.privateKeyPath).mode & 0o777).toBe(0o600);
    expect(fetchCalls).toHaveLength(2);
    expect(ghCalls).toEqual([
      {
        command: "gh",
        args: ["secret", "set", "KAMAL_SSH_PRIVATE_KEY"],
        stdin: privateKeyPem,
      },
    ]);
  });

  it("reuses an existing local key and matching Hetzner key", async () => {
    const keyPath = join(testDir, "keys/deploy-key");
    mkdirSync(join(testDir, "keys"), { recursive: true });
    writeFileSync(
      join(testDir, ".env.local"),
      [
        "HCLOUD_TOKEN=hc-token",
        "HCLOUD_SSH_KEY_NAME=mylittlephoney-deploy",
        "KAMAL_SSH_PRIVATE_KEY_FILE=./keys/deploy-key",
        "",
      ].join("\n"),
    );
    writeFileSync(keyPath, "PRIVATE\n", { mode: 0o600 });
    writeFileSync(
      `${keyPath}.pub`,
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMylittlephoney mylittlephoney-deploy\n",
    );

    let createCalls = 0;
    const result = await bootstrapSshKey(testDir, {
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/ssh_keys?")) {
          return new Response(
            JSON.stringify({
              ssh_keys: [
                {
                  id: 42,
                  name: "mylittlephoney-deploy",
                  public_key:
                    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMylittlephoney mylittlephoney-deploy",
                },
              ],
            }),
            { status: 200 },
          );
        }

        throw new Error(`Unexpected request: ${url}`);
      },
      logger: () => {},
      sshKeygen: {
        createEd25519KeyPair: () => {
          createCalls += 1;
        },
        derivePublicKey: () =>
          "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMylittlephoney mylittlephoney-deploy",
      },
    });

    expect(result.createdLocalKey).toBe(false);
    expect(result.createdHetznerKey).toBe(false);
    expect(createCalls).toBe(0);
  });

  it("refuses Hetzner key drift for the configured name", async () => {
    writeFileSync(
      join(testDir, ".env.local"),
      [
        "HCLOUD_TOKEN=hc-token",
        "HCLOUD_SSH_KEY_NAME=mylittlephoney-deploy",
        "KAMAL_SSH_PRIVATE_KEY_FILE=./keys/deploy-key",
        "",
      ].join("\n"),
    );
    mkdirSync(join(testDir, "keys"), { recursive: true });
    writeFileSync(join(testDir, "keys/deploy-key"), "PRIVATE\n", {
      mode: 0o600,
    });

    try {
      await bootstrapSshKey(testDir, {
        fetchImpl: async (input) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url.includes("/ssh_keys?")) {
            return new Response(
              JSON.stringify({
                ssh_keys: [
                  {
                    id: 42,
                    name: "mylittlephoney-deploy",
                    public_key: "ssh-ed25519 AAAAother other",
                  },
                ],
              }),
              { status: 200 },
            );
          }

          throw new Error(`Unexpected request: ${url}`);
        },
        logger: () => {},
        sshKeygen: {
          createEd25519KeyPair: () => {},
          derivePublicKey: () =>
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMylittlephoney mylittlephoney-deploy",
        },
      });
      expect.unreachable("Expected bootstrapSshKey to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (error instanceof Error) {
        expect(error.message).toBe(
          "Existing Hetzner SSH key mylittlephoney-deploy does not match the local public key",
        );
      }
    }
  });

  it("returns a friendly failure result when required env is missing", async () => {
    const result = await runSshKeyBootstrap(testDir, {
      logger: () => {},
      sshKeygen: {
        createEd25519KeyPair: () => {},
        derivePublicKey: () => "ssh-ed25519 AAAA test",
      },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("HCLOUD_TOKEN");
  });
});
