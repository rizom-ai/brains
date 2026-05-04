import { spawn } from "child_process";
import { basename, resolve } from "path";
import { z } from "@brains/utils";
import type { SecretPair } from "./push-secrets";

export interface BitwardenProject {
  id: string;
  name: string;
  organizationId: string;
}

export interface BitwardenSecret {
  id: string;
  key: string;
  value: string;
  note?: string | undefined;
  organizationId: string;
  projectId?: string | null | undefined;
}

export interface BitwardenSecretMapping {
  key: string;
  id: string;
}

export interface BitwardenPushResult {
  projectName: string;
  projectId: string;
  createdProject: boolean;
  createdKeys: string[];
  updatedKeys: string[];
  mappings: BitwardenSecretMapping[];
}

export interface BitwardenSecretsClient {
  pushSecrets(
    projectName: string,
    secrets: readonly SecretPair[],
  ): Promise<BitwardenPushResult>;
}

export type RunBwsCommand = (args: string[]) => Promise<string>;

const bitwardenProjectSchema: z.ZodType<BitwardenProject> = z
  .object({
    id: z.string(),
    name: z.string(),
    organizationId: z.string(),
  })
  .passthrough();

const bitwardenSecretSchema: z.ZodType<BitwardenSecret> = z
  .object({
    id: z.string(),
    key: z.string(),
    value: z.string(),
    note: z.string().optional(),
    organizationId: z.string(),
    projectId: z.string().nullable().optional(),
  })
  .passthrough();

const bitwardenProjectListSchema = z.union([
  z.array(bitwardenProjectSchema),
  z.object({ data: z.array(bitwardenProjectSchema) }).passthrough(),
]);

const bitwardenProjectObjectSchema = z.union([
  bitwardenProjectSchema,
  z.object({ data: bitwardenProjectSchema }).passthrough(),
]);

const bitwardenSdkSecretSyncSchema = z
  .object({
    secrets: z.array(bitwardenSecretSchema).nullable().optional(),
  })
  .passthrough();

export function inferBitwardenProjectName(cwd: string): string {
  return basename(resolve(cwd));
}

export class BitwardenSecretsManagerClient implements BitwardenSecretsClient {
  constructor(
    private readonly runBwsCommand: RunBwsCommand = runBwsCliCommand,
    private readonly secretWriter: BitwardenSecretWriter = new SdkBitwardenSecretWriter(),
  ) {}

  async pushSecrets(
    projectName: string,
    secrets: readonly SecretPair[],
  ): Promise<BitwardenPushResult> {
    const { project, created } = await this.ensureProject(projectName);
    const existingSecrets = await this.secretWriter.listProjectSecrets(project);
    const existingByKey = new Map<string, BitwardenSecret>();

    for (const secret of existingSecrets) {
      if (existingByKey.has(secret.key)) {
        throw new Error(
          `Multiple Bitwarden secrets named ${secret.key} found in project ${projectName}`,
        );
      }
      existingByKey.set(secret.key, secret);
    }

    const mappings: BitwardenSecretMapping[] = [];
    const createdKeys: string[] = [];
    const updatedKeys: string[] = [];

    for (const [key, value] of secrets) {
      const existing = existingByKey.get(key);
      if (existing) {
        const updated = await this.secretWriter.updateSecret(
          project,
          existing,
          value,
        );
        mappings.push({ key, id: updated.id });
        updatedKeys.push(key);
        continue;
      }

      const createdSecret = await this.secretWriter.createSecret(
        project,
        key,
        value,
      );
      mappings.push({ key, id: createdSecret.id });
      createdKeys.push(key);
    }

    return {
      projectName,
      projectId: project.id,
      createdProject: created,
      createdKeys,
      updatedKeys,
      mappings,
    };
  }

  private async ensureProject(
    projectName: string,
  ): Promise<{ project: BitwardenProject; created: boolean }> {
    const projects = await this.listProjects();
    const matches = projects.filter((project) => project.name === projectName);

    if (matches.length > 1) {
      throw new Error(`Multiple Bitwarden projects named ${projectName} found`);
    }

    if (matches[0]) {
      return { project: matches[0], created: false };
    }

    return {
      project: await this.createProject(projectName),
      created: true,
    };
  }

