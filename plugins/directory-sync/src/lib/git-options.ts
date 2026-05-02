import type { Logger } from "@brains/utils";

export interface GitSyncOptions {
  logger: Logger;
  dataDir: string;
  repo?: string | undefined;
  gitUrl?: string | undefined;
  branch?: string | undefined;
  authToken?: string | undefined;
  authorName?: string | undefined;
  authorEmail?: string | undefined;
}

export function resolveGitRemoteUrl(options: GitSyncOptions): string {
  return (
    options.gitUrl ??
    (options.repo ? `https://github.com/${options.repo}.git` : "")
  );
}

export function getAuthenticatedGitUrl(
  remoteUrl: string,
  authToken?: string,
): string {
  if (!authToken || !remoteUrl.startsWith("https://")) {
    return remoteUrl;
  }
  const url = new URL(remoteUrl);
  url.username = authToken;
  url.password = "";
  return url.toString();
}
