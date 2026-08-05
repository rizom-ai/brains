export type RuntimeProcessRole = "web" | "worker";

export interface ShellRuntimeOptions {
  readonly processRole?: RuntimeProcessRole;
}
