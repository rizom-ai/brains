/** The OAuth client the homeserver signs people in through. */
export const HOMESERVER_CLIENT_ID = "matrix-homeserver";

export interface HomeserverConfigInput {
  /** The Matrix server name: the brain's domain. */
  serverName: string;
  /** The brain's public origin, which fronts the homeserver. */
  publicBaseUrl: string;
  registrationToken: string;
  oidcClientSecret: string;
  databasePath: string;
  backupPath: string;
  port: number;
}

/** Where Tuwunel sends a person back to after the brain signs them in. */
export function homeserverCallbackUrl(publicBaseUrl: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/_matrix/client/unstable/login/sso/callback/${HOMESERVER_CLIENT_ID}`;
}

function toml(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/**
 * Tuwunel's configuration for a brain's homeserver. Registration is open
 * only to the registration token, which the brain holds to create its bot.
 * People sign in through the brain as the only identity provider, keyed on
 * the brain's fixed `preferred_username`; they have no Matrix password.
 * Tuwunel reads identity providers at start, so this is written before the
 * homeserver first starts and never at runtime.
 */
export function renderHomeserverConfig(input: HomeserverConfigInput): string {
  const origin = input.publicBaseUrl.replace(/\/+$/, "");
  return `[global]
server_name = ${toml(input.serverName)}
database_path = ${toml(input.databasePath)}
address = ["0.0.0.0"]
port = ${input.port}
allow_registration = true
registration_token = ${toml(input.registrationToken)}

[global.well_known]
client = ${toml(origin)}
server = ${toml(`${input.serverName}:443`)}

[global.database.backup]
path = ${toml(input.backupPath)}

[[global.identity_provider]]
brand = "brain"
name = "your brain"
client_id = ${toml(HOMESERVER_CLIENT_ID)}
client_secret = ${toml(input.oidcClientSecret)}
issuer_url = ${toml(origin)}
callback_url = ${toml(homeserverCallbackUrl(origin))}
userid_claims = ["preferred_username"]
default = true
`;
}
