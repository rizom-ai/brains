import { afterEach, describe, expect, it } from "bun:test";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import {
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  internalFullScope,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { LinkedInImportPlugin } from "../src/plugin";
import type { LinkedInFetch } from "../src/lib/linkedin-client";
import profileSnapshot from "./fixtures/profile-snapshot.json" with { type: "json" };

const harnesses: PluginTestHarness<LinkedInImportPlugin>[] = [];
afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.reset();
});

const ownerProfile =
  "---\nname: Ada M.\nemail: ada@example.com\n---\n\nMy own story.\n";

const linkedIn: LinkedInFetch = async (input) =>
  new URL(String(input)).searchParams.get("start") === "0"
    ? Response.json(profileSnapshot)
    : new Response("No data found for this memberId", { status: 404 });

function actor(
  overrides: Partial<StudioWorkspaceActor> = {},
): StudioWorkspaceActor {
  return {
    interfaceType: "studio",
    userId: "owner",
    actor: { kind: "user", userId: "owner" },
    userPermissionLevel: "admin",
    visibilityScope: "restricted",
    isAnchor: true,
    ...overrides,
  };
}

interface Fixture {
  workspace: StudioWorkspaceRegistration | undefined;
  view(): Promise<string>;
  act(request: Record<string, unknown>): Promise<unknown>;
  profile(): Promise<string | undefined>;
  setProfile(content: string): void;
}

async function fixture(
  options: { accessToken?: string; fetch?: LinkedInFetch } = {},
): Promise<Fixture> {
  // A log context keeps the shell this fixture seeds; install would replace it.
  const harness = createPluginHarness<LinkedInImportPlugin>({
    logContext: "linkedin-import-test",
  });
  harnesses.push(harness);
  const shell = harness.getMockShell();
  const setProfile = (content: string): void =>
    shell.addEntities([
      {
        id: "anchor-profile",
        entityType: "anchor-profile",
        content,
        metadata: {},
        contentHash: computeContentHash(content),
        visibility: "public",
        created: "2026-11-01T00:00:00.000Z",
        updated: "2026-11-01T00:00:00.000Z",
      },
    ]);
  setProfile(ownerProfile);
  const workspaces: StudioWorkspaceRegistration[] = [];
  shell
    .getMessageBus()
    .subscribe<StudioWorkspaceRegistration>(
      STUDIO_WORKSPACE_REGISTER_MESSAGE,
      (message) => {
        workspaces.push(message.payload);
        return { success: true, data: { workspaceUrl: "/studio" } };
      },
    );
  const plugin = new LinkedInImportPlugin(
    options.accessToken === undefined
      ? {}
      : { accessToken: options.accessToken },
    { fetch: options.fetch ?? linkedIn },
  );
  await harness.installPlugin(plugin);
  await plugin.finalizeRegistration();
  const workspace = workspaces.find(
    (registered) => registered.id === "linkedin-import:linkedin",
  );
  const signal = (): AbortSignal => new AbortController().signal;
  return {
    workspace,
    view: async (): Promise<string> =>
      JSON.stringify(await workspace?.dataProvider(actor(), {}, signal())),
    act: async (request): Promise<unknown> => {
      if (!workspace?.actionHandler) throw new Error("No LinkedIn workspace");
      return workspace.actionHandler(request, actor(), signal());
    },
    profile: async (): Promise<string | undefined> =>
      (
        await shell.getEntityService().getEntity({
          entityType: "anchor-profile",
          id: "anchor-profile",
          visibilityScope: internalFullScope("test reads the anchor profile"),
        })
      )?.content,
    setProfile,
  };
}

const prepared = z.object({ token: z.string(), summary: z.string() });

async function importProfile(state: Fixture): Promise<unknown> {
  const confirmation = prepared.parse(
    await state.act({ actionId: "import-profile", input: {}, mode: "prepare" }),
  );
  return state.act({
    actionId: "import-profile",
    input: {},
    confirmationToken: confirmation.token,
  });
}

describe("LinkedIn workspace", () => {
  it("is not offered without a LinkedIn token", async () => {
    expect((await fixture()).workspace).toBeUndefined();
  });

  it("belongs to the Anchor alone", async () => {
    const { workspace } = await fixture({ accessToken: "token" });
    if (!workspace) throw new Error("No LinkedIn workspace");

    expect(workspace.label).toBe("LinkedIn");
    expect(workspace.permission).toBe("admin");
    expect(await workspace.accessHandler(actor())).toBe(true);
    expect(await workspace.accessHandler(actor({ isAnchor: false }))).toBe(
      false,
    );
    expect(
      await workspace.accessHandler(actor({ userPermissionLevel: "trusted" })),
    ).toBe(false);
    expect(
      workspace.dataProvider(
        actor({ isAnchor: false }),
        {},
        new AbortController().signal,
      ),
    ).rejects.toThrow("data loader failed");
  });

  it("previews each field: filled, kept, or already the same", async () => {
    const shown = await (await fixture({ accessToken: "token" })).view();

    expect(shown).toContain("Advisor helping climate-tech founders");
    expect(shown).toContain("Climate Technology");
    expect(shown).toContain("Ada M.");
    expect(shown).toContain("Fill");
    expect(shown).toContain("Keep yours");
    expect(shown).toContain("import-profile");
  });

  it("imports after confirmation, keeping what the owner wrote", async () => {
    const state = await fixture({ accessToken: "token" });

    const confirmation = prepared.parse(
      await state.act({
        actionId: "import-profile",
        input: {},
        mode: "prepare",
      }),
    );
    expect(confirmation.summary).toContain("headline");
    expect(await state.profile()).toBe(ownerProfile);

    await state.act({
      actionId: "import-profile",
      input: {},
      confirmationToken: confirmation.token,
    });

    const content = (await state.profile()) ?? "";
    expect(content).toContain("name: Ada M.");
    expect(content).toContain(
      "headline: Advisor helping climate-tech founders build resilient software",
    );
    expect(content).toContain("industry: Climate Technology");
    expect(content).toContain("location: Rotterdam, Netherlands");
    expect(content).toContain("My own story.");
    expect(content).not.toContain("I build resilient software systems");
  });

  it("refuses a confirmation once the profile has changed", async () => {
    const state = await fixture({ accessToken: "token" });
    const confirmation = prepared.parse(
      await state.act({
        actionId: "import-profile",
        input: {},
        mode: "prepare",
      }),
    );
    const edited = "---\nname: Ada Morgan\n---\n\nEdited meanwhile.\n";
    state.setProfile(edited);

    expect(
      state.act({
        actionId: "import-profile",
        input: {},
        confirmationToken: confirmation.token,
      }),
    ).rejects.toThrow("stale");
    expect(await state.profile()).toBe(edited);
  });

  it("says so when LinkedIn refuses the token", async () => {
    const state = await fixture({
      accessToken: "expired",
      fetch: async () => new Response("Unauthorized", { status: 401 }),
    });

    const shown = await state.view();
    expect(shown).toContain("LinkedIn refused");
    expect(shown).not.toContain("import-profile");
    expect(importProfile(state)).rejects.toThrow();
    expect(await state.profile()).toBe(ownerProfile);
  });
});
