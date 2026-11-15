import type { AuthAccountPasskey, AuthPasskeySummary } from "@brains/contracts";
import type { StoredPasskey } from "./credential-store";

/** A passkey as its owner sees it on the account surface. */
export function passkeySummary(passkey: StoredPasskey): AuthAccountPasskey {
  return {
    id: passkey.id,
    ...(passkey.transports ? { transports: passkey.transports } : {}),
    ...(passkey.credentialDeviceType
      ? { credentialDeviceType: passkey.credentialDeviceType }
      : {}),
    credentialBackedUp: passkey.credentialBackedUp,
    createdAt: passkey.createdAt,
    updatedAt: passkey.updatedAt,
  };
}

/** A passkey as the administration surface shows it: with its owner. */
export function ownedPasskeySummary(
  passkey: StoredPasskey,
): AuthPasskeySummary {
  const { id, ...details } = passkeySummary(passkey);
  return { id, userId: passkey.userId, ...details };
}
