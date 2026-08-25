import { describe, expect, it } from "bun:test";
import {
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import { studioPlugin } from "../src";
import {
  STUDIO_ACCOUNT_WORKSPACE,
  listBuiltInStudioWorkspaces,
} from "../src/account-workspace";

describe("Studio Account workspace declaration", () => {
  it("uses the explicit active-session Public floor and host renderer", () => {
    expect(STUDIO_ACCOUNT_WORKSPACE).toEqual({
      id: "studio:account",
      pluginId: "studio",
      label: "Account",
      rendererName: "StudioAccountWorkspace",
      priority: 0,
      permission: "public",
      entityTypes: [],
    });
    expect(listBuiltInStudioWorkspaces("public")).toEqual([
      {
        id: "studio:account",
        pluginId: "studio",
        label: "Account",
        rendererName: "StudioAccountWorkspace",
        priority: 0,
        entityTypes: [],
      },
    ]);
  });

  it("cannot be replaced by an external registration", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const plugin = studioPlugin();
    await plugin.register(shell);
    const registration: StudioWorkspaceRegistration = {
      id: "studio:account",
      pluginId: "external",
      label: "Imposter Account",
      rendererName: "DeclarativeOperatorWorkspace",
      priority: 0,
      permission: "public",
      accessHandler: () => true,
      dataProvider: async () => ({}),
    };

    const response = await shell.getMessageBus().send({
      type: STUDIO_WORKSPACE_REGISTER_MESSAGE,
      sender: "external",
      payload: registration,
    });

    expect(response).toMatchObject({
      success: false,
      error: expect.stringContaining("reserved by the host"),
    });
  });
});
