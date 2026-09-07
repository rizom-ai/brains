import { describe, expect, test } from "bun:test";
import {
  AUTH_PRINCIPAL_RESOLVE_CHANNEL,
  authPrincipalResolveRequestSchema,
  type AuthPrincipalAttribution,
} from "@brains/contracts";
import { GenerationAuthorizationError } from "@brains/content-service";
import { MessageBus } from "@brains/messaging-service";
import { PermissionService } from "@brains/templates";
import { createSilentLogger } from "@brains/test-utils";
import { createGenerationAuthorizer } from "../src/initialization/generation-authorization";

const caller = {
  actor: { kind: "user", userId: "usr_writer" },
  permissionLevel: "admin",
} as const;

describe("generation's live principal resolver", () => {
  test("uses the existing auth channel and observes live role removal", async () => {
    const bus = MessageBus.createFresh(createSilentLogger());
    let principal: AuthPrincipalAttribution | null = {
      userId: "usr_writer",
      personId: "person_writer",
      displayName: "Writer",
      permissionLevel: "trusted",
    };
    bus.subscribe(AUTH_PRINCIPAL_RESOLVE_CHANNEL, async (message) => {
      expect(message.source).toBe("shell:content-service");
      expect(
        authPrincipalResolveRequestSchema.parse(message.payload).actor,
      ).toEqual(caller.actor);
      return { success: true, data: { principal } };
    });
    const authorizer = createGenerationAuthorizer(
      new PermissionService({}),
      bus,
    );
    const { authority } = await authorizer.admit(caller);
    expect(authority).toMatchObject({
      principalId: "usr_writer",
      permissionCeiling: "trusted",
    });
    principal = null;
    const denied = await authorizer
      .resolve(authority)
      .catch((error: unknown) => error);
    expect(denied).toBeInstanceOf(GenerationAuthorizationError);
  });

  test("missing auth support fails closed rather than trusting the caller's level", async () => {
    const authorizer = createGenerationAuthorizer(
      new PermissionService({}),
      MessageBus.createFresh(createSilentLogger()),
    );
    const denied = await authorizer
      .admit(caller)
      .catch((error: unknown) => error);
    expect(denied).toMatchObject({
      name: "Error",
      message: "Principal resolution unavailable",
    });
  });

  test("auth infrastructure failures are not misclassified as permission denials", async () => {
    const bus = MessageBus.createFresh(createSilentLogger());
    bus.subscribe(AUTH_PRINCIPAL_RESOLVE_CHANNEL, async () => ({
      success: false,
      error: "database unavailable",
    }));
    const authorizer = createGenerationAuthorizer(
      new PermissionService({}),
      bus,
    );
    const denied = await authorizer
      .admit(caller)
      .catch((error: unknown) => error);
    expect(denied).toMatchObject({
      name: "Error",
      message: "Principal resolution unavailable",
    });
  });
});
