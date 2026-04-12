import type { ResolvedUser } from "./load-registry";

export interface UserRunResult {
  brainYaml?: string;
  envFile?: string;
}

export type UserRunner = (user: ResolvedUser) => Promise<UserRunResult | void>;
