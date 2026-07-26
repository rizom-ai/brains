import type { Config } from "drizzle-kit";

export interface SqliteDrizzleConfigOptions {
  /** Schema file(s) drizzle-kit reads table definitions from. */
  schema: string | string[];
  /** Environment variable holding the database url. */
  urlEnv: string;
  /** Environment variable holding the auth token. */
  authTokenEnv: string;
  /** Url used when `urlEnv` is unset. */
  defaultUrl: string;
}

/**
 * Build a drizzle-kit config for a shell service database. Every service
 * differs only in its schema paths, env var names, and local default file.
 */
export function defineSqliteDrizzleConfig(
  options: SqliteDrizzleConfigOptions,
): Config {
  const authToken = process.env[options.authTokenEnv];
  // drizzle-kit's sqlite credentials type omits authToken, but the runtime
  // honors it for remote libSQL; build it outside the literal so the optional
  // field survives without widening the config type.
  const dbCredentials = {
    url: process.env[options.urlEnv] ?? options.defaultUrl,
    ...(authToken === undefined ? {} : { authToken }),
  };

  return {
    schema: options.schema,
    out: "./drizzle",
    dialect: "sqlite",
    dbCredentials,
  };
}
