import { describe, expect, test } from "bun:test";
import {
  authPrincipalResolveContract,
  authPrincipalResolveRequestSchema,
  type AuthPrincipalAttribution,
} from "@brains/contracts";
import {
  CallerAuthorizationError,
  GenerationAuthorizationError,
  GenerationAuthorizer,
  type Caller,
} from "@brains/content-service";
import { MessageBus } from "@brains/messaging-service";
import { PermissionService } from "@brains/templates";
import { createSilentLogger } from "@brains/test-utils";
import { createCallerAuthorizer } from "../src/initialization/caller-authorization";

const writer: Caller = {
  actor: { kind: "user", userId: "usr_writer" },
  permissionLevel: "admin",
};

/** Generation as the service factory composes it: over the shared authorizer. */
function generationAuthorizer(
  bus: Pick<MessageBus, "send" | "getHandlerCount">,
): GenerationAuthorizer {
  const permissions = new PermissionService({});
  return new GenerationAuthorizer(
    permissions,
    createCallerAuthorizer(permissions, bus),
  );
}

describe("the runtime's caller authorizer", () => {
  test("resolves requesters through the auth channel and observes revocation", async () => {
    const bus = MessageBus.createFresh(createSilentLogger());
    let principal: AuthPrincipalAttribution | null = {
      userId: "usr_reader",
      personId: "person_reader",
      displayName: "Reader",
      permissionLevel: "trusted",
    };
    bus.subscribe(authPrincipalResolveContract.name, async () => ({
      success: true,
      data: { principal },
    }));
    const authorizer = createCallerAuthorizer(new PermissionService({}), bus);
    const { authority } = await authorizer.admit(
      {
        actor: { kind: "user", userId: "usr_reader" },
        permissionLevel: "admin",
      },
      "optional",
    );
    expect(authority).toMatchObject({
      principalId: "usr_reader",
      permissionCeiling: "trusted",
    });
    principal = null;
    expect(
      await authorizer
        .resolve(authority, "optional")
        .catch((error: unknown) => error),
    ).toBeInstanceOf(CallerAuthorizationError);
  });

  test("without an auth runtime an external caller keeps its admitted level and a user is refused", async () => {
    const authorizer = createCallerAuthorizer(
      new PermissionService({}),
      MessageBus.createFresh(createSilentLogger()),
    );
    const { authority, access } = await authorizer.admit(
      {
        actor: { kind: "external", externalActorId: "ext_mcp_anonymous" },
        permissionLevel: "admin",
      },
      "optional",
    );
    expect(access).toEqual({
      permissionLevel: "admin",
      visibilityScope: "restricted",
    });
    expect(await authorizer.resolve(authority, "optional")).toEqual(access);
    expect(
      await authorizer
        .admit(
          {
            actor: { kind: "user", userId: "usr_reader" },
            permissionLevel: "admin",
          },
          "optional",
        )
        .catch((error: unknown) => error),
    ).toBeInstanceOf(CallerAuthorizationError);
  });
});

describe("generation over the runtime's caller authorizer", () => {
  test("uses the existing auth channel and observes live role removal", async () => {
    const bus = MessageBus.createFresh(createSilentLogger());
    let principal: AuthPrincipalAttribution | null = {
      userId: "usr_writer",
      personId: "person_writer",
      displayName: "Writer",
      permissionLevel: "trusted",
    };
    bus.subscribe(authPrincipalResolveContract.name, async (message) => {
      expect(message.source).toBe("shell:content-service");
      expect(
        authPrincipalResolveRequestSchema.parse(message.payload).actor,
      ).toEqual(writer.actor);
      return { success: true, data: { principal } };
    });
    const authorizer = generationAuthorizer(bus);
    const { authority } = await authorizer.admit(writer);
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
    const authorizer = generationAuthorizer(
      MessageBus.createFresh(createSilentLogger()),
    );
    const denied = await authorizer
      .admit(writer)
      .catch((error: unknown) => error);
    // No auth runtime resolves no principal: a permanent denial, not an
    // outage to retry.
    expect(denied).toBeInstanceOf(GenerationAuthorizationError);
  });

  test("auth infrastructure failures are not misclassified as permission denials", async () => {
    const bus = MessageBus.createFresh(createSilentLogger());
    bus.subscribe(authPrincipalResolveContract.name, async () => ({
      success: false,
      error: "database unavailable",
    }));
    const authorizer = generationAuthorizer(bus);
    const denied = await authorizer
      .admit(writer)
      .catch((error: unknown) => error);
    expect(denied).not.toBeInstanceOf(GenerationAuthorizationError);
    expect(denied).toMatchObject({
      name: "Error",
      message: "database unavailable",
    });
  });
});
