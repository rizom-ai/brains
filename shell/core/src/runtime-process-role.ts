import { z } from "@brains/utils/zod";
import type { EntityFileActorOptions } from "@brains/entity-service";
import type {
  JobHandlerRegistrationMode,
  JobProgressMonitorMode,
} from "@brains/job-queue";

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
  readonly fileActors?: EntityFileActorOptions;
  readonly processRole?: RuntimeProcessRole;
  readonly localDatabaseEndpoint?: LocalDatabaseEndpointConfig;
}

/**
 * What a process does in the runtime, decided once from its role. The web
 * process serves requests and owns local databases, the worker executes work
 * through the owner's endpoint, and a process without a role does both.
 */
export interface RuntimeRoleProfile {
  readonly endpointRole: "owner" | "client" | "none";
  /** Answers requests: shell daemons, system capabilities, the webserver. */
  readonly serves: boolean;
  /** Runs queued jobs. */
  readonly executes: boolean;
  readonly handlerRegistrationMode: JobHandlerRegistrationMode;
  readonly progressMonitorMode: JobProgressMonitorMode;
  readonly projectionActivation: "scheduler" | "executor";
}

const ROLE_PROFILES: Record<
  RuntimeProcessRole | "combined",
  RuntimeRoleProfile
> = {
  web: {
    endpointRole: "owner",
    serves: true,
    executes: false,
    handlerRegistrationMode: "validation-only",
    progressMonitorMode: "durable-reader",
    projectionActivation: "scheduler",
  },
  worker: {
    endpointRole: "client",
    serves: false,
    executes: true,
    handlerRegistrationMode: "execution-only",
    progressMonitorMode: "durable-writer",
    projectionActivation: "executor",
  },
  combined: {
    endpointRole: "none",
    serves: true,
    executes: true,
    handlerRegistrationMode: "combined",
    progressMonitorMode: "combined",
    projectionActivation: "scheduler",
  },
};

export function runtimeRoleProfile(
  role: RuntimeProcessRole | undefined,
): RuntimeRoleProfile {
  return ROLE_PROFILES[role ?? "combined"];
}