  private async listProjects(): Promise<BitwardenProject[]> {
    const parsed = bitwardenProjectListSchema.parse(
      parseJson(await this.runBwsCommand(["project", "list"])),
    );
    return Array.isArray(parsed) ? parsed : parsed.data;
  }

  private async createProject(name: string): Promise<BitwardenProject> {
    const parsed = bitwardenProjectObjectSchema.parse(
      parseJson(await this.runBwsCommand(["project", "create", name])),
    );
    return "data" in parsed ? parsed.data : parsed;
  }
}

export interface BitwardenSecretWriter {
  listProjectSecrets(project: BitwardenProject): Promise<BitwardenSecret[]>;
  createSecret(
    project: BitwardenProject,
    key: string,
    value: string,
  ): Promise<BitwardenSecret>;
  updateSecret(
    project: BitwardenProject,
    existing: BitwardenSecret,
    value: string,
  ): Promise<BitwardenSecret>;
}

class SdkBitwardenSecretWriter implements BitwardenSecretWriter {
  private clientPromise?: Promise<BitwardenSdkClient>;

  async listProjectSecrets(
    project: BitwardenProject,
  ): Promise<BitwardenSecret[]> {
    const client = await this.getClient();
    const synced = bitwardenSdkSecretSyncSchema.parse(
      await client.secrets().sync(project.organizationId),
    );
    return (synced.secrets ?? []).filter(
      (secret) => secret.projectId === project.id,
    );
  }

  async createSecret(
    project: BitwardenProject,
    key: string,
    value: string,
  ): Promise<BitwardenSecret> {
    const client = await this.getClient();
    return bitwardenSecretSchema.parse(
      await client
        .secrets()
        .create(project.organizationId, key, value, "", [project.id]),
    );
  }

  async updateSecret(
    project: BitwardenProject,
    existing: BitwardenSecret,
    value: string,
  ): Promise<BitwardenSecret> {
    const client = await this.getClient();
    return bitwardenSecretSchema.parse(
      await client
        .secrets()
        .update(
          project.organizationId,
          existing.id,
          existing.key,
          value,
          existing.note ?? "",
          [project.id],
        ),
    );
  }

  private getClient(): Promise<BitwardenSdkClient> {
    this.clientPromise ??= createSdkClient();
    return this.clientPromise;
  }
}

interface BitwardenSdkClient {
  auth(): {
    loginAccessToken(accessToken: string, stateFile?: string): Promise<void>;
  };
  secrets(): {
    sync(organizationId: string): Promise<unknown>;
    create(
      organizationId: string,
      key: string,
      value: string,
      note: string,
      projectIds: string[],
    ): Promise<unknown>;
    update(
      organizationId: string,
      id: string,
      key: string,
      value: string,
      note: string,
      projectIds: string[],
    ): Promise<unknown>;
  };
}

interface BitwardenSdkModule {
  BitwardenClient: new (
    settings?: unknown,
    loggingLevel?: unknown,
  ) => BitwardenSdkClient;
  LogLevel?: { Error?: unknown };
}

async function createSdkClient(): Promise<BitwardenSdkClient> {
  const accessToken = process.env["BWS_ACCESS_TOKEN"];
  if (!accessToken) {
    throw new Error(
      "Missing BWS_ACCESS_TOKEN. Create a Bitwarden Secrets Manager machine account token and export it before pushing.",
    );
  }

  const packageName = "@bitwarden/sdk-napi";
  const mod = (await import(packageName)) as BitwardenSdkModule;
  const client = new mod.BitwardenClient(undefined, mod.LogLevel?.Error);
  await client.auth().loginAccessToken(accessToken);
  return client;
}

function runBwsCliCommand(args: string[]): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    const proc = spawn("bws", ["--output", "json", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolveOutput(stdout);
        return;
      }

      reject(
        new Error(
          `bws ${args.join(" ")} exited with code ${code ?? 1}${stderr ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

function parseJson(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(
      `Could not parse bws JSON output: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
