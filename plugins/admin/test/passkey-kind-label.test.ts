import { expect, test } from "bun:test";
import { passkeyKindLabel } from "../src/people-workspace";

test("passkeys read as synced or device passkeys, as in Account", () => {
  expect(passkeyKindLabel({ credentialBackedUp: true })).toBe("Synced passkey");
  expect(passkeyKindLabel({ credentialBackedUp: false })).toBe(
    "Device passkey",
  );
});
