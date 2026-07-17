import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "@brains/utils/zod";
import type {
  LinkedInOAuthToken,
  LinkedInOAuthTokenStore,
} from "./linkedin-oauth-client";

const DEFAULT_TOKEN_FILE = "oauth-token.json";

interface StoredLinkedInOAuthToken {
  version: 1;
  accessToken: string;
  expiresAt: number;
  scope?: string | undefined;
  tokenType?: string | undefined;
}

const storedTokenSchema: z.ZodType<StoredLinkedInOAuthToken> = z
  .object({
    version: z.literal(1),
    accessToken: z.string().min(1),
    expiresAt: z.number().int().positive(),
    scope: z.string().optional(),
    tokenType: z.string().optional(),
  })
  .strict();

export interface LinkedInOAuthConnectionStatus {
  connected: boolean;
  expiresAt?: number | undefined;
  scope?: string | undefined;
}

export interface FileLinkedInOAuthTokenStoreOptions {
  storageDir: string;
  tokenFile?: string | undefined;
  now?: (() => number) | undefined;
}

/** Local secret store following auth-service's private-file persistence pattern. */
export class FileLinkedInOAuthTokenStore implements LinkedInOAuthTokenStore {
  private readonly tokenFile: string;
  private readonly now: () => number;

  constructor(options: FileLinkedInOAuthTokenStoreOptions) {
    this.tokenFile = join(
      options.storageDir,
      options.tokenFile ?? DEFAULT_TOKEN_FILE,
    );
    this.now = options.now ?? Date.now;
  }

  async getAccessToken(): Promise<string | undefined> {
    const token = await this.readToken();
    if (!token || token.expiresAt <= this.now()) return undefined;
    return token.accessToken;
  }

  async getStatus(): Promise<LinkedInOAuthConnectionStatus> {
    const token = await this.readToken();
    if (!token || token.expiresAt <= this.now()) return { connected: false };
    return {
      connected: true,
      expiresAt: token.expiresAt,
      ...(token.scope ? { scope: token.scope } : {}),
    };
  }

  async storeToken(token: LinkedInOAuthToken): Promise<void> {
    const accessToken = token.accessToken.trim();
    if (!accessToken) throw new Error("LinkedIn OAuth access token is empty");
    const expiresAt = this.now() + token.expiresIn * 1000;
    const stored: StoredLinkedInOAuthToken = {
      version: 1,
      accessToken,
      expiresAt,
      ...(token.scope ? { scope: token.scope } : {}),
      ...(token.tokenType ? { tokenType: token.tokenType } : {}),
    };
    storedTokenSchema.parse(stored);

    const storageDir = dirname(this.tokenFile);
    await mkdir(storageDir, { recursive: true, mode: 0o700 });
    await chmod(storageDir, 0o700);
    const temporaryFile = `${this.tokenFile}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryFile, JSON.stringify(stored), {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await chmod(temporaryFile, 0o600);
      await rename(temporaryFile, this.tokenFile);
      await chmod(this.tokenFile, 0o600);
    } finally {
      await rm(temporaryFile, { force: true });
    }
  }

  async clearToken(): Promise<void> {
    await rm(this.tokenFile, { force: true });
  }

  private async readToken(): Promise<StoredLinkedInOAuthToken | undefined> {
    let content: string;
    try {
      content = await readFile(this.tokenFile, "utf8");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(content);
    } catch {
      throw new Error("Stored LinkedIn OAuth token is not valid JSON");
    }
    const parsed = storedTokenSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Stored LinkedIn OAuth token has an invalid shape");
    }
    return parsed.data;
  }
}
