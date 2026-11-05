import { describe, expect, test } from "bun:test";
import { authPrincipalResolveContract } from "@brains/contracts";
import { MessageBus } from "@brains/messaging-service";
import { createSilentLogger } from "@brains/test-utils";
import { resolvePrincipalViaBus } from "../src/initialization/principal-resolution";

const actor = { kind: "user", userId: "usr_writer" } as const;

describe("resolvePrincipalViaBus", () => {
  test("resolves to null on a brain without an auth runtime", async () => {
    const bus = MessageBus.createFresh(createSilentLogger());

    expect(await resolvePrincipalViaBus(bus, "shell", actor)).toBeNull();
  });

  test("still throws when the auth runtime answers with a failure", async () => {
    const bus = MessageBus.createFresh(createSilentLogger());
    bus.subscribe(authPrincipalResolveContract.name, async () => ({
      success: false,
      error: "auth database locked",
    }));

    expect(resolvePrincipalViaBus(bus, "shell", actor)).rejects.toThrow(
      "auth database locked",
    );
  });
});
