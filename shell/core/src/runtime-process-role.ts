import { z } from "@brains/utils/zod";

export type RuntimeProcessRole = "web" | "worker";

export const localDatabaseEndpointEnv = {
  address: "BRAINS_LOCAL_DATABASE_ENDPOINT",
  secret: "BRAINS_LOCAL_DATABASE_SECRET",
  sessionId: "BRAINS_LOCAL_DATABASE_SESSION_ID",
} as const;

export interface LocalDatabaseEndpointConfig {
  readonly address: string;
  readonly secret: string;
  readonly sessionId: string;
}

const localDatabaseEndpointConfigSchema: z.ZodType<
  LocalDatabaseEndpointConfig,
  unknown
> = z.strictObject({
  address: z.string().min(1),
  secret: z.string().min(32),
  sessionId: z.string().min(1),
});

/** Parse parent-provided private endpoint settings without reading ambient env. */
export function parseLocalDatabaseEndpointConfig(
  env: NodeJS.ProcessEnv,
): LocalDatabaseEndpointConfig {
  return localDatabaseEndpointConfigSchema.parse({
    address: env[localDatabaseEndpointEnv.address],
    secret: env[localDatabaseEndpointEnv.secret],
    sessionId: env[localDatabaseEndpointEnv.sessionId],
  });
}

export interface ShellRuntimeOptions {
  readonly processRole?: RuntimeProcessRole;
  readonly localDatabaseEndpoint?: LocalDatabaseEndpointConfig;
}
