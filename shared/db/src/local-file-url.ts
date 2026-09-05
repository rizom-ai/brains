import { fileURLToPath } from "node:url";

const FILE_URL_PREFIX = "file:";

export function isLocalFileDatabaseUrl(url: string): boolean {
  return url.startsWith(FILE_URL_PREFIX);
}

export function localDatabasePath(url: string): string {
  if (url.startsWith("file://")) return fileURLToPath(url);
  return isLocalFileDatabaseUrl(url) ? url.slice(FILE_URL_PREFIX.length) : url;
}
