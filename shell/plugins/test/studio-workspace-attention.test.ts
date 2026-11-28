import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  defineStudioWorkspace,
  instantiatePluginPackageDefinition,
  studioAttentionItemSchema,
  studioWorkspaceRegisterContract,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "../src";

// Home's "Needs you" lists what a workspace says needs the person: each item
// with the verb that clears it, which opens the workspace that holds it.
const inbox = defineStudioWorkspace({
  id: "inbox",
  label: "Inbox",
  permission: "trusted",
  data: z.object({ open: z.number() }),
  actions: [],
  badge: ({ data }) => data.open,
  attention: ({ data }) =>
    data.open > 0
      ? [
          {
            id: "open",
            title: `${data.open} in your inbox`,
            severity: "warn",
            action: { label: "Open inbox", query: { filter: "open" } },
          },
        ]
      : [],
  view: () => ({ blocks: [] }),
});

const anchor: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "usr_anchor",
  actor: { kind: "user", userId: "usr_anchor" },
  userPermissionLevel: "admin",
  visibilityScope: "restricted",
  isAnchor: true,
};

async function registered(open: number): Promise<StudioWorkspaceRegistration> {
  const shell = createMockShell();
  const workspaces: StudioWorkspaceRegistration[] = [];
  shell
    .getMessageBus()
    .subscribe<StudioWorkspaceRegistration>(
      studioWorkspaceRegisterContract.name,
      (message) => {
        workspaces.push(message.payload);
        return { success: true, data: { workspaceUrl: "/studio/inbox" } };
      },
    );
  const [service] = instantiatePluginPackageDefinition(
    defineServicePlugin(
      { id: "fixture-inbox", config: z.object({}) },
      {
        studioWorkspaces: (context) => [
          inbox.bind(context, { load: () => ({ open }), actions: [] }),
        ],
      },
    ),
    {},
    { name: "@fixture/inbox", version: "0.1.0" },
  );
  if (!service) throw new Error("No service plugin");
  await service.register(shell);
  await service.finalizeRegistration?.();
  const [workspace] = workspaces;
  if (!workspace) throw new Error("No workspace registered");
  return workspace;
}

describe("workspace attention", () => {
  it("names what needs the person, from the workspace's own data", async () => {
    const workspace = await registered(2);
    expect(await workspace.attentionProvider?.(anchor)).toEqual([
      {
        id: "open",
        title: "2 in your inbox",
        severity: "warn",
        action: { label: "Open inbox", query: { filter: "open" } },
      },
    ]);
  });

  it("names nothing when nothing needs the person", async () => {
    const workspace = await registered(0);
    expect(await workspace.attentionProvider?.(anchor)).toEqual([]);
  });

  it("bounds an item to a title, a detail and a short verb", () => {
    expect(() =>
      studioAttentionItemSchema.parse({
        id: "x",
        title: "x".repeat(201),
        severity: "warn",
        action: { label: "Open" },
      }),
    ).toThrow();
    expect(() =>
      studioAttentionItemSchema.parse({
        id: "x",
        title: "Something",
        severity: "urgent",
        action: { label: "Open" },
      }),
    ).toThrow();
  });
});
