import { describe, expect, it } from "bun:test";
import {
  BitwardenSecretsManagerClient,
  type BitwardenProject,
  type BitwardenSecret,
  type BitwardenSecretWriter,
} from "../src/lib/bitwarden-secrets";

class FakeSecretWriter implements BitwardenSecretWriter {
  readonly calls: Array<
    | { type: "list"; project: BitwardenProject }
    | { type: "create"; project: BitwardenProject; key: string; value: string }
    | {
        type: "update";
        project: BitwardenProject;
        existing: BitwardenSecret;
        value: string;
      }
  > = [];

  constructor(private readonly existing: BitwardenSecret[] = []) {}

  async listProjectSecrets(
    project: BitwardenProject,
  ): Promise<BitwardenSecret[]> {
    this.calls.push({ type: "list", project });
    return this.existing;
  }

  async createSecret(
    project: BitwardenProject,
    key: string,
    value: string,
  ): Promise<BitwardenSecret> {
    this.calls.push({ type: "create", project, key, value });
    return {
      id: `${key.toLowerCase()}-id`,
      key,
      value,
      organizationId: project.organizationId,
      projectId: project.id,
    };
  }

  async updateSecret(
    project: BitwardenProject,
    existing: BitwardenSecret,
    value: string,
  ): Promise<BitwardenSecret> {
    this.calls.push({ type: "update", project, existing, value });
    return { ...existing, value };
  }
}

describe("BitwardenSecretsManagerClient", () => {
  it("uses bws only for project metadata and writes secrets through the secret writer", async () => {
    const bwsCalls: string[][] = [];
    const writer = new FakeSecretWriter();
    const client = new BitwardenSecretsManagerClient(async (args) => {
      bwsCalls.push(args);
      if (args[0] === "project" && args[1] === "list") {
        return JSON.stringify([]);
      }
      if (args[0] === "project" && args[1] === "create") {
        return JSON.stringify({
          id: "project-id",
          name: args[2],
          organizationId: "org-id",
        });
      }
      throw new Error(`Unexpected bws call: ${args.join(" ")}`);
    }, writer);

    const result = await client.pushSecrets("yeehaa.io", [
      ["AI_API_KEY", "sk-secret"],
      ["KAMAL_SSH_PRIVATE_KEY", "-----BEGIN KEY-----\nsecret\n"],
    ]);

    expect(result.createdProject).toBe(true);
    expect(result.createdKeys).toEqual(["AI_API_KEY", "KAMAL_SSH_PRIVATE_KEY"]);
    expect(result.mappings).toEqual([
      { key: "AI_API_KEY", id: "ai_api_key-id" },
      { key: "KAMAL_SSH_PRIVATE_KEY", id: "kamal_ssh_private_key-id" },
    ]);
    expect(bwsCalls).toEqual([
      ["project", "list"],
      ["project", "create", "yeehaa.io"],
    ]);
    expect(
      bwsCalls
        .flat()
        .some((arg) => arg.includes("sk-secret") || arg.includes("BEGIN KEY")),
    ).toBe(false);
    expect(writer.calls.map((call) => call.type)).toEqual([
      "list",
      "create",
      "create",
    ]);
  });

  it("updates an existing project secret by key", async () => {
    const project = {
      id: "project-id",
      name: "yeehaa.io",
      organizationId: "org-id",
    };
    const existing: BitwardenSecret = {
      id: "existing-id",
      key: "AI_API_KEY",
      value: "old",
      note: "keep note",
      organizationId: "org-id",
      projectId: "project-id",
    };
    const writer = new FakeSecretWriter([existing]);
    const client = new BitwardenSecretsManagerClient(async (args) => {
      if (args[0] === "project" && args[1] === "list") {
        return JSON.stringify([project]);
      }
      throw new Error(`Unexpected bws call: ${args.join(" ")}`);
    }, writer);

    const result = await client.pushSecrets("yeehaa.io", [
      ["AI_API_KEY", "new-value"],
    ]);

    expect(result.createdProject).toBe(false);
    expect(result.updatedKeys).toEqual(["AI_API_KEY"]);
    expect(result.mappings).toEqual([{ key: "AI_API_KEY", id: "existing-id" }]);
    expect(writer.calls.map((call) => call.type)).toEqual(["list", "update"]);
  });
});
