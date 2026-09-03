const FILE_URL_PREFIX = "file:";

export function isLocalFileDatabaseUrl(url: string): boolean {
  return url.startsWith(FILE_URL_PREFIX);
}

export function localDatabasePath(url: string): string {
  return isLocalFileDatabaseUrl(url) ? url.slice(FILE_URL_PREFIX.length) : url;
}
