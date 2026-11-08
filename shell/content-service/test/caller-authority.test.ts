import { describe, expect, mock, test, type Mock } from "bun:test";
import type { ActorRef } from "@brains/contracts";
import { PermissionService } from "@brains/templates";
import {
  CallerAuthorizer,
  CallerAuthorizationError,
  callerAuthoritySchema,
  type CallerAccountRule,
  type CallerPrincipal,
} from "../src/caller-authority";
import {
  GenerationAuthorizer,
  GenerationAuthorizationError,
  generationAuthoritySchema,
} from "../src/generation-authorization";

const user: ActorRef = { kind: "user", userId: "usr_reader" };
const guest: ActorRef = { kind: "external", externalActorId: "ext_guest" };
const accountRules: CallerAccountRule[] = ["required", "optional"];

async function rejection(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => {
      throw new Error("Expected rejection");
    },
    (error: unknown) => error,
  );
}

function fixture(principal: CallerPrincipal | null = null): {
  permissions: PermissionService;
  resolvePrincipal: Mock<() => Promise<CallerPrincipal | null>>;
  authorizer: CallerAuthorizer;
} {
  const permissions = new PermissionService({});
  const resolvePrincipal = mock(
    async (): Promise<CallerPrincipal | null> => principal,
  );
  return {
    permissions,
    resolvePrincipal,
    authorizer: new CallerAuthorizer(permissions, resolvePrincipal),
  };
}

