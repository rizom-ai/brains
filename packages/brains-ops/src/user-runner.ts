import type { ResolvedUser } from "./load-registry";

export interface ContentRepoFile {
  path: string;
  content: string;
}

export interface UserRunResult {
  brainYaml?: string;
  envFile?: string;
  contentRepoFiles?: ContentRepoFile[];
}

export type UserRunner = (user: ResolvedUser) => Promise<UserRunResult | void>;
