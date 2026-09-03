import { z } from "@brains/utils/zod";

export type RuntimeProcessRole = "web" | "worker";

export const localDatabaseEndpointEnv = {
  address: "BRAINS_LOCAL_DATABASE_ENDPOINT",
  secret: "BRAINS_LOCAL_DATABASE_SECRET",
  sessionId: "BRAINS_LOCAL_DATABASE_SESSION_ID",
} as const;

export const localDatabaseOwnershipEnv = {
  forbidLocalOpen: "BRAINS_FORBID_LOCAL_DATABASE_OPEN",
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

export interface RuntimeProcessTopology {
  readonly role: RuntimeProcessRole | undefined;
  readonly endpointRole: "owner" | "client" | "none";
  readonly executionOnly: boolean;
  readonly ownsControlPlane: boolean;
  readonly runsJobWorker: boolean;
  readonly jobHandlerMode: "combined" | "validation-only" | "execution-only";
  readonly progressMonitorMode:
    "combined" | "durable-reader" | "durable-writer";
  readonly projectionMode: "scheduler" | "executor";
}

/** Derive every process-placement decision once from the supervised role. */
export function resolveRuntimeProcessTopology(
  role?: RuntimeProcessRole,
): RuntimeProcessTopology {
  if (role === "web") {
    return {
      role,
      endpointRole: "owner",
      executionOnly: false,
      ownsControlPlane: true,
      runsJobWorker: false,
      jobHandlerMode: "validation-only",
      progressMonitorMode: "durable-reader",
      projectionMode: "scheduler",
    };
  }
  if (role === "worker") {
    return {
      role,
      endpointRole: "client",
      executionOnly: true,
      ownsControlPlane: false,
      runsJobWorker: true,
      jobHandlerMode: "execution-only",
      progressMonitorMode: "durable-writer",
      projectionMode: "executor",
    };
  }
  return {
    role: undefined,
    endpointRole: "none",
    executionOnly: false,
    ownsControlPlane: true,
    runsJobWorker: true,
    jobHandlerMode: "combined",
    progressMonitorMode: "combined",
    projectionMode: "scheduler",
  };
}
