import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  defineStudioWorkspace,
  defineWorkspaceAction,
  instantiatePluginPackageDefinition,
  studioWorkspaceRegisterContract,
  type StudioWorkspaceRegistration,
} from "../src";

// ⌘K runs an action a workspace offers there, from any page: one that
// needs nothing filled in and nothing confirmed.
const buildPreview = defineWorkspaceAction({
  name: "build-preview",
  label: "Build preview",
  permission: "trusted",
  palette: true,
  input: z.object({}),
  output: z.object({}),
});
const buildProduction = defineWorkspaceAction({
  name: "build-production",
  label: "Build production",
  permission: "admin",
  input: z.object({}),
  output: z.object({}),
});

const site = defineStudioWorkspace({
  id: "site",
  label: "Site",
  permission: "trusted",
  data: z.object({}),
  actions: [buildPreview, buildProduction],
  view: () => ({ blocks: [] }),
});

async function registered(): Promise<StudioWorkspaceRegistration> {
  const shell = createMockShell();
  const workspaces: StudioWorkspaceRegistration[] = [];
  shell
    .getMessageBus()
    .subscribe<StudioWorkspaceRegistration>(
      studioWorkspaceRegisterContract.name,
      (message) => {
        workspaces.push(message.payload);
        return { success: true, data: { workspaceUrl: "/studio/site" } };
      },
    );
  const [service] = instantiatePluginPackageDefinition(
    defineServicePlugin(
      { id: "fixture-site", config: z.object({}) },
      {
        studioWorkspaces: (context) => [
          site.bind(context, {
            load: () => ({}),
            actions: [
              buildPreview.bind(context, () => ({})),
              buildProduction.bind(context, () => ({})),
            ],
          }),
        ],
      },
    ),
    {},
    { name: "@fixture/site", version: "0.1.0" },
  );
  if (!service) throw new Error("No service plugin");
  await service.register(shell);
  await service.finalizeRegistration?.();
  const [workspace] = workspaces;
  if (!workspace) throw new Error("No workspace registered");
  return workspace;
}

describe("palette actions", () => {
  it("registers the actions a workspace offers to ⌘K, and only those", async () => {
    const workspace = await registered();
    expect(workspace.paletteActions).toEqual([
      { name: "build-preview", label: "Build preview", permission: "trusted" },
    ]);
  });

  it("refuses to offer an action that needs input or a confirmation", () => {
    expect(() =>
      defineWorkspaceAction({
        name: "queue",
        label: "Add to queue",
        palette: true,
        input: z.object({ id: z.string() }),
        output: z.object({}),
      }),
    ).toThrow(/needs no input/);
    expect(() =>
      defineWorkspaceAction({
        name: "publish",
        label: "Publish now",
        palette: true,
        confirmation: { kind: "static", message: "Publish it?" },
        input: z.object({}),
        output: z.object({}),
      }),
    ).toThrow(/asks for no confirmation/);
  });
});