describe("caller authority", () => {
  test.each(accountRules)(
    "access never exceeds the caller's current level (account %s)",
    async (account) => {
      const { authorizer, resolvePrincipal } = fixture({
        userId: "usr_reader",
        permissionLevel: "trusted",
      });
      const claimedHigher = await authorizer.admit(
        { actor: user, permissionLevel: "admin" },
        account,
      );
      expect(claimedHigher.authority).toEqual({
        actor: user,
        permissionCeiling: "trusted",
        principalId: "usr_reader",
      });
      expect(claimedHigher.access).toEqual({
        permissionLevel: "trusted",
        visibilityScope: "shared",
      });

      resolvePrincipal.mockResolvedValue({
        userId: "usr_reader",
        permissionLevel: "admin",
      });
      const claimedLower = await authorizer.admit(
        { actor: user, permissionLevel: "public" },
        account,
      );
      // A later promotion never lifts the level the request was admitted at.
      expect(await authorizer.resolve(claimedLower.authority, account)).toEqual(
        { permissionLevel: "public", visibilityScope: "public" },
      );

      resolvePrincipal.mockResolvedValue({
        userId: "usr_reader",
        permissionLevel: "public",
      });
      expect(
        await authorizer.resolve(claimedHigher.authority, account),
      ).toEqual({ permissionLevel: "public", visibilityScope: "public" });
    },
  );

  test.each(accountRules)(
    "a user revoked or rebound before resolve is refused (account %s)",
    async (account) => {
      const { authorizer, resolvePrincipal } = fixture({
        userId: "usr_reader",
        permissionLevel: "admin",
      });
      const { authority } = await authorizer.admit(
        { actor: user, permissionLevel: "admin" },
        account,
      );
      resolvePrincipal.mockResolvedValue(null);
      expect(
        await rejection(authorizer.resolve(authority, account)),
      ).toBeInstanceOf(CallerAuthorizationError);
      resolvePrincipal.mockResolvedValue({
        userId: "usr_other",
        permissionLevel: "admin",
      });
      expect(
        await rejection(authorizer.resolve(authority, account)),
      ).toBeInstanceOf(CallerAuthorizationError);
    },
  );

  test("a user without an account is refused even when none is required", async () => {
    const { authorizer } = fixture(null);
    expect(
      await rejection(
        authorizer.admit(
          { actor: user, permissionLevel: "trusted" },
          "optional",
        ),
      ),
    ).toBeInstanceOf(CallerAuthorizationError);
  });

  test("an external caller without an account keeps its admitted level when none is required", async () => {
    const { authorizer } = fixture(null);
    const admission = await authorizer.admit(
      { actor: guest, permissionLevel: "admin" },
      "optional",
    );
    expect(admission.authority).toEqual({
      actor: guest,
      permissionCeiling: "admin",
    });
    expect(admission.access).toEqual({
      permissionLevel: "admin",
      visibilityScope: "restricted",
    });
    expect(await authorizer.resolve(admission.authority, "optional")).toEqual({
      permissionLevel: "admin",
      visibilityScope: "restricted",
    });

    const anonymous = await authorizer.admit(
      { actor: guest, permissionLevel: "public" },
      "optional",
    );
    expect(await authorizer.resolve(anonymous.authority, "optional")).toEqual({
      permissionLevel: "public",
      visibilityScope: "public",
    });
  });

  test("an external caller without an account is refused when one is required", async () => {
    const { authorizer } = fixture(null);
    expect(
      await rejection(
        authorizer.admit(
          { actor: guest, permissionLevel: "public" },
          "required",
        ),
      ),
    ).toBeInstanceOf(CallerAuthorizationError);
    expect(
      await rejection(
        authorizer.resolve(
          { actor: guest, permissionCeiling: "public" },
          "required",
        ),
      ),
    ).toBeInstanceOf(CallerAuthorizationError);
  });

  test("an external caller bound to an account after admission is refused", async () => {
    const { authorizer, resolvePrincipal } = fixture(null);
    const { authority } = await authorizer.admit(
      { actor: guest, permissionLevel: "public" },
      "optional",
    );
    resolvePrincipal.mockResolvedValue({
      userId: "usr_reader",
      permissionLevel: "admin",
    });
    expect(
      await rejection(authorizer.resolve(authority, "optional")),
    ).toBeInstanceOf(CallerAuthorizationError);
  });

  test.each(accountRules)(
    "a service reads with its configured grant, else public (account %s)",
    async (account) => {
      const permissions = new PermissionService({ trusted: ["service:books"] });
      const resolvePrincipal = mock(async () => null);
      const authorizer = new CallerAuthorizer(permissions, resolvePrincipal);
      const { authority } = await authorizer.admit(
        {
          actor: { kind: "service", serviceId: "books" },
          permissionLevel: "admin",
        },
        account,
      );
      expect(authority.permissionCeiling).toBe("trusted");
      const ungranted = await authorizer.admit(
        {
          actor: { kind: "service", serviceId: "other" },
          permissionLevel: "admin",
        },
        account,
      );
      expect(ungranted.access.permissionLevel).toBe("public");
      permissions.replaceRuntimePrincipalState({ grants: [], anchors: [] });
      expect(
        (await authorizer.resolve(authority, account)).permissionLevel,
      ).toBe("public");
      expect(resolvePrincipal).not.toHaveBeenCalled();
    },
  );

  test("resolver infrastructure errors propagate unchanged", async () => {
    const { authorizer, resolvePrincipal } = fixture(null);
    const error = new Error("auth database busy");
    resolvePrincipal.mockRejectedValue(error);
    expect(
      await rejection(
        authorizer.admit(
          { actor: guest, permissionLevel: "public" },
          "optional",
        ),
      ),
    ).toBe(error);
  });

  test("the recorded authority binds user accounts and only them", () => {
    const valid = [
      { actor: guest, permissionCeiling: "public" },
      { actor: guest, permissionCeiling: "trusted", principalId: "usr_reader" },
      { actor: user, permissionCeiling: "admin", principalId: "usr_reader" },
      {
        actor: { kind: "service", serviceId: "books" },
        permissionCeiling: "public",
      },
    ];
    const invalid = [
      { actor: user, permissionCeiling: "admin" },
      { actor: user, permissionCeiling: "admin", principalId: "usr_other" },
      {
        actor: { kind: "service", serviceId: "books" },
        permissionCeiling: "public",
        principalId: "usr_reader",
      },
    ];
    expect(
      valid.map((value) => callerAuthoritySchema.safeParse(value).success),
    ).toEqual(valid.map(() => true));
    expect(
      invalid.map((value) => callerAuthoritySchema.safeParse(value).success),
    ).toEqual(invalid.map(() => false));
    // Generation still requires every account actor to be bound.
    expect(
      generationAuthoritySchema.safeParse({
        actor: guest,
        permissionCeiling: "public",
      }).success,
    ).toBe(false);
  });

  test("generation delegates to a shared authorizer and still requires an account", async () => {
    const { permissions, authorizer } = fixture(null);
    const generation = new GenerationAuthorizer(permissions, authorizer);
    const denied = await rejection(
      generation.admit({ actor: guest, permissionLevel: "trusted" }),
    );
    expect(denied).toBeInstanceOf(GenerationAuthorizationError);
    expect(denied).toBeInstanceOf(CallerAuthorizationError);
    // The same authorizer admits the caller when no account is required.
    expect(
      (
        await authorizer.admit(
          { actor: guest, permissionLevel: "trusted" },
          "optional",
        )
      ).access.permissionLevel,
    ).toBe("trusted");
  });
});
