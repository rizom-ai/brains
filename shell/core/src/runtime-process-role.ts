import type {
  JobHandlerRegistrationMode,
  JobProgressMonitorMode,
} from "@brains/job-queue";

export type RuntimeProcessRole = "web" | "worker";

export interface ShellRuntimeOptions {
  readonly processRole?: RuntimeProcessRole;
}

/**
 * What a process does in the runtime, decided once from its role. The web
 * process serves requests and schedules work, the worker executes it, and a
 * process started without a role does both.
 */
export interface RuntimeRoleProfile {
  /** Answers requests: shell daemons, system capabilities, the webserver. */
  serves: boolean;
  /** Runs queued jobs. */
  executes: boolean;
  handlerRegistrationMode: JobHandlerRegistrationMode;
  progressMonitorMode: JobProgressMonitorMode;
  projectionActivation: "scheduler" | "executor";
}

const ROLE_PROFILES: Record<
  RuntimeProcessRole | "combined",
  RuntimeRoleProfile
> = {
  web: {
    serves: true,
    executes: false,
    handlerRegistrationMode: "validation-only",
    progressMonitorMode: "durable-reader",
    projectionActivation: "scheduler",
  },
  worker: {
    serves: false,
    executes: true,
    handlerRegistrationMode: "execution-only",
    progressMonitorMode: "durable-writer",
    projectionActivation: "executor",
  },
  combined: {
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
