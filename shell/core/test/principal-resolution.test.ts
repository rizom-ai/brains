import { describe, expect, test } from "bun:test";
import { authPrincipalResolveContract, SdkError } from "@brains/contracts";
import { MessageBus, answerContract } from "@brains/messaging-service";
import { createSilentLogger } from "@brains/test-utils";
import { resolvePrincipalViaBus } from "../src/initialization/principal-resolution";

const actor = { kind: "user", userId: "usr_writer" } as const;

describe("resolvePrincipalViaBus", () => {
  test("resolves to null on a brain without an auth runtime", async () => {
    const bus = MessageBus.createFresh(createSilentLogger());

    expect(await resolvePrincipalViaBus(bus, "shell", actor)).toBeNull();
  });

  test("still throws, keeping the failure's code, when the auth runtime fails", async () => {
    const bus = MessageBus.createFresh(createSilentLogger());
    answerContract(
      bus,
      authPrincipalResolveContract,
      async () => {
        throw new SdkError("unauthenticated", {
          message: "auth database locked",
        });
      },
      { owner: "auth", logger: createSilentLogger() },
    );

    const failure: unknown = await resolvePrincipalViaBus(
      bus,
      "shell",
      actor,
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SdkError);
    expect(failure).toMatchObject({
      code: "unauthenticated",
      publicMessage: "Authentication required",
    });
    // The diagnostic stays in the auth runtime's log.
    expect(String(failure)).not.toContain("auth database locked");
  });
});
