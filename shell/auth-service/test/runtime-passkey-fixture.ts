import {
  AuthCredentialStore,
  AuthRuntimeDatabase,
  AuthUserStore,
} from "../src";

export async function seedRuntimePasskeyCredential(
  storageDir: string,
  id = "credential-id",
): Promise<void> {
  const database = new AuthRuntimeDatabase({ storageDir });
  await database.start();
  const admin = await new AuthUserStore(database.db).ensureFirstAdminUser({
    displayName: "Admin",
  });
  await new AuthCredentialStore(database.db).addPasskey({
    id,
    userId: admin.id,
    publicKey: Buffer.from("public-key").toString("base64url"),
    counter: 0,
    credentialDeviceType: "singleDevice",
    credentialBackedUp: false,
  });
  await database.stop();
}
