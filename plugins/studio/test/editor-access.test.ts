import { describe, expect, it } from "bun:test";
import { toStudioWorkspaceActor } from "../src/editor-access";

describe("toStudioWorkspaceActor", () => {
  it("names the signed-in person, so workspaces can record who acted", () => {
    expect(
      toStudioWorkspaceActor({
        principal: {
          userId: "usr_niels",
          personId: "prsn_niels",
          displayName: "Niels Ward",
          role: "trusted",
          status: "active",
          permissionLevel: "trusted",
          isAnchor: false,
        },
        actor: { kind: "user", userId: "usr_niels" },
        permissionLevel: "trusted",
        visibilityScope: "shared",
        isAnchor: false,
      }),
    ).toEqual({
      interfaceType: "studio",
      userId: "usr_niels",
      displayName: "Niels Ward",
      actor: { kind: "user", userId: "usr_niels" },
      userPermissionLevel: "trusted",
      visibilityScope: "shared",
      isAnchor: false,
    });
  });
});
