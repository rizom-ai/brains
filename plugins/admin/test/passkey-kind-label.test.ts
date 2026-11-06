import { expect, test } from "bun:test";
import { isLinkedIdentity, passkeyKindLabel } from "../src/people-workspace";

test("passkeys read as synced or device passkeys, as in Account", () => {
  expect(passkeyKindLabel({ credentialBackedUp: true })).toBe("Synced passkey");
  expect(passkeyKindLabel({ credentialBackedUp: false })).toBe(
    "Device passkey",
  );
});

test("a passkey is a sign-in credential, not a linked identity", () => {
  expect(isLinkedIdentity({ type: "passkey" })).toBe(false);
  expect(isLinkedIdentity({ type: "email" })).toBe(true);
  expect(isLinkedIdentity({ type: "email", revokedAt: 1 })).toBe(false);
});
