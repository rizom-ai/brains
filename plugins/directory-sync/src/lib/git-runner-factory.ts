import type { GitCommandRunner } from "./owned-git";

/**
 * How a Git path obtains its command runner.
 *
 * There is exactly one implementation — the broker-backed runner in
 * `broker-runner-factory.ts` — because every execution guarantee lives in the
 * broker's executor and its OS-owned wrapper. This type exists so call sites
 * resolve a runner from injected dependencies rather than constructing one,
 * which is what let the execution boundary be replaced wholesale, and what
 * lets tests observe every command.
 */

export interface GitRunnerRequest {
  baseDir: string;
  timeoutMs: number;
  /**
   * Repository preparation — remote probe, clone, init — which runs before the
   * checkout exists. The broker accepts these under its `bootstrap` operation
   * class and refuses them the moment the checkout appears.
   */
  bootstrap?: boolean | undefined;
  signal?: AbortSignal | undefined;
  onProgress?: (() => void) | undefined;
}

export type GitRunnerFactory = (request: GitRunnerRequest) => GitCommandRunner;
